import type { Express, Request, Response, RequestHandler } from "express";
import { sql } from "drizzle-orm";

type TeamStatsRouteDependencies = {
  hasProFor: (userId: string, context: { leagueId: string }) => Promise<boolean>;
  storage: {
    getTeam: (teamId: string) => Promise<any>;
    getUserLeagueMembership: (userId: string, leagueId: string) => Promise<any>;
    getUser: (userId: string) => Promise<any>;
    getLeague: (leagueId: string) => Promise<any>;
    getUserTeams: (userId: string) => Promise<any[]>;
  };
  db: {
    execute: (query: any) => Promise<any>;
  };
  getTeamRosterStats: (teamId: string, leagueId: string) => Promise<any[]>;
};

export function createTeamStatsHandler(
  dependencies: TeamStatsRouteDependencies,
): RequestHandler {
  const { storage, db, getTeamRosterStats } = dependencies;

  return async (req: Request, res: Response) => {
    try {
      const teamId = req.params.id;
      const userId = (req as any).user.claims.sub;
      const team = await storage.getTeam(teamId);

      if (!team?.leagueId) {
        return res.status(404).json({ message: "Team or league not found" });
      }

      const [viewerMembership, viewer, league, viewerTeams] = await Promise.all([
        storage.getUserLeagueMembership(userId, team.leagueId),
        storage.getUser(userId),
        storage.getLeague(team.leagueId),
        storage.getUserTeams(userId),
      ]);
      const isOwnTeam = viewerTeams.some((viewerTeam) => viewerTeam.id === teamId
        && viewerTeam.seasonIsActive !== false && !viewerTeam.isInCompletedTournament);
      const isLeagueCommissioner = league?.commissionerId === userId;
      const canViewOpponentStats = isLeagueCommissioner ||
        viewer?.specialPermissions?.includes("admin") ||
        await dependencies.hasProFor(userId, { leagueId: team.leagueId });
      if (!isOwnTeam && !canViewOpponentStats) {
        return res.status(403).json({ message: "Premium access required to view opponent team stats" });
      }

      const mappedRows = await getTeamRosterStats(teamId, team.leagueId);

      // Placeholder roster players do not have users rows, but they still need
      // a complete stats-shaped entry so the team view and stats screen behave
      // the same as they do for registered players.
      const placeholderResult = await db.execute(sql`
        SELECT
          pp.id,
          pp.first_name,
          pp.last_name,
          pp.email,
          pp.is_goalie,
          (
            SELECT COUNT(DISTINCT ga.game_id)::int
            FROM game_attendance ga
            JOIN games g ON g.id = ga.game_id
            WHERE ga.placeholder_player_id = pp.id
              AND g.league_id = ${team.leagueId}
              AND g.is_completed = true
          ) AS games_played
        FROM placeholder_players pp
        WHERE pp.team_id = ${teamId}
      `);
      const placeholderRows = ((placeholderResult.rows ?? placeholderResult) as any[]).map((row: any) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        isGoalie: row.is_goalie,
        gamesPlayed: row.games_played,
      }));

      return res.json([
        ...mappedRows,
        ...placeholderRows.map((placeholder) => ({
          type: "skater",
          userId: `placeholder:${placeholder.id}`,
          gamesPlayed: Number(placeholder.gamesPlayed ?? 0),
          goals: 0,
          assists: 0,
          penaltyMinutes: 0,
          points: 0,
          isGoalie: Boolean(placeholder.isGoalie),
          isPlaceholder: true,
          user: {
            id: `placeholder:${placeholder.id}`,
            email: placeholder.email,
            firstName: placeholder.firstName,
            lastName: placeholder.lastName,
            profileImageUrl: null,
          },
        })),
      ]);
    } catch (error) {
      console.error("Error fetching team stats:", error);
      return res.status(500).json({ message: "Failed to fetch team stats" });
    }
  };
}

export function registerTeamStatsRoute(
  app: Pick<Express, "get">,
  isAuthenticated: RequestHandler,
  dependencies: TeamStatsRouteDependencies,
) {
  app.get("/api/teams/:id/stats", isAuthenticated, createTeamStatsHandler(dependencies));
}
