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
  users,
  type Draft,
  type DraftPick,
  type DraftBuddyPair,
  type User,
} from "@shared/schema";
import { eq, and, asc, desc, isNull, inArray } from "drizzle-orm";

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

export interface DraftStateBundle {
  draft: Draft;
  picks: DraftPick[];
  buddyPairs: DraftBuddyPair[];
  chatMessages: { id: string; userId: string; body: string; createdAt: Date }[];
  pickingTeamId: string | null;
  serverTime: number;
  /** Teams in the draft order, with fresh captainId values from the DB. */
  draftOrderTeams: { id: string; name: string; captainId: string | null }[];
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
  const pickingTeamId =
    draft.status === "active"
      ? computePickingTeam(draftOrder, draft.currentRound, draft.currentTurn, style)
      : null;

  // Always include the teams from draftOrder with authoritative captainId from
  // draft.captainAssignments (persisted on the draft record). This eliminates
  // any dependency on teams.captainId being up-to-date.
  const captainAssignmentsMap = (draft.captainAssignments as Record<string, string>) || {};
  const draftOrderTeams: { id: string; name: string; captainId: string | null }[] =
    draftOrder.length > 0
      ? (await db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, draftOrder)))
          .map((t) => ({ id: t.id, name: t.name, captainId: captainAssignmentsMap[t.id] ?? null }))
      : [];

  return {
    draft,
    picks,
    buddyPairs,
    chatMessages,
    pickingTeamId,
    serverTime: Date.now(),
    draftOrderTeams,
  };
}

async function broadcastState(draftId: string) {
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

  // Free agents only: approved league members not yet assigned to a team
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
        isNull(leagueMemberships.assignedTeamId),
      ),
    );

  // Already picked in this draft
  const drafted = await db
    .select({ playerId: draftPicks.playerId })
    .from(draftPicks)
    .where(and(eq(draftPicks.draftId, draftId)));
  const draftedSet = new Set<string>();
  for (const p of drafted) {
    if (p.playerId) draftedSet.add(p.playerId);
  }

  // Keepers: designated to stay on their team, not pickable
  const keeperRows = await db
    .select({ userId: draftKeepers.userId })
    .from(draftKeepers)
    .where(eq(draftKeepers.draftId, draftId));
  const keeperSet = new Set<string>(keeperRows.map((k) => k.userId).filter(Boolean) as string[]);

  const goalieAssignments = (draft.goalieAssignments as Record<string, string>) || {};
  const assignedGoalieIds = new Set(Object.values(goalieAssignments));

  const goalieMethod = draft.goalieMethod || "included_with_skaters";
  return members
    .filter((m) => !draftedSet.has(m.userId))
    .filter((m) => !keeperSet.has(m.userId))
    .filter((m) => !assignedGoalieIds.has(m.userId))
    .filter((m) => {
      // if commissioner_assigned or random_draw, exclude goalies entirely from pickable pool
      if (goalieMethod !== "included_with_skaters" && m.isGoalie) return false;
      return true;
    })
    .map((m) => ({ userId: m.userId, isGoalie: m.isGoalie }));
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
  await startTurnTimer(draftId);
  await broadcastState(draftId);
}

// Public alias used by the /terminate route so the commissioner can end
// the draft early; produces identical results to a natural completion.
export async function terminateDraft(draftId: string) {
  return completeDraft(draftId);
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
 * Returns the list of (userId, teamId) assignments that were *applied for the
 * first time* this run, so the caller can fire push notifications without
 * spamming users on idempotent re-runs.
 */
export async function assignDraftedPlayersToTeams(
  draftId: string,
): Promise<{ userId: string; teamId: string }[]> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return [];

  const picks = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftId));

  // (userId, teamId) pairs to assign — drafted picks + commissioner goalies.
  const goalieAssignments = (draft.goalieAssignments as Record<string, string>) || {};
  const pairs: { userId: string; teamId: string }[] = [];
  for (const pick of picks) {
    if (!pick.playerId || pick.forfeited) continue;
    pairs.push({ userId: pick.playerId, teamId: pick.teamId });
  }
  for (const [teamId, userId] of Object.entries(goalieAssignments)) {
    if (!userId) continue;
    pairs.push({ userId, teamId });
  }

  const newlyAssigned: { userId: string; teamId: string }[] = [];

  for (const { userId, teamId } of pairs) {
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

    if (didInsertOrUpdate) newlyAssigned.push({ userId, teamId });
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

async function completeDraft(draftId: string) {
  clearDraftTimer(draftId);
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;

  // Already completed? Don't re-notify, but still expose a way to re-run
  // assignment via the public `finalizeDraft` helper below.
  const wasAlreadyCompleted = draft.status === "completed";

  const newlyAssigned = await assignDraftedPlayersToTeams(draftId);

  if (!wasAlreadyCompleted) {
    await db
      .update(drafts)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(drafts.id, draftId));
  }

  // Push notifications to drafted players are intentionally disabled per
  // commissioner request — players should not be pinged when their pick lands.
  void newlyAssigned;

  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_completed", payload: { draftId } });
}

/**
 * Public, idempotent re-run of the assignment + completion flow. Used by the
 * commissioner-facing "Finalize" button as a safety net in case the automatic
 * completion left anything unassigned (e.g. data added after completion, or
 * a legacy completed draft from before this assignment fix shipped).
 */
export async function finalizeDraft(draftId: string): Promise<{
  ok: boolean;
  assigned: number;
}> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, assigned: 0 };
  const newlyAssigned = await assignDraftedPlayersToTeams(draftId);
  if (draft.status !== "completed") {
    await db
      .update(drafts)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(drafts.id, draftId));
  }
  // Push notifications to drafted players are intentionally disabled per
  // commissioner request — finalize is now silent for the drafted players.
  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_completed", payload: { draftId } });
  return { ok: true, assigned: newlyAssigned.length };
}

async function applyPick(
  draftId: string,
  teamId: string,
  playerId: string,
  opts?: { expired?: boolean; isAutoBuddy?: boolean }
) {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;
  const draftOrder = (draft.draftOrder as string[]) || [];
  const overall = (draft.currentRound - 1) * draftOrder.length + draft.currentTurn;

  await db.insert(draftPicks).values({
    draftId,
    teamId,
    playerId,
    round: draft.currentRound,
    pick: overall,
    pickInRound: draft.currentTurn,
    expiredAutoPick: !!opts?.expired,
    isAutoBuddy: !!opts?.isAutoBuddy,
    pickedAt: new Date(),
  });

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
      isAutoPick: !!opts?.expired,
    },
  });

  await advanceTurn(draftId, true);
}

// PUBLIC: Make a pick on behalf of a team (called from a route).
// Validates that pickerUserId is the captain of the picking team.
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

  if (!isCaptain) {
    // Engine-level check; route may pre-allow commissioner override
    return { ok: false, error: "You are not the captain of the picking team" };
  }

  const available = await listAvailablePlayers(draftId);
  if (!available.find((a) => a.userId === playerId)) {
    return { ok: false, error: "Player not available" };
  }

  await applyPick(draftId, pickingTeamId, playerId);
  return { ok: true };
}

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
  const available = await listAvailablePlayers(draftId);
  if (!available.find((a) => a.userId === playerId)) {
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
    const missing = await db
      .select({ id: leagueMemberships.id })
      .from(leagueMemberships)
      .where(
        and(
          eq(leagueMemberships.leagueId, draft.leagueId),
          eq(leagueMemberships.status, "approved"),
          isNull(leagueMemberships.skillLevel),
        ),
      );
    if (missing.length) {
      return {
        ok: false,
        error: `Cannot start: ${missing.length} player(s) are missing a skill tier`,
      };
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

  await db
    .update(drafts)
    .set({
      status: "active",
      startedAt: draft.startedAt || new Date(),
      currentRound: 1,
      currentTurn: 1,
      launchAt: null,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));
  await setTurnDeadline(draftId);
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
  await startTurnTimer(draftId);
  await broadcastState(draftId);
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
