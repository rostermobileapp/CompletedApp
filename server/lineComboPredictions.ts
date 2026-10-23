import { sql } from "drizzle-orm";

/** Completed team games with saved lines and recorded scoring (including real 0-goal games). */
export function lineComboHistoryQuery(teamId: string, includeFrozenForecasts = false) {
  return sql`
    WITH historical_members AS (
      SELECT DISTINCT lc.id AS line_id,lc.game_id,lc.line_type,a.player_id
      FROM line_combinations lc
      JOIN line_combination_assignments a ON a.line_combination_id=lc.id
      JOIN games g ON g.id=lc.game_id
      WHERE lc.team_id=${teamId} AND g.is_completed=true AND a.player_id IS NOT NULL
        AND (g.home_team_id=${teamId} OR g.away_team_id=${teamId})
        AND (
          CASE WHEN g.home_team_id=${teamId} THEN g.home_score ELSE g.away_score END = 0
          OR EXISTS (SELECT 1 FROM game_goals recorded
            WHERE recorded.game_id=g.id AND recorded.team_id=${teamId} AND recorded.is_submitted=true)
        )
      ${includeFrozenForecasts ? sql`
        UNION
        SELECT 'forecast:' || f.game_id || ':' || f.line_type || ':' || f.line_number,
          f.game_id,f.line_type::line_type,p.player_id
        FROM line_combo_forecasts f
        CROSS JOIN LATERAL unnest(f.player_ids) AS p(player_id)
        WHERE f.team_id=${teamId} AND f.actual_points IS NOT NULL AND f.exclusion_reason IS NULL
      ` : sql``}
    )
    SELECT h.line_id AS "lineId",h.game_id AS "gameId",h.line_type AS "lineType",
      h.player_id AS "playerId",
      COALESCE(SUM(
        CASE WHEN gg.scorer_id=h.player_id THEN 1 ELSE 0 END
        + CASE WHEN gg.primary_assist_id=h.player_id THEN 1 ELSE 0 END
        + CASE WHEN gg.secondary_assist_id=h.player_id THEN 1 ELSE 0 END
      ),0)::int AS points
    FROM historical_members h
    LEFT JOIN game_goals gg ON gg.game_id=h.game_id AND gg.team_id=${teamId} AND gg.is_submitted=true
    GROUP BY h.line_id,h.game_id,h.line_type,h.player_id
    ORDER BY h.game_id,h.line_id,h.player_id
  `;
}
