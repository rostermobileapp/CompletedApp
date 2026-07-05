import { db } from "./db";
import {
  drafts,
  draftPicks,
  draftBuddyPairs,
  draftChatMessages,
  draftKeepers,
  teams,
  teamMemberships,
  leagueMemberships,
  placeholderPlayers,
  users,
  type Draft,
  type DraftPick,
  type DraftBuddyPair,
  type User,
} from "@shared/schema";
import { eq, and, asc, desc, isNull, isNotNull, inArray, sql, or, gt } from "drizzle-orm";
import { buildAutoPickSchedule, rankToRound, type AutoPickSchedule, type FlaggedSlot } from "@shared/autoPickSchedule";

// How long after a pick the commissioner can undo it (milliseconds)
export const UNDO_WINDOW_MS = 30_000;

// In-memory map of active draft timers (draftId -> setTimeout handle)
const activeTimers = new Map<string, NodeJS.Timeout>();

// In-memory map of "all captains ready" auto-launch timers (draftId -> setTimeout handle)
const launchTimers = new Map<string, NodeJS.Timeout>();

// In-memory map of subscribed users per draft (draftId -> Set<userId>)
const draftSubscribers = new Map<string, Set<string>>();

// Tick interval handles for each active draft (1 sec ticks while running)
const tickIntervals = new Map<string, NodeJS.Timeout>();

type BroadcastFn = (userId: string, message: any) => boolean;

let broadcaster: BroadcastFn | null = null;
export function setDraftBroadcaster(fn: BroadcastFn) {
  broadcaster = fn;
}

function broadcastToDraft(draftId: string, message: any) {
  if (!broadcaster) return;
  const subs = draftSubscribers.get(draftId);
  if (!subs) return;
  for (const userId of Array.from(subs)) {
    try {
      broadcaster(userId, message);
    } catch (e) {
      // ignore broadcast failures per user
    }
  }
}

export function subscribeToDraft(draftId: string, userId: string) {
  let subs = draftSubscribers.get(draftId);
  if (!subs) {
    subs = new Set();
    draftSubscribers.set(draftId, subs);
  }
  subs.add(userId);
}

export function unsubscribeFromDraft(draftId: string, userId: string) {
  const subs = draftSubscribers.get(draftId);
  if (subs) subs.delete(userId);
}

export function unsubscribeUserFromAllDrafts(userId: string) {
  for (const subs of Array.from(draftSubscribers.values())) {
    subs.delete(userId);
  }
}

// Compute which team should pick at (round, pickInRound) given the order and style
export function computePickingTeam(
  draftOrder: string[],
  round: number,
  pickInRound: number,
  draftStyle: string
): string | null {
  if (!draftOrder.length) return null;
  const numTeams = draftOrder.length;
  const idx = pickInRound - 1;
  if (idx < 0 || idx >= numTeams) return null;

  if (draftStyle === "linear") {
    return draftOrder[idx];
  }
  if (draftStyle === "snake") {
    return round % 2 === 1 ? draftOrder[idx] : draftOrder[numTeams - 1 - idx];
  }
  if (draftStyle === "3rd_round_reversal") {
    // Snake but with the 3rd round same as 2nd (reversed) — i.e. rounds 1, 4, 5... are forward
    // Standard 3RR: R1 forward, R2 reverse, R3 reverse, R4 forward, R5 reverse, R6 forward...
    // After R3 it's snake again starting reverse
    if (round === 1) return draftOrder[idx];
    if (round === 2 || round === 3) return draftOrder[numTeams - 1 - idx];
    // Round 4+: snake starting forward on round 4
    const adjusted = round - 3;
    return adjusted % 2 === 1 ? draftOrder[idx] : draftOrder[numTeams - 1 - idx];
  }
  // auction & fallback - use linear order
  return draftOrder[idx];
}

// Compute next (round, pickInRound) starting from current, skipping forfeited rounds
export function computeNextTurn(
  draft: Draft,
  forfeited: Record<string, number[]>
): { round: number; pickInRound: number; complete: boolean; teamId: string | null } {
  const draftOrder = (draft.draftOrder as string[]) || [];
  const numTeams = draftOrder.length;
  const totalRounds = draft.totalRounds || 1;
  const style = draft.draftStyle || draft.roundType || "snake";

  let round = draft.currentRound;
  let pick = draft.currentTurn + 1;

  while (round <= totalRounds) {
    if (pick > numTeams) {
      round += 1;
      pick = 1;
      if (round > totalRounds) break;
    }
    const teamId = computePickingTeam(draftOrder, round, pick, style);
    if (!teamId) {
      pick += 1;
      continue;
    }
    // Check if this team has forfeited this round
    const forfeits = forfeited[teamId] || [];
    if (forfeits.includes(round)) {
      // Skip and remove from forfeit list (one-time)
      pick += 1;
      continue;
    }
    return { round, pickInRound: pick, complete: false, teamId };
  }
  return { round: totalRounds, pickInRound: numTeams, complete: true, teamId: null };
}

export interface DraftKeeper {
  teamId: string;
  userId: string | null;
  placeholderPlayerId: string | null;
}

export interface DraftStateBundle {
  draft: Draft;
  picks: DraftPick[];
  buddyPairs: DraftBuddyPair[];
  chatMessages: { id: string; userId: string; body: string; createdAt: Date }[];
  pickingTeamId: string | null;
  serverTime: number;
  /** Teams in the draft order, with fresh captainId values from the DB. */
  draftOrderTeams: { id: string; name: string; captainId: string | null }[];
  /** Keepers for this draft — players pre-assigned to their team, skipping the draft pool. */
  keepers: DraftKeeper[];
}

export async function getDraftStateBundle(draftId: string): Promise<DraftStateBundle | null> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return null;
  const picks = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftId))
    .orderBy(asc(draftPicks.pick), asc(draftPicks.pickedAt));
  const buddyPairs = await db.select().from(draftBuddyPairs).where(eq(draftBuddyPairs.draftId, draftId));
  const chatMessages = await db
    .select({
      id: draftChatMessages.id,
      userId: draftChatMessages.userId,
      body: draftChatMessages.body,
      createdAt: draftChatMessages.createdAt,
    })
    .from(draftChatMessages)
    .where(eq(draftChatMessages.draftId, draftId))
    .orderBy(asc(draftChatMessages.createdAt));

  const draftOrder = (draft.draftOrder as string[]) || [];
  const style = draft.draftStyle || draft.roundType || "snake";
  // Compute the picking team for both active and paused drafts so the UI
  // can always show which team is on the clock (or up next when paused).
  const pickingTeamId =
    draft.status === "active" || draft.status === "paused"
      ? computePickingTeam(draftOrder, draft.currentRound, draft.currentTurn, style)
      : null;

  // Build draftOrderTeams using captainAssignments as the primary source and
  // teams.captainId as a fallback. Some drafts are set up without going through
  // the captain-assignments wizard step, leaving captainAssignments as {} while
  // teams.captainId is correctly populated.
  const captainAssignmentsMap = (draft.captainAssignments as Record<string, string>) || {};
  const draftOrderTeams: { id: string; name: string; captainId: string | null }[] =
    draftOrder.length > 0
      ? (await db
          .select({ id: teams.id, name: teams.name, captainId: teams.captainId })
          .from(teams)
          .where(inArray(teams.id, draftOrder)))
          .map((t) => ({
            id: t.id,
            name: t.name,
            captainId: captainAssignmentsMap[t.id] ?? t.captainId ?? null,
          }))
      : [];

  const keeperRows = await db
    .select({
      teamId: draftKeepers.teamId,
      userId: draftKeepers.userId,
      placeholderPlayerId: draftKeepers.placeholderPlayerId,
    })
    .from(draftKeepers)
    .where(eq(draftKeepers.draftId, draftId));

  return {
    draft,
    picks,
    buddyPairs,
    chatMessages,
    pickingTeamId,
    serverTime: Date.now(),
    draftOrderTeams,
    keepers: keeperRows,
  };
}

export async function broadcastState(draftId: string) {
  const bundle = await getDraftStateBundle(draftId);
  if (!bundle) return;
  broadcastToDraft(draftId, { type: "draft_state", payload: bundle });
}

function clearDraftTimer(draftId: string) {
  const t = activeTimers.get(draftId);
  if (t) clearTimeout(t);
  activeTimers.delete(draftId);
  const i = tickIntervals.get(draftId);
  if (i) clearInterval(i);
  tickIntervals.delete(draftId);
}

async function handleTimerExpired(draftId: string) {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft || draft.status !== "active") return;

  const draftOrder = (draft.draftOrder as string[]) || [];
  const style = draft.draftStyle || draft.roundType || "snake";
  const pickingTeamId = computePickingTeam(draftOrder, draft.currentRound, draft.currentTurn, style);

  if (draft.timerExpiryRule === "halve_next" && pickingTeamId) {
    // New "buzzer" rule: on first expiry of THIS pick, grant the captain a 30s
    // extension AND mark their NEXT turn's timer to be halved as penalty.
    // On the SECOND expiry (i.e. they didn't pick during the extension either),
    // fall through to auto-pick a random available player so the draft moves on.
    const state = (draft.buzzerExtensionState as { currentPickExtended?: boolean; halvedNextTurn?: Record<string, boolean> } | null) || {};
    if (!state.currentPickExtended) {
      const newState = {
        currentPickExtended: true,
        halvedNextTurn: { ...(state.halvedNextTurn || {}), [pickingTeamId]: true },
      };
      const newDeadline = new Date(Date.now() + 30 * 1000);
      await db
        .update(drafts)
        .set({
          currentTurnDeadline: newDeadline,
          buzzerExtensionState: newState,
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, draftId));
      await startTurnTimer(draftId);
      await broadcastState(draftId);
      broadcastToDraft(draftId, {
        type: "draft_buzzer_extension",
        payload: {
          draftId,
          teamId: pickingTeamId,
          extensionSeconds: 30,
        },
      });
      return;
    }
    // Already extended once on this pick — fall through to auto-pick.
  }

  // Default: auto_pick - pick a random available player
  const available = await listAvailablePlayers(draftId);
  if (available.length === 0) {
    await completeDraft(draftId);
    return;
  }
  const random = available[Math.floor(Math.random() * available.length)];
  if (pickingTeamId) {
    await applyPick(draftId, pickingTeamId, random.userId, { expired: true });
  } else {
    await advanceTurn(draftId, true);
  }
}

export async function listAvailablePlayers(draftId: string): Promise<{ userId: string; isGoalie: boolean }[]> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return [];

  // All approved league members (team assignments from the previous season are
  // NOT used to gate eligibility — keepers and already-drafted players handle exclusion)
  const members = await db
    .select({
      userId: leagueMemberships.userId,
      isGoalie: leagueMemberships.isGoalie,
    })
    .from(leagueMemberships)
    .where(
      and(
        eq(leagueMemberships.leagueId, draft.leagueId),
        eq(leagueMemberships.status, "approved"),
      ),
    );

  // Already picked in this draft (real users via playerId, imported players via placeholderPlayerId)
  const drafted = await db
    .select({ playerId: draftPicks.playerId, placeholderPlayerId: draftPicks.placeholderPlayerId })
    .from(draftPicks)
    .where(and(eq(draftPicks.draftId, draftId)));
  const draftedSet = new Set<string>();
  for (const p of drafted) {
    if (p.playerId) draftedSet.add(p.playerId);
    if (p.placeholderPlayerId) draftedSet.add(`placeholder:${p.placeholderPlayerId}`);
  }

  // Keepers: designated to stay on their team, not pickable
  // Include both real-user keepers (userId) and placeholder keepers (placeholderPlayerId).
  const keeperRows = await db
    .select({ userId: draftKeepers.userId, placeholderPlayerId: draftKeepers.placeholderPlayerId })
    .from(draftKeepers)
    .where(eq(draftKeepers.draftId, draftId));
  const keeperSet = new Set<string>();
  for (const k of keeperRows) {
    if (k.userId) keeperSet.add(k.userId);
    if (k.placeholderPlayerId) keeperSet.add(`placeholder:${k.placeholderPlayerId}`);
  }

  // Players in the auto-pick schedule are in the live draft pool — they get
  // auto-picked at their scheduled round. This applies regardless of whether
  // skillRankingEnabled is set; captain/keeper/buddy schedules must fire even
  // when the general skill-ranking feature is off.
  const scheduledPlayerIds = new Set<string>();
  const schedule = draft.resolvedAutoPickSchedule as AutoPickSchedule | null;
  if (schedule) {
    for (const teamSlots of Object.values(schedule)) {
      for (const slot of Object.values(teamSlots)) {
        if (slot?.playerId) scheduledPlayerIds.add(slot.playerId);
      }
    }
  }

  const goalieAssignments = (draft.goalieAssignments as Record<string, string>) || {};
  const assignedGoalieIds = new Set(Object.values(goalieAssignments));

  // Captains are pre-assigned; they only enter the pool when a scheduled auto-pick
  // slot exists for them (type "self"), so maybeFireScheduledAutoPick can find them.
  // Manual pick routes have an additional guard that rejects captains even if they
  // appear here, preventing accidental or malicious manual drafting.
  // Fall back to teams.captainId for drafts where captainAssignments was never
  // filled in (wizard step skipped).
  const captainAssignments = (draft.captainAssignments as Record<string, string>) || {};
  const captainIds = new Set(Object.values(captainAssignments).filter(Boolean));
  const draftOrder = (draft.draftOrder as string[]) || [];
  const uncoveredTeamIds = draftOrder.filter((tid) => !captainAssignments[tid]);
  if (uncoveredTeamIds.length > 0) {
    const teamRows = await db
      .select({ captainId: teams.captainId })
      .from(teams)
      .where(inArray(teams.id, uncoveredTeamIds));
    for (const t of teamRows) {
      if (t.captainId) captainIds.add(t.captainId);
    }
  }

  const goalieMethod = draft.goalieMethod || "included_with_skaters";
  const realResult = members
    .filter((m) => m.userId !== null)
    .filter((m) => !draftedSet.has(m.userId!))
    .filter((m) => !keeperSet.has(m.userId!) || scheduledPlayerIds.has(m.userId!))
    .filter((m) => !assignedGoalieIds.has(m.userId!))
    .filter((m) => !captainIds.has(m.userId!) || scheduledPlayerIds.has(m.userId!))
    .filter((m) => {
      if (goalieMethod !== "included_with_skaters" && m.isGoalie) return false;
      return true;
    })
    .map((m) => ({ userId: m.userId!, isGoalie: m.isGoalie }));

  // Also include placeholder players (imported players without real accounts).
  const phPlayers = await db
    .select({ id: placeholderPlayers.id })
    .from(placeholderPlayers)
    .where(eq(placeholderPlayers.leagueId, draft.leagueId));

  const phResult = phPlayers
    .map((ph) => ({ userId: `placeholder:${ph.id}`, isGoalie: false }))
    .filter(({ userId }) => !draftedSet.has(userId))
    .filter(({ userId }) => !keeperSet.has(userId) || scheduledPlayerIds.has(userId));

  const result = [...realResult, ...phResult];
  console.log(`[Draft ${draftId}] listAvailablePlayers: ${result.length} available (${members.length} real, ${phPlayers.length} placeholder, ${draftedSet.size} drafted, ${keeperSet.size} keepers, goalieMethod=${goalieMethod})`);
  return result;
}

export async function makePick(
  draftId: string,
  pickerUserId: string,
  playerId: string
): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status !== "active") return { ok: false, error: "Draft is not active" };

  const draftOrder = (draft.draftOrder as string[]) || [];
  const style = draft.draftStyle || draft.roundType || "snake";
  const pickingTeamId = computePickingTeam(draftOrder, draft.currentRound, draft.currentTurn, style);
  if (!pickingTeamId) return { ok: false, error: "No active pick" };

  // Verify picker is captain of picking team OR commissioner of the league
  const [team] = await db.select().from(teams).where(eq(teams.id, pickingTeamId));
  if (!team) return { ok: false, error: "Team not found" };
  const isCaptain = team.captainId === pickerUserId;
  // Allow commissioner to pick on behalf
  // (commissioner check done in route layer to keep engine pure)

  console.log(`[Draft ${draftId}] makePick: picker=${pickerUserId}, player=${playerId}, pickingTeam=${pickingTeamId}, teamCaptain=${team.captainId}, isCaptain=${isCaptain}`);

  if (!isCaptain) {
    // Engine-level check; route may pre-allow commissioner override
    console.log(`[Draft ${draftId}] makePick FAILED: picker ${pickerUserId} is not captain of team ${pickingTeamId} (captain is ${team.captainId})`);
    return { ok: false, error: "You are not the captain of the picking team" };
  }

  // Block manual picks of captains — they are placed via scheduled auto-pick only.
  const captainAssignments = (draft.captainAssignments as Record<string, string>) || {};
  const allCaptainIds = new Set(Object.values(captainAssignments).filter(Boolean));
  if (allCaptainIds.has(playerId)) {
    return { ok: false, error: "Player not available" };
  }

  const available = await listAvailablePlayers(draftId);
  const found = available.find((a) => a.userId === playerId);
  console.log(`[Draft ${draftId}] makePick: ${available.length} players available, target player found=${!!found}`);
  if (!found) {
    return { ok: false, error: "Player not available" };
  }

  await applyPick(draftId, pickingTeamId, playerId);
  return { ok: true };
}

async function startTurnTimer(draftId: string) {
  clearDraftTimer(draftId);
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft || draft.status !== "active" || !draft.currentTurnDeadline) return;

  const ms = new Date(draft.currentTurnDeadline).getTime() - Date.now();

  // Schedule the expiry
  const t = setTimeout(() => {
    handleTimerExpired(draftId).catch((e) => {
      console.error("Draft timer expired handler error:", e);
    });
  }, Math.max(0, ms));
  activeTimers.set(draftId, t);

  // Broadcast 1-sec tick events for all subscribers to render countdown.
  // (Clients can also derive countdown from currentTurnDeadline + serverTime, but
  // we periodically tick to nudge UI in case of drift.)
  const interval = setInterval(() => {
    broadcastToDraft(draftId, {
      type: "draft_tick",
      payload: { draftId, serverTime: Date.now() },
    });
  }, 1000);
  tickIntervals.set(draftId, interval);
}

async function setTurnDeadline(draftId: string, durationSeconds?: number) {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;
  const draftOrder = (draft.draftOrder as string[]) || [];
  const style = draft.draftStyle || draft.roundType || "snake";
  const pickingTeamId = computePickingTeam(
    draftOrder,
    draft.currentRound,
    draft.currentTurn,
    style,
  );

  // Buzzer-rule penalty: if the picking captain was previously granted a 30s
  // extension on a prior turn, halve THIS turn's timer.
  const state = (draft.buzzerExtensionState as
    | { currentPickExtended?: boolean; halvedNextTurn?: Record<string, boolean> }
    | null) || {};
  const halvedMap = { ...(state.halvedNextTurn || {}) };
  let baseDur = durationSeconds ?? draft.timePerPick ?? 60;

  // Legacy compatibility: a draft saved with the old halve_next rule used a
  // single `nextTimerOverride` integer instead of the per-team halvedNextTurn
  // map. If we still see a legacy override on a halve_next draft, migrate it
  // by halving this turn's timer once and clearing the override below.
  const hasLegacyOverride =
    draft.timerExpiryRule === "halve_next" &&
    typeof draft.nextTimerOverride === "number" &&
    draft.nextTimerOverride > 0 &&
    pickingTeamId &&
    !halvedMap[pickingTeamId];
  if (hasLegacyOverride) {
    baseDur = Math.max(5, Math.floor(baseDur / 2));
  } else if (pickingTeamId && halvedMap[pickingTeamId]) {
    baseDur = Math.max(5, Math.floor(baseDur / 2));
    delete halvedMap[pickingTeamId];
  }
  const newState = {
    currentPickExtended: false,
    halvedNextTurn: halvedMap,
  };
  const deadline = new Date(Date.now() + baseDur * 1000);
  await db
    .update(drafts)
    .set({
      currentTurnDeadline: deadline,
      nextTimerOverride: null,
      buzzerExtensionState: newState,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));
}

async function maybeFireScheduledAutoPick(
  draftId: string,
  round: number,
  pickingTeamId: string | null,
): Promise<boolean> {
  if (!pickingTeamId) return false;
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft || draft.status !== "active") return false;

  // Rank-based auto-picks are only applicable to positional draft styles,
  // not auction, which uses a completely different pick mechanism.
  const style = draft.draftStyle || draft.roundType || "snake";
  if (style === "auction") return false;

  // Path 1: resolvedAutoPickSchedule (captain self-picks, real-user keepers, buddy pairs).
  const schedule = draft.resolvedAutoPickSchedule as AutoPickSchedule | null;
  if (schedule) {
    const slot = schedule[pickingTeamId]?.[String(round)];
    if (slot?.playerId) {
      const flagged = (draft.flaggedAutoPickSlots as FlaggedSlot[]) || [];
      if (!flagged.some((f) => f.round === round && f.teamId === pickingTeamId)) {
        const available = await listAvailablePlayers(draftId);
        const found = available.find((a) => a.userId === slot.playerId);
        if (found) {
          await applyPick(draftId, pickingTeamId, slot.playerId, { isAutoScheduled: true });
          return true;
        }
      }
    }
  }

  // Path 2: Placeholder keeper whose rank maps to this round.
  // draft_keepers.rank is never populated for placeholder keepers by either save path —
  // their rank lives in placeholder_players.skill_level instead.
  const skillScale = (draft.skillScale as "numbers" | "letters" | null) || "numbers";
  const phKeeperRows = await db
    .select()
    .from(draftKeepers)
    .where(
      and(
        eq(draftKeepers.draftId, draftId),
        eq(draftKeepers.teamId, pickingTeamId),
        isNotNull(draftKeepers.placeholderPlayerId),
      ),
    );
  for (const pk of phKeeperRows) {
    if (!pk.placeholderPlayerId) continue;
    // pk.placeholderPlayerId is stored as "placeholder:{uuid}" (with prefix).
    // Strip the prefix to query the placeholder_players table (id is bare UUID).
    const phUuid = pk.placeholderPlayerId.replace(/^placeholder:/, "");
    // Prefer the stamped rank on the keeper row; fall back to the player's skill_level.
    let rank = pk.rank;
    if (!rank) {
      const [ph] = await db
        .select({ skillLevel: placeholderPlayers.skillLevel })
        .from(placeholderPlayers)
        .where(eq(placeholderPlayers.id, phUuid))
        .limit(1);
      rank = ph?.skillLevel ?? null;
    }
    if (!rank) continue;
    if (rankToRound(rank, skillScale) !== round) continue;
    // Ensure it hasn't already been drafted.
    // draft_picks.placeholder_player_id stores the bare UUID (applyPick strips the prefix).
    const [alreadyPicked] = await db
      .select()
      .from(draftPicks)
      .where(
        and(
          eq(draftPicks.draftId, draftId),
          eq(draftPicks.placeholderPlayerId, phUuid),
        ),
      )
      .limit(1);
    if (alreadyPicked) continue;
    // Pass "placeholder:{uuid}" directly — applyPick expects the prefixed form.
    await applyPick(draftId, pickingTeamId, pk.placeholderPlayerId, { isAutoScheduled: true });
    return true;
  }

  return false;
}

async function advanceTurn(draftId: string, resetTimer: boolean) {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;
  const forfeited = (draft.forfeitedRounds as Record<string, number[]>) || {};
  const next = computeNextTurn(draft, forfeited);

  if (next.complete) {
    await completeDraft(draftId);
    return;
  }
  await db
    .update(drafts)
    .set({ currentRound: next.round, currentTurn: next.pickInRound, updatedAt: new Date() })
    .where(eq(drafts.id, draftId));
  if (resetTimer) await setTurnDeadline(draftId);

  // If a scheduled auto-pick fires, it calls applyPick → advanceTurn for the
  // next turn, so we skip timer start + broadcast here (the chain handles them).
  const didAutoPick = await maybeFireScheduledAutoPick(draftId, next.round, next.teamId ?? null);
  if (didAutoPick) return;

  await startTurnTimer(draftId);
  await broadcastState(draftId);
}

/**
 * Commissioner-initiated early termination — intentionally different from
 * natural completion.
 *
 * Natural completion  → all picks committed to team rosters.
 * Early termination   → picks are discarded; ONLY captains are placed on their
 *                       assigned teams.  Everyone else remains a free agent.
 *
 * Steps:
 *  1. Stop the timer and mark the draft completed.
 *  2. For each captain in captainAssignments: upsert into team_memberships
 *     (isCaptain = true) and set league_memberships.assignedTeamId.
 *  3. Broadcast the final state so all open clients see "completed".
 */
export async function terminateDraft(draftId: string) {
  clearDraftTimer(draftId);

  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;

  // Mark completed immediately so no more picks can land.
  await db
    .update(drafts)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(drafts.id, draftId));

  const captainAssignments = (draft.captainAssignments as Record<string, string>) || {};

  // Build the set of real captain userIds so we can exclude them from the reset.
  const captainUserIds = Object.values(captainAssignments).filter(
    (uid) => uid && !uid.startsWith("placeholder:"),
  );

  // ── Step 1: free ALL non-captain players in this league ──────────────────
  // Get all team IDs that belong to this league (so we only touch this league).
  const leagueTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.leagueId, draft.leagueId));
  const leagueTeamIds = leagueTeams.map((t) => t.id);

  if (leagueTeamIds.length > 0) {
    // Remove non-captains from team_memberships for every team in this league.
    const tmWhere =
      captainUserIds.length > 0
        ? and(
            inArray(teamMemberships.teamId, leagueTeamIds),
            sql`${teamMemberships.userId} NOT IN (${sql.join(
              captainUserIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
        : inArray(teamMemberships.teamId, leagueTeamIds);

    await db.delete(teamMemberships).where(tmWhere);
  }

  // Clear assignedTeamId for non-captains in league_memberships.
  const lmWhere =
    captainUserIds.length > 0
      ? and(
          eq(leagueMemberships.leagueId, draft.leagueId),
          sql`${leagueMemberships.userId} NOT IN (${sql.join(
            captainUserIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
      : eq(leagueMemberships.leagueId, draft.leagueId);

  await db.update(leagueMemberships).set({ assignedTeamId: null }).where(lmWhere);

  // ── Step 2: place only the captains on their teams ────────────────────────
  for (const [teamId, userId] of Object.entries(captainAssignments)) {
    if (!userId || userId.startsWith("placeholder:")) continue;

    // team_memberships
    const [existing] = await db
      .select()
      .from(teamMemberships)
      .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)))
      .limit(1);
    if (!existing) {
      await db.insert(teamMemberships).values({
        teamId,
        userId,
        isCaptain: true,
        status: "approved" as any,
      });
    } else {
      await db
        .update(teamMemberships)
        .set({ isCaptain: true })
        .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)));
    }

    // league_memberships.assignedTeamId
    await db
      .update(leagueMemberships)
      .set({ assignedTeamId: teamId })
      .where(
        and(eq(leagueMemberships.leagueId, draft.leagueId), eq(leagueMemberships.userId, userId)),
      );
  }

  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_completed", payload: { draftId } });
}

/**
 * Idempotently assign every drafted player to their team.
 *
 * Writes to BOTH stores so the rosters appear everywhere:
 *  1. `team_memberships` — direct team roster.
 *  2. `league_memberships.assignedTeamId` — the **authoritative** source the
 *     league management UI reads from (storage.getTeamsByLeague treats this
 *     as the priority source). Without this, drafted players showed up
 *     orphaned at the league level — the bug the user hit.
 *
 * Keeper assignments (draft_keepers rows with a real userId) are included so
 * that finalize is the single, idempotent source of truth for all roster
 * placements — drafted picks, commissioner goalies, and keepers alike.
 *
 * Returns the list of assignments applied for the *first time* this run (so
 * the caller can send notifications without spamming on idempotent re-runs),
 * with an `isKeeper` flag to let callers distinguish keepers from picks.
 */
export async function assignDraftedPlayersToTeams(
  draftId: string,
): Promise<{ userId: string; teamId: string; isKeeper: boolean }[]> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return [];

  const picks = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftId));

  // (userId, teamId, isKeeper) pairs to assign — drafted picks + commissioner
  // goalies + keepers (real-user keepers only; placeholder players have no
  // account to assign or notify).
  const goalieAssignments = (draft.goalieAssignments as Record<string, string>) || {};
  const pairs: { userId: string; teamId: string; isKeeper: boolean }[] = [];
  for (const pick of picks) {
    if (!pick.playerId || pick.forfeited) continue;
    pairs.push({ userId: pick.playerId, teamId: pick.teamId, isKeeper: false });
  }
  for (const [teamId, userId] of Object.entries(goalieAssignments)) {
    if (!userId) continue;
    // Placeholder goalies (format "placeholder:UUID") have no real user account;
    // skip them so we don't attempt a FK-violating insert into team_memberships.
    if (userId.startsWith("placeholder:")) continue;
    pairs.push({ userId, teamId, isKeeper: false });
  }

  // Keepers — only rows where userId is set (placeholder players have no account).
  const keeperRows = await db
    .select({ userId: draftKeepers.userId, teamId: draftKeepers.teamId })
    .from(draftKeepers)
    .where(eq(draftKeepers.draftId, draftId));
  for (const k of keeperRows) {
    if (!k.userId) continue;
    pairs.push({ userId: k.userId, teamId: k.teamId, isKeeper: true });
  }

  const newlyAssigned: { userId: string; teamId: string; isKeeper: boolean }[] = [];

  for (const { userId, teamId, isKeeper } of pairs) {
    // 1) team_memberships — insert if not present.
    const existingTM = await db
      .select()
      .from(teamMemberships)
      .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)))
      .limit(1);
    let didInsertOrUpdate = false;
    if (existingTM.length === 0) {
      await db.insert(teamMemberships).values({
        teamId,
        userId,
        isCaptain: false,
        status: "approved" as any,
      });
      didInsertOrUpdate = true;
    }

    // 2) league_memberships.assignedTeamId — set if not already pointing at
    //    this team. This is the field the league UI reads as authoritative.
    const [lm] = await db
      .select()
      .from(leagueMemberships)
      .where(
        and(
          eq(leagueMemberships.leagueId, draft.leagueId),
          eq(leagueMemberships.userId, userId),
        ),
      )
      .limit(1);
    if (lm && lm.assignedTeamId !== teamId) {
      await db
        .update(leagueMemberships)
        .set({ assignedTeamId: teamId })
        .where(eq(leagueMemberships.id, lm.id));
      didInsertOrUpdate = true;
    }

    if (didInsertOrUpdate) newlyAssigned.push({ userId, teamId, isKeeper });
  }

  return newlyAssigned;
}

/**
 * Send a push notification to each newly drafted player congratulating them
 * on the team they landed on. Best-effort — failures are swallowed per user
 * so one bad subscription doesn't block the rest.
 */
async function notifyDraftedPlayers(
  pairs: { userId: string; teamId: string }[],
  leagueId: string,
) {
  if (pairs.length === 0) return;
  // Lazy import to avoid a circular dep with storage at module load time.
  const { sendPushNotificationToUser } = await import("./oneSignalNotifications");
  const teamIds = Array.from(new Set(pairs.map((p) => p.teamId)));
  const teamRows = teamIds.length
    ? await db.select().from(teams).where(inArray(teams.id, teamIds))
    : [];
  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));

  await Promise.allSettled(
    pairs.map(({ userId, teamId }) => {
      const teamName = teamNameById.get(teamId) || "your new team";
      return sendPushNotificationToUser({
        userId,
        title: "🎉 You've been drafted!",
        message: `Congratulations — you were drafted to ${teamName}.`,
        data: { type: "draft_result", leagueId, teamId },
      }).catch((e) => {
        console.error(`[Draft] push notify failed for user ${userId}:`, e);
        return false;
      });
    }),
  );
}

/**
 * Send a push notification to each keeper that was just placed on their team
 * during finalization. Best-effort — failures are swallowed per user.
 */
async function notifyKeeperPlayers(
  pairs: { userId: string; teamId: string }[],
  leagueId: string,
) {
  if (pairs.length === 0) return;
  const { sendPushNotificationToUser } = await import("./oneSignalNotifications");
  const teamIds = Array.from(new Set(pairs.map((p) => p.teamId)));
  const teamRows = teamIds.length
    ? await db.select().from(teams).where(inArray(teams.id, teamIds))
    : [];
  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));

  await Promise.allSettled(
    pairs.map(({ userId, teamId }) => {
      const teamName = teamNameById.get(teamId) || "your team";
      return sendPushNotificationToUser({
        userId,
        title: "📋 You've been placed on a team!",
        message: `You've been kept and placed on ${teamName}.`,
        data: { type: "draft_result", leagueId, teamId },
      }).catch((e) => {
        console.error(`[Draft] keeper push notify failed for user ${userId}:`, e);
        return false;
      });
    }),
  );
}

async function completeDraft(draftId: string) {
  clearDraftTimer(draftId);
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;

  const wasAlreadyCompleted = draft.status === "completed";

  const newlyAssigned = await assignDraftedPlayersToTeams(draftId);

  if (!wasAlreadyCompleted) {
    await db
      .update(drafts)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(drafts.id, draftId));
  }

  // Push notifications to drafted picks are intentionally disabled per
  // commissioner request. Keepers, however, always get a placement notice.
  const newKeepers = newlyAssigned.filter((a) => a.isKeeper);
  void notifyKeeperPlayers(newKeepers, draft.leagueId);

  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_completed", payload: { draftId } });
}

/**
 * Public, idempotent re-run of the assignment + completion flow. Used by the
 * commissioner-facing "Finalize" button as a safety net in case the automatic
 * completion left anything unassigned (e.g. data added after completion, or
 * a legacy completed draft from before this assignment fix shipped).
 *
 * Keeper assignments are included alongside drafted picks. Keepers that have
 * not yet been placed on their teams are assigned here and receive a push
 * notification; subsequent runs are silent (idempotent).
 */
export async function finalizeDraft(draftId: string): Promise<{
  ok: boolean;
  assigned: number;
  keeperCount: number;
  pickCount: number;
}> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, assigned: 0, keeperCount: 0, pickCount: 0 };
  const newlyAssigned = await assignDraftedPlayersToTeams(draftId);
  if (draft.status !== "completed") {
    await db
      .update(drafts)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(drafts.id, draftId));
  }
  // Drafted pick notifications are disabled per commissioner request.
  // Keepers receive a placement notice when they are newly assigned.
  const newKeepers = newlyAssigned.filter((a) => a.isKeeper);
  void notifyKeeperPlayers(newKeepers, draft.leagueId);

  // Count total keepers and picks in this draft so the commissioner gets a
  // summary breakdown in the finalize dialog (newly-assigned vs already placed).
  const [keeperCountRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(draftKeepers)
    .where(eq(draftKeepers.draftId, draftId));
  const [pickCountRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(draftPicks)
    .where(and(eq(draftPicks.draftId, draftId), eq(draftPicks.forfeited, false)));

  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_completed", payload: { draftId } });
  return {
    ok: true,
    assigned: newlyAssigned.length,
    keeperCount: Number(keeperCountRow?.n ?? 0),
    pickCount: Number(pickCountRow?.n ?? 0),
  };
}

async function applyPick(
  draftId: string,
  teamId: string,
  playerId: string,
  opts?: { expired?: boolean; isAutoBuddy?: boolean; isAutoScheduled?: boolean }
) {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;
  const draftOrder = (draft.draftOrder as string[]) || [];
  const overall = (draft.currentRound - 1) * draftOrder.length + draft.currentTurn;

  const isPlaceholderPick = playerId.startsWith("placeholder:");
  const realPlayerId = isPlaceholderPick ? null : playerId;
  const phPickId = isPlaceholderPick ? playerId.replace("placeholder:", "") : null;

  await db.insert(draftPicks).values({
    draftId,
    teamId,
    playerId: realPlayerId,
    placeholderPlayerId: phPickId,
    round: draft.currentRound,
    pick: overall,
    pickInRound: draft.currentTurn,
    expiredAutoPick: !!opts?.expired,
    isAutoBuddy: !!opts?.isAutoBuddy,
    pickedAt: new Date(),
  });

  if (isPlaceholderPick) {
    // Placeholder player — update their team assignment in placeholderPlayers table.
    const phId = phPickId!;
    await db
      .update(placeholderPlayers)
      .set({ teamId })
      .where(eq(placeholderPlayers.id, phId));
  } else {
    // Real user — assign league membership and ensure teamMemberships row exists.
    const [lm] = await db
      .select()
      .from(leagueMemberships)
      .where(
        and(
          eq(leagueMemberships.leagueId, draft.leagueId),
          eq(leagueMemberships.userId, playerId),
        ),
      )
      .limit(1);
    if (lm) {
      await db
        .update(leagueMemberships)
        .set({ assignedTeamId: teamId })
        .where(eq(leagueMemberships.id, lm.id));
    }
    const existingTM = await db
      .select()
      .from(teamMemberships)
      .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, playerId)))
      .limit(1);
    if (existingTM.length === 0) {
      await db.insert(teamMemberships).values({
        teamId,
        userId: playerId,
        isCaptain: false,
        status: "approved" as any,
      });
    }
  }

  // Buddy enforcement: if this player has buddies, auto-pick them all to the
  // same team and mark this captain's NEXT round (one-time) as forfeited.
  if (!opts?.isAutoBuddy) {
    const buddyPairs = await db
      .select()
      .from(draftBuddyPairs)
      .where(eq(draftBuddyPairs.draftId, draftId));
    const matched = buddyPairs.find((bp) => (bp.userIds as string[]).includes(playerId));
    if (matched) {
      const otherIds = (matched.userIds as string[]).filter((u) => u !== playerId);
      const drafted = await db
        .select({ playerId: draftPicks.playerId })
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draftId));
      const draftedSet = new Set(drafted.map((d) => d.playerId).filter(Boolean) as string[]);
      // Auto-buddy adds share the SAME overall pick / round / pickInRound as
      // the parent pick, distinguished only by `isAutoBuddy=true`. This avoids
      // colliding with the next captain's overall pick number when the turn
      // advances. Insertion order (pickedAt) preserves stable sub-ordering.
      const baseTime = Date.now();
      let subOffset = 1;
      for (const buddyId of otherIds) {
        if (draftedSet.has(buddyId)) continue;
        await db.insert(draftPicks).values({
          draftId,
          teamId,
          playerId: buddyId,
          round: draft.currentRound,
          pick: overall,
          pickInRound: draft.currentTurn,
          isAutoBuddy: true,
          pickedAt: new Date(baseTime + subOffset),
        });
        subOffset += 1;
      }
      // Forfeit captain's next-round pick. Track on the draft row AND insert
      // a placeholder draft_picks row marked `forfeited=true` so the UI (which
      // renders forfeits from draft_picks) shows the skip explicitly.
      const forfeited = (draft.forfeitedRounds as Record<string, number[]>) || {};
      const nextRound = draft.currentRound + 1;
      if (nextRound <= (draft.totalRounds || 1)) {
        forfeited[teamId] = [...(forfeited[teamId] || []), nextRound];
        await db
          .update(drafts)
          .set({ forfeitedRounds: forfeited, updatedAt: new Date() })
          .where(eq(drafts.id, draftId));
        const draftOrder = (draft.draftOrder as string[]) || [];
        const numTeams = draftOrder.length || 1;
        const turnInNextRound = draftOrder.indexOf(teamId) + 1 || 1;
        const nextOverall = (nextRound - 1) * numTeams + turnInNextRound;
        await db.insert(draftPicks).values({
          draftId,
          teamId,
          playerId: null,
          round: nextRound,
          pick: nextOverall,
          pickInRound: turnInNextRound,
          forfeited: true,
          pickedAt: new Date(baseTime + subOffset),
        });
      }
    }
  }

  broadcastToDraft(draftId, {
    type: "draft_pick_made",
    payload: {
      draftId,
      teamId,
      playerId,
      round: draft.currentRound,
      pick: overall,
      isAutoPick: !!opts?.expired || !!opts?.isAutoScheduled,
    },
  });

  await advanceTurn(draftId, true);
}

// PUBLIC: Make a pick on behalf of a team (called from a route).
// Validates that pickerUserId is the captain of the picking team.
export async function commissionerPick(
  draftId: string,
  playerId: string
): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status !== "active") return { ok: false, error: "Draft is not active" };
  const draftOrder = (draft.draftOrder as string[]) || [];
  const style = draft.draftStyle || draft.roundType || "snake";
  const pickingTeamId = computePickingTeam(draftOrder, draft.currentRound, draft.currentTurn, style);
  if (!pickingTeamId) return { ok: false, error: "No active pick" };

  // Block manual picks of captains — they are placed via scheduled auto-pick only.
  const captainAssignments = (draft.captainAssignments as Record<string, string>) || {};
  const allCaptainIds = new Set(Object.values(captainAssignments).filter(Boolean));
  if (allCaptainIds.has(playerId)) {
    return { ok: false, error: "Player not available" };
  }

  const available = await listAvailablePlayers(draftId);
  const found = available.find((a) => a.userId === playerId);
  if (!found) {
    return { ok: false, error: "Player not available" };
  }
  await applyPick(draftId, pickingTeamId, playerId);
  return { ok: true };
}

/**
 * Validate start-time prerequisites without mutating draft status. Used by
 * both `requestCaptainReady` (lobby phase) and `startDraft` (active phase).
 */
async function validateStartPrereqs(draft: Draft): Promise<{ ok: boolean; error?: string }> {
  const draftOrder = (draft.draftOrder as string[]) || [];
  if (draftOrder.length === 0) return { ok: false, error: "Draft order is empty" };
  if (draft.skillRankingEnabled) {
    // Only auto-pick participants (captains, keepers, buddy-pair members) need tiers.
    const captainAssignments = (draft.captainAssignments as Record<string, string>) || {};
    const keepersByTeam = (draft.keepersByTeam as Record<string, { userId: string; rank?: string }[] | string[]>) || {};
    const buddyPairs = (draft.buddyPairs as { userIds: string[] }[] | string[][]) || [];

    const autoPickUserIds = new Set<string>();
    for (const uid of Object.values(captainAssignments)) {
      if (uid) autoPickUserIds.add(uid);
    }
    for (const entries of Object.values(keepersByTeam)) {
      for (const e of entries) {
        const uid = typeof e === "string" ? e : e.userId;
        if (uid) autoPickUserIds.add(uid);
      }
    }
    for (const pair of buddyPairs) {
      const uids = Array.isArray(pair) && typeof pair[0] === "string"
        ? (pair as string[])
        : (pair as { userIds: string[] }).userIds || [];
      for (const uid of uids) {
        if (uid && !uid.startsWith("placeholder:")) autoPickUserIds.add(uid);
      }
    }

    if (autoPickUserIds.size > 0) {
      const rows = await db
        .select({ userId: leagueMemberships.userId, skillLevel: leagueMemberships.skillLevel })
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, draft.leagueId),
            inArray(leagueMemberships.userId, Array.from(autoPickUserIds)),
          ),
        );
      const tierByUser = Object.fromEntries(rows.map((r) => [r.userId, r.skillLevel]));
      const missingTier = Array.from(autoPickUserIds).filter((uid) => !tierByUser[uid]);
      if (missingTier.length) {
        return {
          ok: false,
          error: `Cannot start: ${missingTier.length} auto-pick participant(s) are missing a skill tier`,
        };
      }
    }
  }
  if (draft.goalieMethod === "commissioner_assigned") {
    const assigned = (draft.goalieAssignments as Record<string, string>) || {};
    const unassigned = draftOrder.filter((tid) => !assigned[tid]);
    if (unassigned.length) {
      return {
        ok: false,
        error: `Cannot start: ${unassigned.length} team(s) are missing a goalie assignment`,
      };
    }
  }
  return { ok: true };
}

/**
 * Move a draft into the awaiting_captains lobby phase. Validates prerequisites
 * and seeds captainReadyState (the commissioner is implicitly ready). The
 * caller is expected to send out captain notifications.
 */
export async function requestCaptainReady(
  draftId: string,
  commissionerUserId: string,
): Promise<{ ok: boolean; error?: string; captainUserIds?: string[] }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status === "active") return { ok: false, error: "Draft already started" };
  if (draft.status === "completed") return { ok: false, error: "Draft already completed" };

  const validation = await validateStartPrereqs(draft);
  if (!validation.ok) return validation;

  const draftOrder = (draft.draftOrder as string[]) || [];
  const teamRows = await db.select().from(teams).where(inArray(teams.id, draftOrder));
  const captainIds = teamRows.map((t) => t.captainId).filter(Boolean) as string[];

  // Every captain in draftOrder — including a commissioner who is also a
  // captain — must explicitly tap READY in the lobby. We start with an empty
  // map so the begin gate stays honest for everyone.
  const ready: Record<string, boolean> = {};

  await db
    .update(drafts)
    .set({
      status: "awaiting_captains",
      captainReadyState: ready,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));

  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_awaiting_captains", payload: { draftId } });

  return { ok: true, captainUserIds: Array.from(new Set(captainIds)) };
}

/**
 * Cancel an awaiting_captains lobby back to `pending` (commissioner-only).
 * Used when the commissioner wants to abort the lobby and edit setup.
 */
export async function cancelDraftToPending(
  draftId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status !== "awaiting_captains") {
    return { ok: false, error: "Draft is not in the captain-ready lobby" };
  }
  // Cancel any pending auto-launch timer before resetting status
  cancelLaunchTimer(draftId);
  await db
    .update(drafts)
    .set({
      status: "pending",
      captainReadyState: {},
      launchAt: null,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));
  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_lobby_cancelled", payload: { draftId } });
  return { ok: true };
}

/**
 * Cancel any pending auto-launch timer for a draft (call before lobby cancel
 * or early begin so the timer doesn't fire late).
 */
function cancelLaunchTimer(draftId: string) {
  const t = launchTimers.get(draftId);
  if (t) clearTimeout(t);
  launchTimers.delete(draftId);
}

const LAUNCH_COUNTDOWN_MS = 30_000;

/**
 * Mark a captain as ready in the awaiting_captains lobby. Idempotent.
 * When the last captain marks ready a 30-second countdown is broadcast to all
 * clients via `draft_all_ready`, and the server automatically calls
 * startDraft after 30 seconds (commissioner can still begin early).
 */
export async function markCaptainReady(
  draftId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status !== "awaiting_captains") {
    return { ok: false, error: "Draft is not in the captain-ready lobby" };
  }
  const ready = ((draft.captainReadyState as Record<string, boolean>) || {});
  if (ready[userId]) {
    // Already ready — re-broadcast in case they missed a prior update
    await broadcastState(draftId);
    return { ok: true };
  }
  ready[userId] = true;

  // Check whether every team in the draft has a captain AND every captain is ready.
  // Use draft.captainAssignments as the authoritative source — it's always
  // in sync with what the wizard saved, avoiding any stale teams.captainId values.
  const draftOrder = (draft.draftOrder as string[]) || [];
  const captainAssignments = (draft.captainAssignments as Record<string, string>) || {};
  const captainIds = draftOrder
    .map((teamId) => captainAssignments[teamId])
    .filter((x): x is string => !!x);
  const allTeamsHaveCaptains =
    draftOrder.length > 0 && draftOrder.every((teamId) => !!captainAssignments[teamId]);
  const allReady =
    allTeamsHaveCaptains && captainIds.every((cid) => ready[cid]);

  if (allReady) {
    // Stamp a launchAt timestamp so any client that joins mid-countdown
    // still sees the correct target from the DB bundle.
    const launchAt = new Date(Date.now() + LAUNCH_COUNTDOWN_MS);
    await db
      .update(drafts)
      .set({ captainReadyState: ready, launchAt, updatedAt: new Date() })
      .where(eq(drafts.id, draftId));
    await broadcastState(draftId);
    broadcastToDraft(draftId, {
      type: "draft_all_ready",
      payload: { draftId, launchAt: launchAt.getTime() },
    });
    // Cancel any existing timer before scheduling a new one (idempotent)
    cancelLaunchTimer(draftId);
    launchTimers.set(
      draftId,
      setTimeout(async () => {
        launchTimers.delete(draftId);
        await startDraft(draftId);
      }, LAUNCH_COUNTDOWN_MS),
    );
  } else {
    await db
      .update(drafts)
      .set({ captainReadyState: ready, updatedAt: new Date() })
      .where(eq(drafts.id, draftId));
    await broadcastState(draftId);
  }

  return { ok: true };
}

export async function startDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status === "active") return { ok: true };
  if (draft.status === "completed") return { ok: false, error: "Draft is already completed" };

  // Server-authoritative lifecycle: in captain pick-mode, a draft must pass
  // through the captain-ready lobby (`awaiting_captains`) before it can
  // become `active` so the READY gate cannot be bypassed. In commissioner
  // pick-mode, no captains are picking, so we allow a direct
  // `pending → active` transition and skip the READY gate entirely.
  const isCommissionerMode = draft.pickMode === "commissioner";
  if (
    draft.status !== "awaiting_captains" &&
    !(isCommissionerMode && draft.status === "pending")
  ) {
    return {
      ok: false,
      error:
        "Draft must be in the captain-ready lobby before it can begin. Open the lobby first via Start.",
    };
  }

  const validation = await validateStartPrereqs(draft);
  if (!validation.ok) return validation;
  const draftOrder = (draft.draftOrder as string[]) || [];

  // Captain READY gate — only enforced in captain pick-mode. In commissioner
  // mode the commissioner makes every pick, so there's nothing for captains
  // to ready up for.
  if (!isCommissionerMode) {
    const captainAssignmentsForStart = (draft.captainAssignments as Record<string, string>) || {};
    const captainIds = draftOrder
      .map((teamId) => captainAssignmentsForStart[teamId])
      .filter((x): x is string => !!x);
    const ready = (draft.captainReadyState as Record<string, boolean>) || {};
    const notReady = captainIds.filter((cid) => !ready[cid]);
    if (notReady.length) {
      return {
        ok: false,
        error: `Cannot begin: ${notReady.length} captain(s) have not confirmed READY yet`,
      };
    }
  }

  // Random goalie draw if configured
  if (draft.goalieMethod === "random_draw") {
    const existing = (draft.goalieAssignments as Record<string, string>) || {};
    if (Object.keys(existing).length === 0) {
      const goalies = await db
        .select({ userId: leagueMemberships.userId })
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, draft.leagueId),
            eq(leagueMemberships.status, "approved"),
            eq(leagueMemberships.isGoalie, true)
          )
        );
      const shuffled = [...goalies].sort(() => Math.random() - 0.5);
      const assignments: Record<string, string> = {};
      for (let i = 0; i < draftOrder.length && i < shuffled.length; i++) {
        assignments[draftOrder[i]] = shuffled[i].userId;
      }
      await db
        .update(drafts)
        .set({ goalieAssignments: assignments, updatedAt: new Date() })
        .where(eq(drafts.id, draftId));
    }
  }

  // Cancel any pending auto-launch timer — commissioner may begin early
  cancelLaunchTimer(draftId);

  // Rebuild the auto-pick schedule at start time (not save time) so any
  // post-save keeper/skill-level edits are captured. Also stamps the current
  // skill-tier rank onto each draft_keepers row for record-keeping.
  // Auto-pick schedule applies to all positional styles (snake/linear/3rd_round_reversal).
  // It is built unconditionally — captain self-picks, keeper placements, and buddy
  // auto-picks must fire regardless of whether the general skillRankingEnabled flag is set.
  // Auction drafts use a completely different pick mechanism and are excluded.
  const startDraftStyle = draft.draftStyle || draft.roundType || "snake";
  let freshSchedule: AutoPickSchedule | null = null;
  if (startDraftStyle !== "auction") {
    const memberships = await db
      .select({ userId: leagueMemberships.userId, skillLevel: leagueMemberships.skillLevel })
      .from(leagueMemberships)
      .where(and(eq(leagueMemberships.leagueId, draft.leagueId), eq(leagueMemberships.status, "approved")));
    const skillLevels: Record<string, string> = {};
    for (const m of memberships) {
      if (m.userId && m.skillLevel) skillLevels[m.userId] = m.skillLevel;
    }

    const keeperRows = await db.select().from(draftKeepers).where(eq(draftKeepers.draftId, draftId));
    const keepersByTeam: Record<string, { userId: string; rank?: string }[]> = {};
    for (const k of keeperRows) {
      if (k.userId) {
        // Real-user keeper: stamp current skill rank onto the row for record-keeping.
        const rank = skillLevels[k.userId];
        if (!keepersByTeam[k.teamId]) keepersByTeam[k.teamId] = [];
        keepersByTeam[k.teamId].push({ userId: k.userId, rank: rank || k.rank || undefined });
        if (rank && rank !== k.rank) {
          await db.update(draftKeepers).set({ rank }).where(eq(draftKeepers.id, k.id));
        }
      } else if (k.placeholderPlayerId) {
        // draft_keepers.placeholder_player_id stores "placeholder:{uuid}" (with prefix).
        // Strip the prefix to query placeholder_players (id is bare UUID),
        // and use the value as-is for keepersByTeam (buildAutoPickSchedule expects the prefixed form).
        const phUuid = k.placeholderPlayerId.replace(/^placeholder:/, "");
        // draft_keepers.rank is never populated for placeholder keepers — fall back to skill_level.
        let phRank = k.rank;
        if (!phRank) {
          const [ph] = await db
            .select({ skillLevel: placeholderPlayers.skillLevel })
            .from(placeholderPlayers)
            .where(eq(placeholderPlayers.id, phUuid))
            .limit(1);
          phRank = ph?.skillLevel ?? null;
        }
        if (!keepersByTeam[k.teamId]) keepersByTeam[k.teamId] = [];
        keepersByTeam[k.teamId].push({
          userId: k.placeholderPlayerId,   // already "placeholder:{uuid}"
          rank: phRank || undefined,
        });
      }
    }

    const buddyRows = await db.select().from(draftBuddyPairs).where(eq(draftBuddyPairs.draftId, draftId));
    const buddyPairs = buddyRows.map((r) => r.userIds as string[]);

    // Merge persisted buddy ranks from draft_buddy_pairs.ranks into a flat userId→rank map.
    const buddyRanksByUser: Record<string, string> = {};
    for (const row of buddyRows) {
      const persisted = row.ranks as Record<string, string> | null;
      if (!persisted) continue;
      for (const [uid, rank] of Object.entries(persisted)) {
        if (rank && !buddyRanksByUser[uid]) buddyRanksByUser[uid] = rank;
      }
    }

    // Server-side invariant: block start if any team has duplicate keeper ranks.
    // Only enforced when skillRankingEnabled — without it, ranks may be absent/partial.
    if (draft.skillRankingEnabled) {
      for (const [teamId, keepers] of Object.entries(keepersByTeam)) {
        const rankCount = new Map<string, number>();
        for (const k of keepers) {
          if (!k.rank) continue;
          rankCount.set(k.rank, (rankCount.get(k.rank) || 0) + 1);
        }
        const dupes = [...rankCount.entries()].filter(([, n]) => n > 1).map(([r]) => r);
        if (dupes.length > 0) {
          return {
            ok: false,
            error: `Team ${teamId} has keepers with duplicate skill ranks (${dupes.join(", ")}). Resolve before starting.`,
          };
        }
      }
    }

    // Default to "numbers" scale when not explicitly set so buildAutoPickSchedule
    // can still map captain/keeper/buddy ranks to rounds even without full skill ranking.
    const skillScale = (draft.skillScale as "numbers" | "letters" | null) || "numbers";
    const builtSchedule = buildAutoPickSchedule({
      draftOrder,
      totalRounds: draft.totalRounds,
      captainAssignments: (draft.captainAssignments as Record<string, string>) || {},
      skillLevels,
      skillScale,
      keepersByTeam,
      buddyPairs,
      buddyRanksByUser,
    });

    // Only persist the schedule if it contains at least one slot, so we don't
    // silently overwrite a previously valid schedule with an empty one.
    const hasSlots = Object.values(builtSchedule).some(
      (slots) => Object.keys(slots).length > 0,
    );
    freshSchedule = hasSlots ? builtSchedule : null;
  }

  await db
    .update(drafts)
    .set({
      status: "active",
      startedAt: draft.startedAt || new Date(),
      currentRound: 1,
      currentTurn: 1,
      launchAt: null,
      updatedAt: new Date(),
      ...(freshSchedule !== null ? { resolvedAutoPickSchedule: freshSchedule } : {}),
    })
    .where(eq(drafts.id, draftId));
  await setTurnDeadline(draftId);

  // Check if round 1 / pick 1 has a scheduled auto-pick before starting the timer
  const firstTeamId = draftOrder[0] ?? null;
  if (firstTeamId && freshSchedule) {
    const didAutoPick = await maybeFireScheduledAutoPick(draftId, 1, firstTeamId);
    if (didAutoPick) {
      broadcastToDraft(draftId, { type: "draft_started", payload: { draftId } });
      return { ok: true };
    }
  }

  await startTurnTimer(draftId);
  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_started", payload: { draftId } });
  return { ok: true };
}

export async function pauseDraft(draftId: string): Promise<{ ok: boolean }> {
  // Stop the in-memory timeout/interval so no expiry handler will fire while
  // paused.
  clearDraftTimer(draftId);
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false } as any;

  // Snapshot the remaining seconds at pause-time and stash it in
  // `nextTimerOverride` so we can resume from the exact same point. We also
  // null out `currentTurnDeadline` so the client's `now - deadline` countdown
  // freezes immediately (otherwise it kept ticking down to 0:00 even though
  // the server timer was halted).
  let remainingSec: number | null = null;
  if (draft.currentTurnDeadline) {
    const ms = new Date(draft.currentTurnDeadline).getTime() - Date.now();
    remainingSec = Math.max(1, Math.ceil(ms / 1000));
  }

  await db
    .update(drafts)
    .set({
      status: "paused",
      currentTurnDeadline: null,
      nextTimerOverride: remainingSec,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));
  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_paused", payload: { draftId } });
  return { ok: true };
}

export async function resumeDraft(draftId: string): Promise<{ ok: boolean }> {
  // If we paused mid-turn we have a remaining-seconds snapshot stored in
  // `nextTimerOverride`. Resume from exactly that, instead of resetting to a
  // full `timePerPick` window (which would unfairly give the captain on the
  // clock a brand-new pick window every time the commissioner pauses).
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false } as any;
  const resumeSec =
    typeof draft.nextTimerOverride === "number" && draft.nextTimerOverride > 0
      ? draft.nextTimerOverride
      : draft.timePerPick || 60;
  const newDeadline = new Date(Date.now() + resumeSec * 1000);

  await db
    .update(drafts)
    .set({
      status: "active",
      currentTurnDeadline: newDeadline,
      nextTimerOverride: null,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));

  // Check whether the turn we're resuming onto has a scheduled auto-pick
  // (e.g. a placeholder keeper) — if so, fire it instead of opening the timer.
  const draftOrder = (draft.draftOrder as string[]) || [];
  const draftStyle = draft.draftStyle || draft.roundType || "snake";
  const pickingTeamId = computePickingTeam(draftOrder, draft.currentRound, draft.currentTurn, draftStyle);
  const didAutoPick = await maybeFireScheduledAutoPick(draftId, draft.currentRound, pickingTeamId);
  if (!didAutoPick) {
    await startTurnTimer(draftId);
    await broadcastState(draftId);
  }
  return { ok: true };
}

export async function postChat(draftId: string, userId: string, body: string) {
  const trimmed = body.trim().slice(0, 500);
  if (!trimmed) return null;
  const [row] = await db
    .insert(draftChatMessages)
    .values({ draftId, userId, body: trimmed })
    .returning();
  broadcastToDraft(draftId, { type: "draft_chat", payload: row });
  return row;
}

/**
 * Commissioner-only: undo the most recent primary pick made within
 * UNDO_WINDOW_MS. Reverts the pick row, any buddy auto-picks that were created
 * as a side-effect, and the buddy-forfeit placeholder for the next round.
 * Restores currentRound/currentTurn and restarts the turn timer.
 */
export async function undoLastPick(
  draftId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status !== "active") {
    return { ok: false, error: "Can only undo while the draft is active" };
  }

  // Find the most recent primary pick (not auto-buddy, not forfeited, has a player).
  const recent = await db
    .select()
    .from(draftPicks)
    .where(
      and(
        eq(draftPicks.draftId, draftId),
        eq(draftPicks.isAutoBuddy, false),
        eq(draftPicks.forfeited, false),
      ),
    )
    .orderBy(desc(draftPicks.pickedAt))
    .limit(1);

  const lastPick = recent[0];
  if (!lastPick || !lastPick.playerId || !lastPick.pickedAt) {
    return { ok: false, error: "No picks to undo" };
  }

  const ageMs = Date.now() - new Date(lastPick.pickedAt).getTime();
  if (ageMs > UNDO_WINDOW_MS) {
    return { ok: false, error: "Undo window has expired" };
  }

  // Identify auto-buddy children for this primary pick.
  const buddyChildren = await db
    .select()
    .from(draftPicks)
    .where(
      and(
        eq(draftPicks.draftId, draftId),
        eq(draftPicks.teamId, lastPick.teamId),
        eq(draftPicks.round, lastPick.round),
        eq(draftPicks.pickInRound, lastPick.pickInRound),
        eq(draftPicks.isAutoBuddy, true),
      ),
    );

  // If buddies were enforced, a forfeit placeholder was inserted for next round.
  let buddyForfeit: DraftPick | null = null;
  if (buddyChildren.length > 0) {
    const candidates = await db
      .select()
      .from(draftPicks)
      .where(
        and(
          eq(draftPicks.draftId, draftId),
          eq(draftPicks.teamId, lastPick.teamId),
          eq(draftPicks.round, lastPick.round + 1),
          eq(draftPicks.forfeited, true),
          isNull(draftPicks.playerId),
        ),
      );
    buddyForfeit = candidates[0] || null;
  }

  await db.transaction(async (tx) => {
    for (const c of buddyChildren) {
      await tx.delete(draftPicks).where(eq(draftPicks.id, c.id));
    }
    if (buddyForfeit) {
      await tx.delete(draftPicks).where(eq(draftPicks.id, buddyForfeit.id));
    }
    await tx.delete(draftPicks).where(eq(draftPicks.id, lastPick.id));

    // Remove the buddy-induced forfeit entry from forfeitedRounds (one occurrence).
    const forfeited = { ...((draft.forfeitedRounds as Record<string, number[]>) || {}) };
    if (buddyForfeit && forfeited[lastPick.teamId]) {
      const arr = [...forfeited[lastPick.teamId]];
      const idx = arr.indexOf(lastPick.round + 1);
      if (idx >= 0) arr.splice(idx, 1);
      if (arr.length) forfeited[lastPick.teamId] = arr;
      else delete forfeited[lastPick.teamId];
    }

    const newDeadline = new Date(Date.now() + (draft.timePerPick || 60) * 1000);
    await tx
      .update(drafts)
      .set({
        currentRound: lastPick.round,
        currentTurn: lastPick.pickInRound,
        currentTurnDeadline: newDeadline,
        nextTimerOverride: null,
        forfeitedRounds: forfeited,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draftId));
  });

  await startTurnTimer(draftId);
  await broadcastState(draftId);
  broadcastToDraft(draftId, {
    type: "draft_pick_undone",
    payload: {
      draftId,
      teamId: lastPick.teamId,
      playerId: lastPick.playerId,
      round: lastPick.round,
      pickInRound: lastPick.pickInRound,
    },
  });

  return { ok: true };
}

/**
 * Commissioner-only: reject (flag) any pick by ID regardless of age.
 * The pick is deleted, any auto-buddy children and their forfeit row are
 * removed, and the draft reverts to that pick's round/turn so it can be
 * replayed as a manual pick. The rejection is logged to `flaggedPicks` jsonb.
 */
export async function flagPick(
  draftId: string,
  pickId: string,
  flaggedBy: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status !== "active") {
    return { ok: false, error: "Can only flag picks while the draft is active" };
  }

  const [pick] = await db.select().from(draftPicks).where(eq(draftPicks.id, pickId));
  if (!pick || !pick.playerId) return { ok: false, error: "Pick not found" };
  // Verify this pick belongs to the draft being acted on — prevents cross-draft pick mutations.
  if (pick.draftId !== draftId) return { ok: false, error: "Pick does not belong to this draft" };
  if (pick.isAutoBuddy) {
    return { ok: false, error: "Cannot flag auto-buddy picks directly — flag the primary pick" };
  }
  if (pick.forfeited) return { ok: false, error: "Cannot flag a forfeited slot" };

  // Collect later picks (slots after the flagged pick by round/pickInRound order).
  // These must also be deleted to maintain consistent slot ordering — a safe rollback.
  const laterNonForfeitedPicks = await db
    .select()
    .from(draftPicks)
    .where(
      and(
        eq(draftPicks.draftId, draftId),
        eq(draftPicks.forfeited, false),
        isNotNull(draftPicks.playerId),
        or(
          gt(draftPicks.round, pick.round),
          and(eq(draftPicks.round, pick.round), gt(draftPicks.pickInRound, pick.pickInRound)),
        ),
      ),
    );

  // Buddy children for the flagged pick (auto-buddy picks in the same slot).
  const buddyChildren = await db.select().from(draftPicks).where(
    and(
      eq(draftPicks.draftId, draftId),
      eq(draftPicks.teamId, pick.teamId),
      eq(draftPicks.round, pick.round),
      eq(draftPicks.pickInRound, pick.pickInRound),
      eq(draftPicks.isAutoBuddy, true),
    ),
  );

  let buddyForfeit: DraftPick | null = null;
  if (buddyChildren.length > 0) {
    const candidates = await db.select().from(draftPicks).where(
      and(
        eq(draftPicks.draftId, draftId),
        eq(draftPicks.teamId, pick.teamId),
        eq(draftPicks.round, pick.round + 1),
        eq(draftPicks.forfeited, true),
        isNull(draftPicks.playerId),
      ),
    );
    buddyForfeit = candidates[0] || null;
  }

  const flagEntry = {
    pickId: pick.id,
    playerId: pick.playerId,
    teamId: pick.teamId,
    round: pick.round,
    pickInRound: pick.pickInRound,
    flaggedBy,
    flaggedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };

  // Collect ALL affected (userId, teamId) pairs: flagged pick + buddy children + all later picks.
  const affectedPairs: { userId: string; teamId: string }[] = [];
  if (pick.playerId) affectedPairs.push({ userId: pick.playerId, teamId: pick.teamId });
  for (const c of buddyChildren) {
    if (c.playerId) affectedPairs.push({ userId: c.playerId, teamId: c.teamId });
  }
  for (const lp of laterNonForfeitedPicks) {
    if (lp.playerId) affectedPairs.push({ userId: lp.playerId, teamId: lp.teamId });
  }

  await db.transaction(async (tx) => {
    // Delete all later picks first (rollback subsequent rounds/turns).
    if (laterNonForfeitedPicks.length > 0) {
      await tx.delete(draftPicks).where(
        inArray(draftPicks.id, laterNonForfeitedPicks.map((p) => p.id)),
      );
    }
    // Delete buddy children and forfeit row for the flagged pick.
    for (const c of buddyChildren) {
      await tx.delete(draftPicks).where(eq(draftPicks.id, c.id));
    }
    if (buddyForfeit) {
      await tx.delete(draftPicks).where(eq(draftPicks.id, buddyForfeit.id));
    }
    // Delete the flagged pick itself.
    await tx.delete(draftPicks).where(eq(draftPicks.id, pick.id));

    // Reverse membership side-effects for each affected player.
    // If no other picks remain for them on this team and they're not a keeper, undo assignment.
    for (const { userId, teamId } of affectedPairs) {
      const remainingPicks = await tx
        .select({ id: draftPicks.id })
        .from(draftPicks)
        .where(
          and(
            eq(draftPicks.draftId, draftId),
            eq(draftPicks.playerId, userId),
            eq(draftPicks.teamId, teamId),
          ),
        );
      if (remainingPicks.length > 0) continue;

      const keeperCheck = await tx
        .select({ id: draftKeepers.id })
        .from(draftKeepers)
        .where(
          and(
            eq(draftKeepers.draftId, draftId),
            eq(draftKeepers.userId, userId),
            eq(draftKeepers.teamId, teamId),
          ),
        )
        .limit(1);
      if (keeperCheck.length > 0) continue;

      await tx
        .delete(teamMemberships)
        .where(
          and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)),
        );
      await tx
        .update(leagueMemberships)
        .set({ assignedTeamId: null })
        .where(
          and(
            eq(leagueMemberships.leagueId, draft.leagueId),
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.assignedTeamId, teamId),
          ),
        );
    }

    const forfeited = { ...((draft.forfeitedRounds as Record<string, number[]>) || {}) };
    if (buddyForfeit && forfeited[pick.teamId]) {
      const arr = [...forfeited[pick.teamId]];
      const idx = arr.indexOf(pick.round + 1);
      if (idx >= 0) arr.splice(idx, 1);
      if (arr.length) forfeited[pick.teamId] = arr;
      else delete forfeited[pick.teamId];
    }

    const existingFlags = (draft.flaggedPicks as any[]) || [];
    const existingSlotFlags = (draft.flaggedAutoPickSlots as { round: number; teamId: string }[]) || [];
    const slotAlreadyFlagged = existingSlotFlags.some(
      (s) => s.round === pick.round && s.teamId === pick.teamId,
    );
    const updatedSlotFlags = slotAlreadyFlagged
      ? existingSlotFlags
      : [...existingSlotFlags, { round: pick.round, teamId: pick.teamId }];
    const newDeadline = new Date(Date.now() + (draft.timePerPick || 60) * 1000);
    await tx
      .update(drafts)
      .set({
        currentRound: pick.round,
        currentTurn: pick.pickInRound,
        currentTurnDeadline: newDeadline,
        nextTimerOverride: null,
        forfeitedRounds: forfeited,
        flaggedPicks: [...existingFlags, flagEntry],
        flaggedAutoPickSlots: updatedSlotFlags,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draftId));
  });

  await startTurnTimer(draftId);
  await broadcastState(draftId);
  broadcastToDraft(draftId, {
    type: "draft_pick_flagged",
    payload: { draftId, ...flagEntry },
  });
  return { ok: true };
}

// Restart timers for any draft in 'active' or 'awaiting_captains' status (called on server boot)
export async function rehydrateActiveDraftTimers() {
  const active = await db
    .select()
    .from(drafts)
    .where(inArray(drafts.status, ["active", "awaiting_captains"]));

  for (const draft of active) {
    // Rehydrate the "all captains ready" countdown for lobbies that were mid-countdown
    if (draft.status === "awaiting_captains" && draft.launchAt) {
      const msRemaining = new Date(draft.launchAt).getTime() - Date.now();
      if (msRemaining > 0) {
        // Still time left — resume the auto-launch timer from where it was
        cancelLaunchTimer(draft.id);
        launchTimers.set(
          draft.id,
          setTimeout(async () => {
            launchTimers.delete(draft.id);
            await startDraft(draft.id);
          }, msRemaining),
        );
      } else {
        // Countdown already elapsed during downtime — fire immediately
        startDraft(draft.id).catch((e) =>
          console.error("[Draft] Rehydrate launch error:", e),
        );
      }
    }

    // Rehydrate turn timers for active drafts
    if (draft.status === "active") {
      if (draft.currentTurnDeadline && new Date(draft.currentTurnDeadline).getTime() > Date.now()) {
        await startTurnTimer(draft.id);
      } else if (draft.currentTurnDeadline) {
        // Timer already expired during downtime — force expiry handler now
        handleTimerExpired(draft.id).catch((e) => console.error("Rehydrate expiry error:", e));
      } else {
        // No deadline set; set one and start
        await setTurnDeadline(draft.id);
        await startTurnTimer(draft.id);
      }
    }
  }
}
