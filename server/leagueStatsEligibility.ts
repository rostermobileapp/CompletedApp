import { sql, type SQLWrapper } from "drizzle-orm";

// Match the roster's two supported assignment sources without multiplying stats
// when someone has both a league assignment and a direct team membership.
export function leagueStatsPlayerEligible(userId: SQLWrapper, leagueId: string) {
  return sql`EXISTS (
    SELECT 1 FROM league_memberships stats_lm
    WHERE stats_lm.user_id = ${userId}
      AND stats_lm.league_id = ${leagueId}
      AND stats_lm.status = 'approved'
      AND (
        EXISTS (
          SELECT 1 FROM teams stats_team
          WHERE stats_team.id = stats_lm.assigned_team_id
            AND stats_team.league_id = ${leagueId}
        )
        OR EXISTS (
          SELECT 1 FROM team_memberships stats_tm
          JOIN teams stats_roster_team ON stats_roster_team.id = stats_tm.team_id
          WHERE stats_tm.user_id = stats_lm.user_id
            AND stats_tm.status = 'approved'
            AND stats_roster_team.league_id = ${leagueId}
        )
      )
  )`;
}

export function leagueStatsTeamEligible(teamId: SQLWrapper, leagueId: string) {
  return sql`EXISTS (
    SELECT 1 FROM teams stats_assigned_team
    WHERE stats_assigned_team.id = ${teamId}
      AND stats_assigned_team.league_id = ${leagueId}
  )`;
}
