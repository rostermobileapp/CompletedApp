import type { Pool, PoolClient } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildLineComboStats, projectLineCombo, type ComboHistoryRow, type ComboLineType } from "../shared/lineComboPredictions";
import { learnLineComboCalibration, type ScoredLineForecast } from "../shared/lineComboLearning";
import { lineComboHistoryQuery } from "./lineComboPredictions";
import { loadLineComboOpponent } from "./lineComboOpponent";
import { opponentAdjustedBaseline } from "../shared/lineComboOpponent";

// Do not mix old unadjusted baselines with matchup-adjusted learning evidence.
export const LINE_COMBO_FORECAST_VERSION = "opponent-context-v2";

type Queryable = Pick<Pool, "query">;

// A forecast cannot be created after the game starts, even if its scores are not
// submitted yet. Use league-local wall time, converted by PostgreSQL to real UTC.
export const upcomingLineForecastsSql = `
  WITH upcoming AS (
    SELECT g.id AS game_id,t.id AS team_id,
      g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York') AS starts_at
    FROM games g JOIN leagues l ON l.id=g.league_id
    JOIN teams t ON t.id=g.home_team_id OR t.id=g.away_team_id
    WHERE g.is_completed=false
      AND g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York') > clock_timestamp()
      AND g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York') < clock_timestamp()+interval '48 hours'
  )
  SELECT u.game_id AS "gameId",u.team_id AS "teamId",u.starts_at::text AS "startsAt",
    lc.line_type AS "lineType",lc.line_number AS "lineNumber",
    CASE WHEN lc.game_id IS NULL THEN 'template' ELSE 'game' END AS source,
    array_agg(a.player_id::text ORDER BY a.player_id) AS "playerIds"
  FROM upcoming u JOIN line_combinations lc ON lc.team_id=u.team_id AND lc.is_active=true
    AND (lc.game_id=u.game_id OR (lc.game_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM line_combinations specific
      WHERE specific.team_id=u.team_id AND specific.game_id=u.game_id AND specific.is_active=true)))
  JOIN line_combination_assignments a ON a.line_combination_id=lc.id
  WHERE lc.name NOT ILIKE '[TEST]%'
  GROUP BY u.game_id,u.team_id,u.starts_at,lc.id,lc.line_type,lc.line_number,lc.game_id
  HAVING count(*)=CASE WHEN lc.line_type='forward' THEN 3 ELSE 2 END
    AND count(DISTINCT a.player_id)=count(*)
    AND array_agg(a.position::text ORDER BY a.position::text)=
      CASE WHEN lc.line_type='forward' THEN ARRAY['C','LW','RW'] ELSE ARRAY['LD','RD'] END
  ORDER BY u.starts_at,u.team_id,lc.line_type,lc.line_number
`;

export const evaluateLineForecastsSql = `
  WITH outcomes AS (
    SELECT f.game_id,f.team_id,f.line_type,f.line_number,
      COALESCE((SELECT SUM(
        CASE WHEN gg.scorer_id=ANY(f.player_ids) THEN 1 ELSE 0 END+
        CASE WHEN gg.primary_assist_id=ANY(f.player_ids) THEN 1 ELSE 0 END+
        CASE WHEN gg.secondary_assist_id=ANY(f.player_ids) THEN 1 ELSE 0 END)
        FROM game_goals gg WHERE gg.game_id=f.game_id AND gg.team_id=f.team_id AND gg.is_submitted=true),0)::int AS points,
      CASE
        WHEN g.is_completed IS NOT TRUE THEN 'game-not-complete'
        WHEN f.starts_at IS DISTINCT FROM g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York')
          THEN 'game-rescheduled'
        WHEN f.captured_at >= f.starts_at THEN 'late-forecast'
        WHEN f.model_version <> '${LINE_COMBO_FORECAST_VERSION}' THEN 'different-model'
        WHEN EXISTS (SELECT 1 FROM line_combinations test WHERE test.game_id=f.game_id AND test.team_id=f.team_id
          AND test.name ILIKE '[TEST]%') THEN 'test-lineup'
        WHEN (CASE WHEN g.home_team_id=f.team_id THEN g.home_score ELSE g.away_score END) IS NULL
          OR EXISTS (SELECT 1 FROM game_goals pending
            WHERE pending.game_id=f.game_id AND pending.team_id=f.team_id AND pending.is_submitted IS NOT TRUE)
          OR (CASE WHEN g.home_team_id=f.team_id THEN g.home_score ELSE g.away_score END) <>
            (SELECT count(*) FROM game_goals gg WHERE gg.game_id=f.game_id AND gg.team_id=f.team_id AND gg.is_submitted=true)
          THEN 'scoring-not-final'
        WHEN EXISTS (SELECT 1 FROM line_combinations lc WHERE lc.game_id=f.game_id AND lc.team_id=f.team_id)
          AND NOT EXISTS (
            SELECT 1 FROM line_combinations lc JOIN line_combination_assignments a ON a.line_combination_id=lc.id
            WHERE lc.game_id=f.game_id AND lc.team_id=f.team_id AND lc.line_type::text=f.line_type AND lc.is_active=true
            GROUP BY lc.id HAVING array_agg(a.player_id::text ORDER BY a.player_id)=f.player_ids)
          THEN 'lineup-changed'
        WHEN NOT EXISTS (SELECT 1 FROM line_combinations lc WHERE lc.game_id=f.game_id AND lc.team_id=f.team_id)
          AND (f.source='game' OR EXISTS (SELECT 1 FROM unnest(f.player_ids) p(id)
            WHERE NOT EXISTS (SELECT 1 FROM game_attendance ga
              WHERE ga.game_id=f.game_id AND ga.team_id=f.team_id AND ga.user_id=p.id)))
          THEN 'attendance-not-confirmed'
        ELSE NULL
      END AS reason
    FROM line_combo_forecasts f JOIN games g ON g.id=f.game_id
    JOIN leagues l ON l.id=g.league_id
    WHERE f.starts_at<=clock_timestamp() AND ($1::text IS NULL OR f.team_id=$1)
  )
  UPDATE line_combo_forecasts f SET
    actual_points=CASE WHEN o.reason IS NULL THEN o.points ELSE NULL END,
    exclusion_reason=o.reason,evaluated_at=clock_timestamp()
  FROM outcomes o
  WHERE (f.game_id,f.team_id,f.line_type,f.line_number)=(o.game_id,o.team_id,o.line_type,o.line_number)
    AND (f.evaluated_at IS NULL OR
      (f.actual_points,f.exclusion_reason) IS DISTINCT FROM (CASE WHEN o.reason IS NULL THEN o.points ELSE NULL END,o.reason))
`;

export async function loadLineComboCalibration(connection: Queryable, teamId: string, refresh = true) {
  try {
    if (refresh) await connection.query(evaluateLineForecastsSql, [teamId]);
    const { rows } = await connection.query(`
      WITH ranked AS (
        SELECT game_id AS "gameId",line_type AS "lineType",player_ids AS "playerIds",
          base_ppg AS "basePointsPerGame",actual_points AS "actualPoints",starts_at,
          dense_rank() OVER (ORDER BY starts_at DESC,game_id DESC) AS game_rank
        FROM line_combo_forecasts WHERE team_id=$1 AND actual_points IS NOT NULL AND exclusion_reason IS NULL
          AND captured_at<starts_at AND model_version=$2
      )
      SELECT * FROM ranked WHERE game_rank<=60 ORDER BY starts_at DESC,"gameId", "lineType"
    `, [teamId, LINE_COMBO_FORECAST_VERSION]);
    return learnLineComboCalibration(rows as ScoredLineForecast[]);
  } catch (error: any) {
    if (error?.code !== "42P01") throw error;
    // Explicit client-visible status; never claim learning is running without storage.
    return learnLineComboCalibration([], false);
  }
}

type Candidate = {
  gameId: string; teamId: string; startsAt: string; lineType: ComboLineType;
  lineNumber: number; source: "game" | "template"; playerIds: string[];
};

export async function captureUpcomingLineForecasts(client: PoolClient) {
  const { rows } = await client.query(upcomingLineForecastsSql);
  const historyByTeam = new Map<string, ReturnType<typeof buildLineComboStats>>();
  const opponents = new Map<string, Awaited<ReturnType<typeof loadLineComboOpponent>>>();
  for (const candidate of rows as Candidate[]) {
    let stats = historyByTeam.get(candidate.teamId);
    if (!stats) {
      const query = new PgDialect().sqlToQuery(lineComboHistoryQuery(candidate.teamId, true));
      const history = await client.query(query.sql, query.params);
      stats = buildLineComboStats(history.rows as ComboHistoryRow[]);
      stats.learning = await loadLineComboCalibration(client, candidate.teamId, false);
      historyByTeam.set(candidate.teamId, stats);
    }
    const players = candidate.playerIds.map(id => stats!.players.find(player => player.playerId === id));
    if (players.some(player => !player || player.gamesPlayed < 1)) continue;
    const matchupKey = JSON.stringify([candidate.teamId, candidate.gameId]);
    let opponent = opponents.get(matchupKey);
    if (!opponent) {
      opponent = await loadLineComboOpponent(client, candidate.teamId, candidate.gameId);
      opponents.set(matchupKey, opponent);
    }
    const base = opponentAdjustedBaseline(players.reduce((sum, player) => sum + player!.pointsPerGame, 0), opponent);
    const projection = projectLineCombo({ ...stats, opponent }, candidate.lineType, candidate.playerIds);
    if (!projection) continue;
    await client.query(`
      INSERT INTO line_combo_forecasts(game_id,team_id,line_type,line_number,player_ids,source,
        starts_at,captured_at,base_ppg,predicted_ppg,model_version)
      SELECT $1::varchar,$2::varchar,$3::text,$4::integer,$5::text[],$6::text,$7::timestamptz,
        clock_timestamp(),$8::double precision,$9::double precision,$10::text
      FROM games g JOIN leagues l ON l.id=g.league_id
      WHERE g.id=$1::varchar AND g.is_completed=false AND $7::timestamptz>clock_timestamp()
        AND $7::timestamptz=g.scheduled_at AT TIME ZONE COALESCE(l.timezone,'America/New_York')
      ON CONFLICT(game_id,team_id,line_type,line_number) DO UPDATE SET
        player_ids=excluded.player_ids,source=excluded.source,starts_at=excluded.starts_at,
        captured_at=excluded.captured_at,base_ppg=excluded.base_ppg,predicted_ppg=excluded.predicted_ppg,
        model_version=excluded.model_version,actual_points=NULL,evaluated_at=NULL,exclusion_reason=NULL
    `, [candidate.gameId, candidate.teamId, candidate.lineType, candidate.lineNumber, candidate.playerIds,
      candidate.source, candidate.startsAt, base, projection.pointsPerGame, LINE_COMBO_FORECAST_VERSION]);
  }
  // Remove stale, still-future plans if their slot was cleared/renumbered/replaced.
  // Finished-game forecasts are never rewritten or retrospectively manufactured.
  await client.query(`
    DELETE FROM line_combo_forecasts f WHERE f.starts_at>clock_timestamp() AND NOT EXISTS (
      SELECT 1 FROM line_combinations lc JOIN line_combination_assignments a ON a.line_combination_id=lc.id
      WHERE lc.team_id=f.team_id AND lc.line_type::text=f.line_type AND lc.line_number=f.line_number
        AND lc.is_active=true AND lc.name NOT ILIKE '[TEST]%'
        AND (lc.game_id=f.game_id OR (lc.game_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM line_combinations specific WHERE specific.team_id=f.team_id
            AND specific.game_id=f.game_id AND specific.is_active=true)))
      GROUP BY lc.id HAVING array_agg(a.player_id::text ORDER BY a.player_id)=f.player_ids)
  `);
}

/** Pinned connection and advisory transaction lock coordinate multiple replicas. */
export function createLineComboLearningWorker(pool: Pick<Pool, "connect">) {
  let running: Promise<void> | undefined;
  let rerun = false;
  const request = (): Promise<void> => {
    if (running) { rerun = true; return running; }
    running = (async () => {
      do {
        rerun = false;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL statement_timeout='20s'");
          const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext('roster:line-combo-learning')) AS acquired");
          if (!lock.rows[0].acquired) { await client.query("ROLLBACK"); return; }
          await client.query(evaluateLineForecastsSql, [null]);
          await captureUpcomingLineForecasts(client);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        } finally { client.release(); }
      } while (rerun);
    })().catch((error: any) => {
      console.error("[LineComboLearning] Update failed; will retry.", { code: error?.code ?? "unknown" });
    }).finally(() => { running = undefined; });
    return running;
  };
  return {
    request,
    start() {
      void request();
      const timer = setInterval(() => void request(), 60_000);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}
