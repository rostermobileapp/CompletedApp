import { db } from "./db";
import {
  drafts,
  draftPicks,
  draftBuddyPairs,
  draftChatMessages,
  teams,
  teamMemberships,
  leagueMemberships,
  users,
  type Draft,
  type DraftPick,
  type DraftBuddyPair,
  type User,
} from "@shared/schema";
import { eq, and, asc, isNull, inArray } from "drizzle-orm";

// In-memory map of active draft timers (draftId -> setTimeout handle)
const activeTimers = new Map<string, NodeJS.Timeout>();

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
}

export async function getDraftStateBundle(draftId: string): Promise<DraftStateBundle | null> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return null;
  const picks = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftId))
    .orderBy(asc(draftPicks.pick));
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

  return {
    draft,
    picks,
    buddyPairs,
    chatMessages,
    pickingTeamId,
    serverTime: Date.now(),
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

  if (draft.timerExpiryRule === "halve_next") {
    // Don't auto-pick; just advance the turn after halving the next pick's timer.
    // (Current pick is forfeited; the next captain gets a halved timer as penalty.)
    const halved = Math.max(5, Math.floor((draft.timePerPick || 60) / 2));
    await db
      .update(drafts)
      .set({ nextTimerOverride: halved, updatedAt: new Date() })
      .where(eq(drafts.id, draftId));
    // record a forfeited pick row
    if (pickingTeamId) {
      const overall = (draft.currentRound - 1) * draftOrder.length + draft.currentTurn;
      await db.insert(draftPicks).values({
        draftId,
        teamId: pickingTeamId,
        playerId: null,
        round: draft.currentRound,
        pick: overall,
        pickInRound: draft.currentTurn,
        forfeited: true,
        expiredAutoPick: true,
        pickedAt: new Date(),
      });
    }
    await advanceTurn(draftId, /*resetTimer*/ true);
    return;
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

  const members = await db
    .select({
      userId: leagueMemberships.userId,
      isGoalie: leagueMemberships.isGoalie,
    })
    .from(leagueMemberships)
    .where(and(eq(leagueMemberships.leagueId, draft.leagueId), eq(leagueMemberships.status, "approved")));

  const drafted = await db
    .select({ playerId: draftPicks.playerId })
    .from(draftPicks)
    .where(and(eq(draftPicks.draftId, draftId)));
  const draftedSet = new Set<string>();
  for (const p of drafted) {
    if (p.playerId) draftedSet.add(p.playerId);
  }

  const goalieAssignments = (draft.goalieAssignments as Record<string, string>) || {};
  const assignedGoalieIds = new Set(Object.values(goalieAssignments));

  const goalieMethod = draft.goalieMethod || "included_with_skaters";
  return members
    .filter((m) => !draftedSet.has(m.userId))
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
  const dur = durationSeconds ?? draft.nextTimerOverride ?? draft.timePerPick ?? 60;
  const deadline = new Date(Date.now() + dur * 1000);
  await db
    .update(drafts)
    .set({ currentTurnDeadline: deadline, nextTimerOverride: null, updatedAt: new Date() })
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

async function completeDraft(draftId: string) {
  clearDraftTimer(draftId);
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return;

  // Write all drafted players to team_memberships (idempotent).
  const picks = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftId));
  for (const pick of picks) {
    if (!pick.playerId || pick.forfeited) continue;
    // Check existing membership
    const existing = await db
      .select()
      .from(teamMemberships)
      .where(and(eq(teamMemberships.teamId, pick.teamId), eq(teamMemberships.userId, pick.playerId)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(teamMemberships).values({
        teamId: pick.teamId,
        userId: pick.playerId,
        isCaptain: false,
        status: "approved" as any,
      });
    }
  }
  // Also write commissioner-assigned goalies
  const goalieAssignments = (draft.goalieAssignments as Record<string, string>) || {};
  for (const [teamId, userId] of Object.entries(goalieAssignments)) {
    if (!userId) continue;
    const existing = await db
      .select()
      .from(teamMemberships)
      .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(teamMemberships).values({
        teamId,
        userId,
        isCaptain: false,
        status: "approved" as any,
      });
    }
  }

  await db
    .update(drafts)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(drafts.id, draftId));

  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_completed", payload: { draftId } });
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
      let cursor = overall;
      for (const buddyId of otherIds) {
        if (draftedSet.has(buddyId)) continue;
        cursor += 1;
        // Use the buddy's auto-add as a sub-pick at the same round/turn
        await db.insert(draftPicks).values({
          draftId,
          teamId,
          playerId: buddyId,
          round: draft.currentRound,
          pick: cursor,
          pickInRound: draft.currentTurn,
          isAutoBuddy: true,
          pickedAt: new Date(),
        });
      }
      // Forfeit captain's next-round pick
      const forfeited = (draft.forfeitedRounds as Record<string, number[]>) || {};
      const nextRound = draft.currentRound + 1;
      if (nextRound <= (draft.totalRounds || 1)) {
        forfeited[teamId] = [...(forfeited[teamId] || []), nextRound];
        await db
          .update(drafts)
          .set({ forfeitedRounds: forfeited, updatedAt: new Date() })
          .where(eq(drafts.id, draftId));
      }
    }
  }

  broadcastToDraft(draftId, {
    type: "draft_pick_made",
    payload: { draftId, teamId, playerId, round: draft.currentRound, pick: overall },
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

export async function startDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status === "active") return { ok: true };
  if (draft.status === "completed") return { ok: false, error: "Draft is already completed" };
  const draftOrder = (draft.draftOrder as string[]) || [];
  if (draftOrder.length === 0) return { ok: false, error: "Draft order is empty" };

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

  await db
    .update(drafts)
    .set({
      status: "active",
      startedAt: draft.startedAt || new Date(),
      currentRound: 1,
      currentTurn: 1,
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
  clearDraftTimer(draftId);
  await db
    .update(drafts)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(drafts.id, draftId));
  await broadcastState(draftId);
  broadcastToDraft(draftId, { type: "draft_paused", payload: { draftId } });
  return { ok: true };
}

export async function resumeDraft(draftId: string): Promise<{ ok: boolean }> {
  await db
    .update(drafts)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(drafts.id, draftId));
  await setTurnDeadline(draftId);
  await startTurnTimer(draftId);
  await broadcastState(draftId);
  return { ok: true };
}

export async function postChat(draftId: string, userId: string, body: string) {
  const trimmed = body.trim().slice(0, 500);
  if (!trimmed) return;
  const [row] = await db
    .insert(draftChatMessages)
    .values({ draftId, userId, body: trimmed })
    .returning();
  broadcastToDraft(draftId, { type: "draft_chat", payload: row });
}

// Restart timers for any draft in 'active' status (called on server boot)
export async function rehydrateActiveDraftTimers() {
  const active = await db.select().from(drafts).where(eq(drafts.status, "active"));
  for (const draft of active) {
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
