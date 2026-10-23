import type { Pool } from "pg";
import { buildOpponentAdjustment, type OpponentSummary } from "../shared/lineComboOpponent";

/**
 * Matchup and comparison games use the same league/season. League wall-clock
 * times are converted before comparing; future results never enter a forecast.
 */
export const lineComboOpponentSql = `
  WITH next_game AS (
    SELECT g.*,g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York') AS starts_at,
      CASE WHEN g.home_team_id=$1 THEN g.away_team_id ELSE g.home_team_id END AS opponent_id
    FROM games g LEFT JOIN leagues l ON l.id=g.league_id
    WHERE (g.home_team_id=$1 OR g.away_team_id=$1) AND g.is_completed=false AND g.is_scrimmage=false
      AND ($2::text IS NULL OR g.id=$2)
      AND g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York') > clock_timestamp()
    ORDER BY g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York'),g.id LIMIT 1
  ), history AS (
    SELECT g.*,n.opponent_id
    FROM next_game n JOIN games g ON g.league_id=n.league_id AND g.season_id IS NOT DISTINCT FROM n.season_id
    LEFT JOIN leagues l ON l.id=g.league_id
    WHERE g.is_completed=true AND g.is_scrimmage=false AND g.home_team_id IS NOT NULL AND g.away_team_id IS NOT NULL
      AND g.home_score>=0 AND g.away_score>=0
      AND g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York') < LEAST(n.starts_at,clock_timestamp())
  )
  SELECT n.id AS "gameId",n.opponent_id AS "opponentId",
    COALESCE(t.name,n.opponent_name) AS "opponentName",
    (SELECT count(*)::int FROM history h WHERE h.home_team_id=n.opponent_id OR h.away_team_id=n.opponent_id) AS "gamesPlayed",
    (SELECT avg(CASE WHEN h.home_team_id=n.opponent_id THEN h.home_score ELSE h.away_score END)::float8
      FROM history h WHERE h.home_team_id=n.opponent_id OR h.away_team_id=n.opponent_id) AS "goalsForPerGame",
    (SELECT avg(CASE WHEN h.home_team_id=n.opponent_id THEN h.away_score ELSE h.home_score END)::float8
      FROM history h WHERE h.home_team_id=n.opponent_id OR h.away_team_id=n.opponent_id) AS "goalsAgainstPerGame",
    (SELECT avg((h.home_score::float8+h.away_score::float8)/2) FROM history h) AS "leagueGoalsPerTeam"
  FROM next_game n LEFT JOIN teams t ON t.id=n.opponent_id
`;

export async function loadLineComboOpponent(connection: Pick<Pool, "query">, teamId: string, gameId?: string) {
  const { rows } = await connection.query(lineComboOpponentSql, [teamId, gameId ?? null]);
  return buildOpponentAdjustment(rows[0] as OpponentSummary | undefined);
}
