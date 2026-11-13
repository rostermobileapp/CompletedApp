import { eq } from "drizzle-orm";
import { games } from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";
import { evaluateBadgesForUsers } from "./badges";
import { supabase } from "./supabaseAuth";
import { finalizeOvernightScorekeeperSaves } from "./scorekeeperFinalization";

type LineComboRequest = (teamIds: string[]) => Promise<void>;

type CompletedGameJob = {
  game_id: string;
  revision: number;
  badges_done: boolean;
  line_combo_done: boolean;
  win_odds_done: boolean;
};

type WinChanceJob = {
  event_type: "rsvp_game" | "team";
  entity_id: string;
  revision: number;
};

function errorCode(error: any): string {
  const candidate = error?.code ?? error?.name;
  return typeof candidate === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(candidate)
    ? candidate
    : "unknown";
}

async function invokeWinChance(body: Record<string, string | string[]>, scope: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await supabase.functions.invoke("recalculate-win-chance", { body });
      if (!error) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    console.error("[WinChance] Dispatch failed.", {
      scope,
      attempt,
      code: errorCode(lastError),
    });
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw Object.assign(new Error("Win-chance dispatch failed after one retry"), {
    code: errorCode(lastError),
  });
}

async function gameBadgeEvaluations(gameId: string) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game) return { game: null, evaluations: [], teamIds: [] as string[] };

  const teamIds = Array.from(new Set([game.homeTeamId, game.awayTeamId].filter(Boolean))) as string[];
  const rosterMembers = await Promise.all(teamIds.map((teamId) => storage.getTeamMembers(teamId)));
  const rosterUserIds = rosterMembers.flatMap((members) => members.map((member) => member.userId));
  const participantRows = await pool.query<{ user_id: string }>(`
    SELECT user_id FROM game_attendance WHERE game_id = $1 AND user_id IS NOT NULL
    UNION SELECT goalie_user_id FROM game_goalies WHERE game_id = $1 AND goalie_user_id IS NOT NULL
    UNION SELECT scorer_id FROM game_goals WHERE game_id = $1 AND scorer_id IS NOT NULL
    UNION SELECT primary_assist_id FROM game_goals WHERE game_id = $1 AND primary_assist_id IS NOT NULL
    UNION SELECT secondary_assist_id FROM game_goals WHERE game_id = $1 AND secondary_assist_id IS NOT NULL
    UNION SELECT player_id FROM game_penalties WHERE game_id = $1 AND player_id IS NOT NULL
  `, [gameId]);
  const userIds = Array.from(new Set([
    ...rosterUserIds,
    ...participantRows.rows.map(({ user_id }) => String(user_id)),
  ]));
  const year = Number(String(game.scheduledAt).slice(0, 4));
  return {
    game,
    teamIds,
    evaluations: userIds.map((userId) => ({
      userId,
      context: { leagueId: game.leagueId, seasonId: game.seasonId, year },
    })),
  };
}

async function claimCompletedGame(gameId?: string, force = false): Promise<CompletedGameJob | undefined> {
  const { rows } = await pool.query<CompletedGameJob>(`
    WITH candidate AS (
      SELECT game_id
      FROM public.scorekeeper_game_recalculation_queue
      WHERE ($1::varchar IS NULL OR game_id = $1)
        AND ($2::boolean OR due_at <= clock_timestamp())
        AND (locked_until IS NULL OR locked_until < clock_timestamp())
      ORDER BY due_at, game_id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE public.scorekeeper_game_recalculation_queue q
    SET locked_until = clock_timestamp() + interval '15 minutes'
    FROM candidate c
    WHERE q.game_id = c.game_id
    RETURNING q.game_id, q.revision, q.badges_done, q.line_combo_done, q.win_odds_done
  `, [gameId ?? null, force]);
  return rows[0];
}

async function claimWinChanceJob(): Promise<WinChanceJob | undefined> {
  const { rows } = await pool.query<WinChanceJob>(`
    WITH candidate AS (
      SELECT event_type, entity_id
      FROM public.win_chance_recalculation_queue
      WHERE due_at <= clock_timestamp()
        AND (locked_until IS NULL OR locked_until < clock_timestamp())
      ORDER BY due_at, event_type, entity_id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE public.win_chance_recalculation_queue q
    SET locked_until = clock_timestamp() + interval '5 minutes'
    FROM candidate c
    WHERE q.event_type = c.event_type AND q.entity_id = c.entity_id
    RETURNING q.event_type, q.entity_id, q.revision
  `);
  return rows[0];
}

async function markCompletedGameComponent(
  job: CompletedGameJob,
  component: "badges_done" | "line_combo_done" | "win_odds_done",
) {
  await pool.query(`
    UPDATE public.scorekeeper_game_recalculation_queue
    SET ${component} = true, locked_until = clock_timestamp() + interval '15 minutes'
    WHERE game_id = $1 AND revision = $2
  `, [job.game_id, job.revision]);
}

async function deferCompletedGame(job: CompletedGameJob, code: string) {
  await pool.query(`
    UPDATE public.scorekeeper_game_recalculation_queue
    SET attempts = attempts + 1,
        last_error = $3,
        due_at = ((date_trunc('day', clock_timestamp() AT TIME ZONE 'America/New_York')
          + interval '1 day 3 hours') AT TIME ZONE 'America/New_York'),
        locked_until = NULL
    WHERE game_id = $1 AND revision = $2
  `, [job.game_id, job.revision, code]);
}

async function deferWinChanceJob(job: WinChanceJob, code: string) {
  await pool.query(`
    UPDATE public.win_chance_recalculation_queue
    SET attempts = attempts + 1,
        last_error = $4,
        due_at = ((date_trunc('day', clock_timestamp() AT TIME ZONE 'America/New_York')
          + interval '1 day 3 hours') AT TIME ZONE 'America/New_York'),
        locked_until = NULL
    WHERE event_type = $1 AND entity_id = $2 AND revision = $3
  `, [job.event_type, job.entity_id, job.revision, code]);
}

async function processClaimedCompletedGames(
  jobs: CompletedGameJob[],
  requestLineComboLearning: LineComboRequest,
) {
  const eligibleJobs: CompletedGameJob[] = [];
  try {
    const gameWork = await Promise.all(jobs.map((job) => gameBadgeEvaluations(job.game_id)));
    const allEvaluations: Array<{ userId: string; context: { leagueId: string | null; seasonId: string | null; year: number } }> = [];
    const evaluationKeys = new Set<string>();
    const teamIds = new Set<string>();

    for (let index = 0; index < jobs.length; index++) {
      const job = jobs[index];
      const work = gameWork[index];
      if (!work.game || work.game.isCompleted !== true) {
        await pool.query(
          "DELETE FROM public.scorekeeper_game_recalculation_queue WHERE game_id = $1 AND revision = $2",
          [job.game_id, job.revision],
        );
        continue;
      }
      eligibleJobs.push(job);
      work.teamIds.forEach((teamId) => teamIds.add(teamId));
      if (!job.badges_done) {
        for (const evaluation of work.evaluations) {
          const key = `${evaluation.userId}:${evaluation.context.leagueId ?? ""}:${evaluation.context.seasonId ?? ""}:${evaluation.context.year}`;
          if (evaluationKeys.has(key)) continue;
          evaluationKeys.add(key);
          allEvaluations.push(evaluation);
        }
      }
    }
    if (!eligibleJobs.length) return;

    if (eligibleJobs.some((job) => !job.badges_done)) {
      const results = await evaluateBadgesForUsers(allEvaluations);
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        throw Object.assign(new Error("One or more badge evaluations failed"), { code: errorCode(failure.reason) });
      }
      for (const job of eligibleJobs) {
        if (!job.badges_done) await markCompletedGameComponent(job, "badges_done");
      }
    }

    if (eligibleJobs.some((job) => !job.line_combo_done)) {
      await requestLineComboLearning(Array.from(teamIds));
      for (const job of eligibleJobs) {
        if (!job.line_combo_done) await markCompletedGameComponent(job, "line_combo_done");
      }
    }

    if (eligibleJobs.some((job) => !job.win_odds_done)) {
      const dispatchStartedAt = new Date();
      await invokeWinChance(
        { source_game_ids: eligibleJobs.filter((job) => !job.win_odds_done).map((job) => job.game_id) },
        `completed-game-batch:${eligibleJobs.length}`,
      );
      await pool.query(`
        DELETE FROM public.win_chance_recalculation_queue
        WHERE event_type = 'team' AND entity_id = ANY($1::varchar[])
          AND updated_at <= $2
      `, [Array.from(teamIds), dispatchStartedAt]);
      for (const job of eligibleJobs) {
        if (!job.win_odds_done) await markCompletedGameComponent(job, "win_odds_done");
      }
    }

    await Promise.all(eligibleJobs.map((job) => pool.query(`
      DELETE FROM public.scorekeeper_game_recalculation_queue
      WHERE game_id = $1 AND revision = $2
        AND badges_done AND line_combo_done AND win_odds_done
    `, [job.game_id, job.revision])));
  } catch (error) {
    const code = errorCode(error);
    console.error("[ScorekeeperRecalculation] Batched game recalculation failed.", {
      gameCount: jobs.length,
      code,
    });
    await Promise.all(jobs.map((job) => deferCompletedGame(job, code).catch(() => {})));
    throw error;
  }
}

export function createScorekeeperRecalculationWorker(requestLineComboLearning: LineComboRequest) {
  let started = false;
  let tickRunning = false;
  let lastCatchupDate = "";
  let timer: ReturnType<typeof setInterval> | undefined;

  const processClaimedCompletedGame = async (job: CompletedGameJob) => {
    const gameId = job.game_id;
    try {
      const { game, teamIds, evaluations } = await gameBadgeEvaluations(gameId);
      if (!game || game.isCompleted !== true) {
        await pool.query(
          "DELETE FROM public.scorekeeper_game_recalculation_queue WHERE game_id = $1 AND revision = $2",
          [gameId, job.revision],
        );
        return true;
      }

      if (!job.badges_done) {
        const results = await evaluateBadgesForUsers(evaluations);
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") {
          throw Object.assign(new Error("One or more badge evaluations failed"), {
            code: errorCode(failure.reason),
          });
        }
        await markCompletedGameComponent(job, "badges_done");
      }

      if (!job.line_combo_done) {
        await requestLineComboLearning(teamIds);
        await markCompletedGameComponent(job, "line_combo_done");
      }

      if (!job.win_odds_done) {
        if (teamIds.length > 0) {
          const dispatchStartedAt = new Date();
          await invokeWinChance({ source_game_id: gameId }, `completed-game:${gameId}`);
          await pool.query(`
            DELETE FROM public.win_chance_recalculation_queue
            WHERE event_type = 'team' AND entity_id = ANY($1::varchar[])
              AND updated_at <= $2
          `, [teamIds, dispatchStartedAt]);
        }
        await markCompletedGameComponent(job, "win_odds_done");
      }

      await pool.query(`
        DELETE FROM public.scorekeeper_game_recalculation_queue
        WHERE game_id = $1 AND revision = $2
          AND badges_done AND line_combo_done AND win_odds_done
      `, [gameId, job.revision]);
      return true;
    } catch (error) {
      const code = errorCode(error);
      console.error("[ScorekeeperRecalculation] Game-level recalculation failed.", { gameId, code });
      await deferCompletedGame(job, code).catch(() => {});
      throw error;
    }
  };

  const processCompletedGame = async (gameId: string, force = true) => {
    const job = await claimCompletedGame(gameId, force);
    if (!job) return false;
    return processClaimedCompletedGame(job);
  };

  const processCompletedGames = async (gameIds: string[]) => {
    const jobs: CompletedGameJob[] = [];
    for (const gameId of Array.from(new Set(gameIds.filter(Boolean))).slice(0, 25)) {
      const job = await claimCompletedGame(gameId, true);
      if (job) jobs.push(job);
    }
    if (jobs.length) await processClaimedCompletedGames(jobs, requestLineComboLearning);
  };

  const processNextCompletedGame = async () => {
    const job = await claimCompletedGame(undefined, false);
    if (!job) return false;
    return processClaimedCompletedGame(job);
  };

  const processNextWinChanceJob = async () => {
    const job = await claimWinChanceJob();
    if (!job) return false;
    try {
      const body: Record<string, string> = job.event_type === "rsvp_game"
        ? { game_id: job.entity_id }
        : { team_id: job.entity_id };
      await invokeWinChance(body, `${job.event_type}:${job.entity_id}`);
      await pool.query(`
        DELETE FROM public.win_chance_recalculation_queue
        WHERE event_type = $1 AND entity_id = $2 AND revision = $3
      `, [job.event_type, job.entity_id, job.revision]);
      return true;
    } catch (error) {
      const code = errorCode(error);
      console.error("[WinChance] Queued refresh failed; nightly catch-up retained it.", {
        scope: `${job.event_type}:${job.entity_id}`,
        code,
      });
      await deferWinChanceJob(job, code).catch(() => {});
      return false;
    }
  };

  const processDue = async (limit = 40) => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      for (let count = 0; count < limit; count++) {
        const completed = await processNextCompletedGame().catch(() => false);
        const prediction = completed ? false : await processNextWinChanceJob().catch(() => false);
        if (!completed && !prediction) break;
      }
    } finally {
      tickRunning = false;
    }
  };

  const runNightlyCatchupIfDue = async () => {
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const parts = Object.fromEntries(local.map((part) => [part.type, part.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    if (Number(parts.hour) < 3 || today === lastCatchupDate) return;
    lastCatchupDate = today;
    console.info("[ScorekeeperRecalculation] Finalizing saved games left overnight and catching up recalculations.");
    for (let batch = 0; batch < 20; batch++) {
      const finalized = await finalizeOvernightScorekeeperSaves(25);
      if (finalized < 25) break;
    }
    await processDue(500);
  };

  return {
    processCompletedGame,
    processCompletedGames,
    processDue,
    start() {
      if (started) return;
      started = true;
      void processDue();
      timer = setInterval(() => {
        void processDue();
        void runNightlyCatchupIfDue().catch((error) =>
          console.error("[ScorekeeperRecalculation] Nightly catch-up failed.", { code: errorCode(error) }));
      }, 30_000);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      started = false;
    },
  };
}

