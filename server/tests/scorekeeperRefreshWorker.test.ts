import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const bundle = await build({
  entryPoints: ["server/scorekeeperRecalculation.ts"],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  plugins: [{
    name: "isolated-worker",
    setup(build) {
      build.onResolve({ filter: /^worker-state$/ }, ({ path }) => ({ path, external: true }));
      build.onResolve({ filter: /^\.\/(db|storage|badges|scorekeeperFinalization)$/ },
        ({ path }) => ({ path, namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: {
          "./db": "export const {db,pool}=require('worker-state');",
          "./storage": "export const storage=require('worker-state').storage;",
          "./badges": "export const evaluateBadgesForUsers=require('worker-state').badges;",
          "./scorekeeperFinalization": "export const finalizeOvernightScorekeeperSaves=async()=>0;",
        }[path]!,
        loader: "js", resolveDir: process.cwd(),
      }));
    },
  }],
});

function fixture(options: { failResponses?: number; badgeFailure?: boolean; alreadyDone?: boolean } = {}) {
  const marks: string[] = [];
  const deferrals: string[] = [];
  const deleted: string[] = [];
  const dispatched: any[] = [];
  const claimed = new Set<string>();
  let lineRequests = 0;
  const state = {
    db: { select: () => {
      const query = {
        from: () => query, where: () => query,
        limit: async () => [{
          id: "game-1", isCompleted: true, scheduledAt: "2026-11-15",
          homeTeamId: "home", awayTeamId: "away", leagueId: "league", seasonId: "season",
        }],
      };
      return query;
    } },
    storage: { getTeamMembers: async () => [{ userId: "player-1" }, { userId: "player-2" }] },
    badges: async (evaluations: unknown[]) => {
      assert.equal(evaluations.length, 2, "roster participants are deduplicated");
      return options.badgeFailure
        ? [{ status: "rejected", reason: { code: "BADGE_FAILURE" } }]
        : [{ status: "fulfilled" }];
    },
    pool: { query: async (text: string, params: any[] = []) => {
      if (text.includes("WITH candidate")) {
        const gameId = params[0];
        if (claimed.has(gameId)) return { rows: [] };
        claimed.add(gameId);
        return { rows: [{
          game_id: gameId, revision: 1, badges_done: !!options.alreadyDone,
          line_combo_done: !!options.alreadyDone, win_odds_done: false,
        }] };
      }
      if (text.includes("FROM game_attendance")) return { rows: [] };
      if (text.includes("vault.decrypted_secrets")) return { rows: [{
        project_url: "https://fixture.supabase.co", secret_key: "sb_secret_fixture",
      }] };
      if (text.includes("SET attempts = attempts + 1")) {
        deferrals.push(params[2]); return { rows: [] };
      }
      if (text.includes("SET badges_done = true")) marks.push("badges");
      else if (text.includes("SET line_combo_done = true")) marks.push("lines");
      else if (text.includes("SET win_odds_done = true")) marks.push("odds");
      else if (text.includes("DELETE FROM public.scorekeeper_game_recalculation_queue")) deleted.push(params[0]);
      else if (!text.includes("DELETE FROM public.win_chance_recalculation_queue")) {
        assert.fail(`unexpected worker SQL: ${text}`);
      }
      return { rows: [] };
    } },
  };
  const module = { exports: {} as any };
  const require = createRequire(import.meta.url);
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports,
    require: (name: string) => name === "worker-state" ? state : require(name),
    process: { env: { SUPABASE_URL: "https://fixture.supabase.co" } },
    console: { error() {}, info() {} },
    URL, AbortSignal, Response, setTimeout, setInterval, clearInterval,
    fetch: async (_url: URL, init: RequestInit) => {
      dispatched.push(JSON.parse(String(init.body)));
      return Response.json(
        { ok: dispatched.length > (options.failResponses ?? 0) },
        { status: dispatched.length <= (options.failResponses ?? 0) ? 401 : 200 },
      );
    },
  });
  const worker = module.exports.createScorekeeperRecalculationWorker(async (teams: string[]) => {
    assert.deepEqual([...teams].sort(), ["away", "home"]);
    lineRequests++;
  });
  return { worker, marks, deferrals, deleted, dispatched, lines: () => lineRequests };
}

test("finalized game batches reach odds only after badges and line learning succeed", async () => {
  const f = fixture();
  await f.worker.processCompletedGames(["game-1", "game-2"]);
  assert.deepEqual(f.marks, ["badges", "badges", "lines", "lines", "odds", "odds"]);
  assert.deepEqual(f.dispatched, [{ source_game_ids: ["game-1", "game-2"] }]);
  assert.equal(f.lines(), 1);
  assert.deepEqual(f.deleted.sort(), ["game-1", "game-2"]);
  assert.deepEqual(f.deferrals, []);
});

test("a single-game dispatch retries transient authentication failure before acknowledging", async () => {
  const f = fixture({ failResponses: 1 });
  await f.worker.processCompletedGame("game-1");
  assert.equal(f.dispatched.length, 2);
  assert.deepEqual(f.marks, ["badges", "lines", "odds"]);
  assert.deepEqual(f.deleted, ["game-1"]);
});

test("persistent authentication failure retains jobs and never marks odds complete", async () => {
  const f = fixture({ failResponses: 2, alreadyDone: true });
  await assert.rejects(f.worker.processCompletedGames(["game-1", "game-2"]), { code: "WIN_CHANCE_HTTP_401" });
  assert.equal(f.dispatched.length, 2);
  assert.deepEqual(f.marks, []);
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(f.deferrals, ["WIN_CHANCE_HTTP_401", "WIN_CHANCE_HTTP_401"]);
  assert.equal(f.lines(), 0);
});

test("badge failure keeps the existing ordering and retry safeguards", async () => {
  const f = fixture({ badgeFailure: true });
  await assert.rejects(f.worker.processCompletedGames(["game-1"]), { code: "BADGE_FAILURE" });
  assert.deepEqual(f.dispatched, []);
  assert.deepEqual(f.marks, []);
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(f.deferrals, ["BADGE_FAILURE"]);
});
