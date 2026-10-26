import type { Express, RequestHandler } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  dutyAssignments, games, substituteRequests, teamEvents,
  tournamentMatches, tournamentParticipants, tournamentTeams, users,
} from "../shared/schema";
import type { db as appDb } from "./db";
import type { storage as appStorage } from "./storage";
import {
  DutyAssignmentError, registerDutyAssignmentHandlers,
  type DutyAssignmentDependencies, type DutyContext, type DutyPlayer,
} from "./dutyAssignmentHandlers";

export function createDutyAssignmentDependencies(
  db: typeof appDb,
  storage: Pick<typeof appStorage, "getTeam" | "isTeamCaptain" | "getTeamMembers" | "getDutyTemplatesForGame" | "releaseDuty">,
): DutyAssignmentDependencies {
  return {
  async resolveContext(gameId, requestedTeamId) {
    const [requestedTournamentTeam] = await db.select().from(tournamentTeams)
      .where(eq(tournamentTeams.id, requestedTeamId));
    const teamId = requestedTournamentTeam?.teamId ?? requestedTeamId;
    if (!await storage.getTeam(teamId)) {
      throw new DutyAssignmentError(404, "Team not found");
    }
    // The duty widget accepts regular games, tournament match IDs, and team scrimmages.
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    const [match] = await db.select().from(tournamentMatches)
      .where(or(eq(tournamentMatches.id, gameId), eq(tournamentMatches.gameId, gameId)));
    const tournamentTeamIds: string[] = [];
    if (match) {
      const sides = [match.team1Id, match.team2Id].filter((id): id is string => !!id);
      const entries = sides.length
        ? await db.select().from(tournamentTeams).where(inArray(tournamentTeams.id, sides))
        : [];
      for (const entry of entries) {
        if (entry.teamId === teamId &&
          (!requestedTournamentTeam || entry.id === requestedTournamentTeam.id)) {
          tournamentTeamIds.push(entry.id);
        }
      }
      if (!tournamentTeamIds.length) {
        throw new DutyAssignmentError(403, "This team is not playing in this match");
      }
    } else if (game) {
      if (requestedTournamentTeam || (game.homeTeamId !== teamId && game.awayTeamId !== teamId)) {
        throw new DutyAssignmentError(403, "This team is not playing in this game");
      }
    } else {
      const [event] = await db.select().from(teamEvents).where(eq(teamEvents.id, gameId));
      if (!event) throw new DutyAssignmentError(404, "Game or team event not found");
      if (requestedTournamentTeam || event.teamId !== teamId) {
        throw new DutyAssignmentError(403, "This event does not belong to this team");
      }
      return { gameId, teamId, tournamentTeamIds, substituteGameId: null, teamEventId: gameId };
    }
    return {
      gameId, teamId, tournamentTeamIds,
      substituteGameId: game?.id ?? match?.gameId ?? null, teamEventId: null,
    };
  },
  isCaptain: (teamId, userId) => storage.isTeamCaptain(teamId, userId),
  async getPlayers(context: DutyContext) {
    const members = await storage.getTeamMembers(context.teamId);
    const players: DutyPlayer[] = members.map(member => ({
      userId: member.userId, firstName: member.user.firstName, lastName: member.user.lastName,
    }));
    if (context.tournamentTeamIds.length) {
      const participants = await db.select({
        userId: users.id, firstName: users.firstName, lastName: users.lastName,
      }).from(tournamentParticipants).innerJoin(users, eq(users.id, tournamentParticipants.userId))
        .where(and(
          inArray(tournamentParticipants.tournamentTeamId, context.tournamentTeamIds),
          eq(tournamentParticipants.status, "approved"),
        ));
      players.push(...participants);
    }
    if (context.substituteGameId || context.teamEventId) {
      const substitutes = await db.select({
        userId: users.id, firstName: users.firstName, lastName: users.lastName,
      }).from(substituteRequests).innerJoin(users, eq(users.id, substituteRequests.substitutePlayerId))
        .where(and(
          eq(substituteRequests.requestingTeamId, context.teamId),
          eq(substituteRequests.status, "approved"),
          context.teamEventId
            ? eq(substituteRequests.teamEventId, context.teamEventId)
            : eq(substituteRequests.gameId, context.substituteGameId!),
        ));
      players.push(...substitutes);
    }
    return Array.from(new Map(players.map(player => [player.userId, player])).values())
      .sort((a, b) => `${a.firstName ?? ""} ${a.lastName ?? ""}`.localeCompare(`${b.firstName ?? ""} ${b.lastName ?? ""}`));
  },
  getAvailableTemplates: (teamId, gameId) => storage.getDutyTemplatesForGame(teamId, gameId),
  async save(context, dutyTemplateId, userId) {
    if (userId === null) {
      await storage.releaseDuty(dutyTemplateId, context.gameId, context.teamId);
      return;
    }
    // One atomic upsert preserves a single assignee even during simultaneous claims/reassignments.
    await db.insert(dutyAssignments).values({
      gameId: context.gameId, teamId: context.teamId, dutyTemplateId, userId,
    }).onConflictDoUpdate({
      target: [dutyAssignments.dutyTemplateId, dutyAssignments.gameId, dutyAssignments.teamId],
      set: { userId, claimedAt: new Date() },
    });
  },
  };
}

export function registerDutyAssignmentRoutes(
  app: Express, auth: RequestHandler, db: typeof appDb, storage: typeof appStorage,
) {
  registerDutyAssignmentHandlers(app, auth, createDutyAssignmentDependencies(db, storage));
}
