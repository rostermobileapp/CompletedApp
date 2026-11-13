import { sql } from "drizzle-orm";
import { db } from "./db";
import { readVerifiedGameSummary } from "./verifiedGameSummaries";
import { databaseGameSummaryStore } from "./verifiedGameSummaryStore";

export async function getTeamStreaks(
  teamId: string,
  leagueId: string,
  seasonId?: string,
): Promise<Record<string, string>> {
  return readVerifiedGameSummary(databaseGameSummaryStore, {
    kind: "team_streaks",
    entityId: teamId,
    scopeKey: seasonId ?? "all",
    computeRaw: async () => {
      const recentGameCount = 2;
      const assumedBaselinePpg = 0.5;
      const priorBoost = recentGameCount * assumedBaselinePpg;
      const seasonFilter = seasonId ? sql`AND g.season_id = ${seasonId}` : sql``;
      const result = await db.execute(sql`
        WITH recorded_stats AS (
          SELECT gg.scorer_id AS user_id, gg.game_id, 1 AS pts
          FROM game_goals gg
          JOIN games g ON g.id = gg.game_id
          WHERE g.league_id = ${leagueId}
            AND g.is_completed = true
            AND gg.is_submitted = true
            AND gg.scorer_id IS NOT NULL
            ${seasonFilter}
          UNION ALL
          SELECT gg.primary_assist_id, gg.game_id, 1
          FROM game_goals gg
          JOIN games g ON g.id = gg.game_id
          WHERE g.league_id = ${leagueId}
            AND g.is_completed = true
            AND gg.is_submitted = true
            AND gg.primary_assist_id IS NOT NULL
            ${seasonFilter}
          UNION ALL
          SELECT gg.secondary_assist_id, gg.game_id, 1
          FROM game_goals gg
          JOIN games g ON g.id = gg.game_id
          WHERE g.league_id = ${leagueId}
            AND g.is_completed = true
            AND gg.is_submitted = true
            AND gg.secondary_assist_id IS NOT NULL
            ${seasonFilter}
          UNION ALL
          SELECT gp.player_id, gp.game_id, 0
          FROM game_penalties gp
          JOIN games g ON g.id = gp.game_id
          WHERE g.league_id = ${leagueId}
            AND g.is_completed = true
            AND gp.is_submitted = true
            ${seasonFilter}
          UNION ALL
          SELECT ga.user_id, ga.game_id, 0
          FROM game_attendance ga
          JOIN games g ON g.id = ga.game_id
          WHERE ga.user_id IS NOT NULL
            AND g.league_id = ${leagueId}
            AND g.is_completed = true
            ${seasonFilter}
          UNION ALL
          SELECT 'placeholder:' || ga.placeholder_player_id, ga.game_id, 0
          FROM game_attendance ga
          JOIN games g ON g.id = ga.game_id
          WHERE ga.placeholder_player_id IS NOT NULL
            AND g.league_id = ${leagueId}
            AND g.is_completed = true
            ${seasonFilter}
        ),
        player_game_totals AS (
          SELECT rs.user_id, rs.game_id, g.scheduled_at, SUM(rs.pts)::int AS points
          FROM recorded_stats rs
          JOIN games g ON g.id = rs.game_id
          GROUP BY rs.user_id, rs.game_id, g.scheduled_at
        ),
        ranked AS (
          SELECT user_id, game_id, points, scheduled_at,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY scheduled_at DESC) AS rn,
            COUNT(*) OVER (PARTITION BY user_id)::int AS total_games
          FROM player_game_totals
        ),
        streak_data AS (
          SELECT
            user_id,
            MAX(total_games) AS total_games,
            (SUM(CASE WHEN rn <= ${recentGameCount} THEN points ELSE 0 END)::float
              / ${recentGameCount}) AS recent_ppg,
            COALESCE(SUM(CASE WHEN rn > ${recentGameCount} THEN points ELSE 0 END), 0)::float AS prior_points,
            COALESCE(SUM(CASE WHEN rn > ${recentGameCount} THEN 1 ELSE 0 END), 0)::int AS prior_games
          FROM ranked
          GROUP BY user_id
          HAVING MAX(total_games) >= ${recentGameCount}
        )
        SELECT user_id,
          CASE
            WHEN (prior_points + ${priorBoost}::float)
              / (prior_games + ${recentGameCount}) = 0 THEN 'NEUTRAL'
            WHEN recent_ppg / ((prior_points + ${priorBoost}::float)
              / (prior_games + ${recentGameCount})) >= 1.25 THEN 'HOT'
            WHEN recent_ppg / ((prior_points + ${priorBoost}::float)
              / (prior_games + ${recentGameCount})) <= 0.75 THEN 'COLD'
            ELSE 'NEUTRAL'
          END AS streak
        FROM streak_data
      `);
      const rows = (result as any).rows ?? (result as any);
      const streaks: Record<string, string> = {};
      for (const row of rows) {
        if (row.streak && row.streak !== "NEUTRAL") streaks[row.user_id] = row.streak;
      }
      return streaks;
    },
  });
}
