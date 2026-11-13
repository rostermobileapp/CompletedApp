import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { hasOneGoalMargin } from "@shared/gameResultType";
import {
  gameAttendance,
  gameGoals,
  gamePenalties,
  gameScoreSubmissions,
  games,
  placeholderPlayers,
  playerStats,
  users,
} from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";

export type ScorekeeperAttendee = {
  playerId: string;
  teamId: string;
};

export async function normalizeScorekeeperAttendees(
  gameId: string,
  game: { homeTeamId: string; awayTeamId: string | null },
  rawAttendees: unknown[],
  recordedBy: string,
) {
  const teamIds = [game.homeTeamId, game.awayTeamId].filter((id): id is string => !!id);
  const [homeMembers, awayMembers, placeholders] = await Promise.all([
    storage.getTeamMembers(game.homeTeamId),
    game.awayTeamId ? storage.getTeamMembers(game.awayTeamId) : Promise.resolve([]),
    db.select({ id: placeholderPlayers.id, teamId: placeholderPlayers.teamId })
      .from(placeholderPlayers)
      .where(inArray(placeholderPlayers.teamId, teamIds)),
  ]);
  const rosterUsers = new Map<string, string>();
  for (const member of [...homeMembers, ...awayMembers]) rosterUsers.set(member.userId, member.teamId);
  const rosterPlaceholders = new Map<string, string>();
  for (const placeholder of placeholders) {
    if (placeholder.teamId) rosterPlaceholders.set(placeholder.id, placeholder.teamId);
  }
  const normalized: Array<{
    gameId: string;
    teamId: string;
    userId?: string;
    placeholderPlayerId?: string;
    recordedBy: string;
  }> = [];
  const seen = new Set<string>();
  for (const raw of rawAttendees) {
    const attendee = raw as Partial<ScorekeeperAttendee> | null;
    const playerId = typeof attendee?.playerId === "string" ? attendee.playerId : "";
    const teamId = typeof attendee?.teamId === "string" ? attendee.teamId : "";
    if (!playerId || !teamIds.includes(teamId)) continue;
    if (playerId.startsWith("placeholder:")) {
      const placeholderPlayerId = playerId.slice("placeholder:".length);
      if (rosterPlaceholders.get(placeholderPlayerId) !== teamId) {
        throw Object.assign(new Error("Attendance includes a player who is not on this game roster"), { status: 400 });
      }
      if (seen.has(`placeholder:${placeholderPlayerId}`)) continue;
      seen.add(`placeholder:${placeholderPlayerId}`);
      normalized.push({ gameId, teamId, placeholderPlayerId, recordedBy });
    } else {
      if (rosterUsers.get(playerId) !== teamId) {
        throw Object.assign(new Error("Attendance includes a player who is not on this game roster"), { status: 400 });
      }
      if (seen.has(`user:${playerId}`)) continue;
      seen.add(`user:${playerId}`);
      normalized.push({ gameId, teamId, userId: playerId, recordedBy });
    }
  }
  return normalized;
}

export async function saveScorekeeperGame(
  gameId: string,
  userId: string,
  attendees: Awaited<ReturnType<typeof normalizeScorekeeperAttendees>>,
  requestedResultType?: "regulation" | "overtime" | "shootout",
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);
    const [game] = await tx.select().from(games).where(eq(games.id, gameId));
    if (!game) throw new Error("Game disappeared while saving");
    const hasOvertimeMargin = hasOneGoalMargin(game.homeScore, game.awayScore);
    if (requestedResultType === "overtime" && !hasOvertimeMargin) {
      throw Object.assign(new Error("Overtime requires a final score difference of exactly one goal"), { status: 400 });
    }
    const resultType = hasOvertimeMargin
      ? (requestedResultType ?? game.resultType ?? "regulation")
      : "regulation";
    await tx.delete(gameAttendance).where(eq(gameAttendance.gameId, gameId));
    if (attendees.length) await tx.insert(gameAttendance).values(attendees);
    await tx.update(games).set({
      resultType,
      scorekeeperSavedAt: new Date(),
      scorekeeperSavedBy: userId,
    }).where(eq(games.id, gameId));
  });
  return { ok: true };
}

export async function finalizeScorekeeperGame(gameId: string, userId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.scorekeeper_game_id', ${gameId}, true)`);
    await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);
    const [game] = await tx.select().from(games).where(eq(games.id, gameId));
    if (!game) throw new Error("Game disappeared during finalization");
    if (!Number.isInteger(game.homeScore) || !Number.isInteger(game.awayScore)) {
      throw Object.assign(new Error("Both scores must be saved before finalization"), { status: 400 });
    }
    const goals = await tx.select().from(gameGoals).where(eq(gameGoals.gameId, gameId));
    const penalties = await tx.select().from(gamePenalties).where(eq(gamePenalties.gameId, gameId));
    const recoverGoals = !game.isCompleted && goals.length > 0 && goals.every((goal) => goal.isSubmitted);
    const recoverPenalties = !game.isCompleted && penalties.length > 0 && penalties.every((penalty) => penalty.isSubmitted);
    const pendingGoals = goals.filter((goal) => recoverGoals || !goal.isSubmitted);
    const pendingPenalties = penalties.filter((penalty) => recoverPenalties || !penalty.isSubmitted);

    if (game.leagueId && !game.isScrimmage) {
      const statsMap = new Map<string, { goals: number; assists: number; penaltyMinutes: number }>();
      const addStat = (playerId: string | null, stat: "goals" | "assists" | "penaltyMinutes", amount: number) => {
        if (!playerId || playerId === "substitute") return;
        const total = statsMap.get(playerId) || { goals: 0, assists: 0, penaltyMinutes: 0 };
        total[stat] += amount;
        statsMap.set(playerId, total);
      };
      for (const goal of pendingGoals) {
        addStat(goal.scorerId, "goals", 1);
        addStat(goal.primaryAssistId, "assists", 1);
        addStat(goal.secondaryAssistId, "assists", 1);
      }
      for (const penalty of pendingPenalties) addStat(penalty.playerId, "penaltyMinutes", penalty.minutes || 0);
      const candidateIds = Array.from(statsMap.keys());
      const validIds = candidateIds.length
        ? new Set((await tx.select({ id: users.id }).from(users).where(inArray(users.id, candidateIds))).map(({ id }) => id))
        : new Set<string>();
      for (const [playerId, totals] of Array.from(statsMap.entries())) {
        if (!validIds.has(playerId)) continue;
        const statsScope = game.seasonId
          ? and(eq(playerStats.userId, playerId), eq(playerStats.leagueId, game.leagueId), eq(playerStats.seasonId, game.seasonId))
          : and(eq(playerStats.userId, playerId), eq(playerStats.leagueId, game.leagueId), isNull(playerStats.seasonId));
        const updated = await tx.update(playerStats).set({
          goals: sql`${playerStats.goals} + ${totals.goals}`,
          assists: sql`${playerStats.assists} + ${totals.assists}`,
          penaltyMinutes: sql`${playerStats.penaltyMinutes} + ${totals.penaltyMinutes}`,
          updatedAt: new Date(),
        }).where(statsScope).returning({ id: playerStats.id });
        if (!updated.length) {
          await tx.insert(playerStats).values({
            userId: playerId,
            leagueId: game.leagueId,
            seasonId: game.seasonId,
            gamesPlayed: 0,
            ...totals,
          });
        }
      }
    }

    await tx.update(gameGoals).set({
      isSubmitted: true,
      scorerId: sql`NULLIF(${gameGoals.scorerId}, 'substitute')`,
    }).where(eq(gameGoals.gameId, gameId));
    await tx.update(gamePenalties).set({ isSubmitted: true }).where(eq(gamePenalties.gameId, gameId));
    const hasOvertimeMargin = hasOneGoalMargin(game.homeScore, game.awayScore);
    const resultType = hasOvertimeMargin ? (game.resultType ?? "regulation") : "regulation";
    const [updatedGame] = await tx.update(games).set({
      isCompleted: true,
      resultType,
    }).where(eq(games.id, gameId)).returning();

    const [existingVerification] = await tx.select({ id: gameScoreSubmissions.id })
      .from(gameScoreSubmissions)
      .where(and(eq(gameScoreSubmissions.gameId, gameId), eq(gameScoreSubmissions.isCommissionerOverride, true)))
      .limit(1);
    if (existingVerification) {
      await tx.update(gameScoreSubmissions).set({
        submittedBy: userId,
        submitterRole: "commissioner",
        homeScore: updatedGame.homeScore ?? 0,
        awayScore: updatedGame.awayScore ?? 0,
        isCommissionerOverride: true,
        submittedAt: new Date(),
      }).where(eq(gameScoreSubmissions.id, existingVerification.id));
    } else {
      await tx.insert(gameScoreSubmissions).values({
        gameId,
        submittedBy: userId,
        submitterRole: "commissioner",
        homeScore: updatedGame.homeScore ?? 0,
        awayScore: updatedGame.awayScore ?? 0,
        isCommissionerOverride: true,
      });
    }
    return { wasAlreadyCompleted: game.isCompleted };
  });
}

export async function finalizeOvernightScorekeeperSaves(limit = 25) {
  const { rows } = await db.execute(sql`
    SELECT id, scorekeeper_saved_by
    FROM games
    WHERE is_completed = false
      AND scorekeeper_saved_at IS NOT NULL
      AND scorekeeper_saved_by IS NOT NULL
      AND scorekeeper_saved_at <
        (date_trunc('day', clock_timestamp() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York')
      AND home_score IS NOT NULL AND away_score IS NOT NULL
    ORDER BY scorekeeper_saved_at, id
    LIMIT ${limit}
  `);
  let finalized = 0;
  for (const row of rows as Array<{ id: string; scorekeeper_saved_by: string }>) {
    await finalizeScorekeeperGame(row.id, row.scorekeeper_saved_by);
    finalized++;
  }
  return finalized;
}
