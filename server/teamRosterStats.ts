import { sql } from "drizzle-orm";
import { db } from "./db";

export type TeamRosterStat = {
  type: "skater";
  userId: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  penaltyMinutes: number;
  points: number;
  isGoalie: boolean;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
};

export async function getTeamRosterStats(teamId: string, leagueId: string): Promise<TeamRosterStat[]> {
  const result = await db.execute(sql`
    WITH roster AS (
      SELECT tm.user_id
      FROM team_memberships tm
      WHERE tm.team_id = ${teamId}
        AND tm.status = 'approved'
      UNION
      SELECT lm.user_id
      FROM league_memberships lm
      WHERE lm.assigned_team_id = ${teamId}
        AND lm.status = 'approved'
    ),
    aggregated_stats AS (
      SELECT
        ps.user_id,
        COALESCE(SUM(ps.games_played), 0)::int AS games_played,
        COALESCE(SUM(ps.goals), 0)::int AS goals,
        COALESCE(SUM(ps.assists), 0)::int AS assists,
        COALESCE(SUM(ps.penalty_minutes), 0)::int AS penalty_minutes,
        COUNT(*) FILTER (
          WHERE COALESCE(ps.goals, 0) > 0
             OR COALESCE(ps.assists, 0) > 0
             OR COALESCE(ps.penalty_minutes, 0) > 0
        )::int AS recorded_stat_rows
      FROM player_stats ps
      WHERE ps.league_id = ${leagueId}
        AND ps.user_id IS NOT NULL
      GROUP BY ps.user_id
    ),
    attendance_stats AS (
      SELECT
        ga.user_id,
        COUNT(DISTINCT ga.game_id)::int AS games_played
      FROM game_attendance ga
      JOIN games g ON g.id = ga.game_id
      WHERE ga.user_id IS NOT NULL
        AND g.league_id = ${leagueId}
        AND g.is_completed = true
      GROUP BY ga.user_id
    )
    SELECT
      u.id AS user_id,
      u.email,
      u.first_name,
      u.last_name,
      u.profile_image_url,
      GREATEST(
        COALESCE(ast.games_played, 0),
        COALESCE(att.games_played, 0),
        COALESCE(ast.recorded_stat_rows, 0)
      ) AS games_played,
      COALESCE(ast.goals, 0) AS goals,
      COALESCE(ast.assists, 0) AS assists,
      COALESCE(ast.penalty_minutes, 0) AS penalty_minutes,
      COALESCE(lm.is_goalie, false) AS is_goalie
    FROM roster r
    INNER JOIN users u ON u.id = r.user_id
    LEFT JOIN aggregated_stats ast ON ast.user_id = u.id
    LEFT JOIN attendance_stats att ON att.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT is_goalie
      FROM league_memberships
      WHERE user_id = u.id
        AND league_id = ${leagueId}
        AND status = 'approved'
      ORDER BY requested_at DESC
      LIMIT 1
    ) lm ON true
    ORDER BY LOWER(COALESCE(u.last_name, '')), LOWER(COALESCE(u.first_name, ''))
  `);

  const rows = (result.rows ?? result) as any[];
  return rows.map((row) => ({
    type: "skater",
    userId: row.user_id,
    gamesPlayed: Number(row.games_played ?? 0),
    goals: Number(row.goals ?? 0),
    assists: Number(row.assists ?? 0),
    penaltyMinutes: Number(row.penalty_minutes ?? 0),
    points: Number(row.goals ?? 0) + Number(row.assists ?? 0),
    isGoalie: Boolean(row.is_goalie),
    user: {
      id: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      profileImageUrl: row.profile_image_url,
    },
  }));
}
