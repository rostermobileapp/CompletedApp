import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { sql } from "drizzle-orm";

// Exercise the actual registered handler without opening a server, bypassing
// running-app authentication, or writing to an application database.
const source = ts.createSourceFile(
  "routes.ts",
  readFileSync(new URL("../routes.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
let handlerSource = "";
function findHandler(node: ts.Node) {
  if (ts.isCallExpression(node) &&
      node.expression.getText(source) === "app.get" &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "/api/users/:userId/stats-trends") {
    handlerSource = node.arguments[node.arguments.length - 1].getText(source);
  }
  ts.forEachChild(node, findHandler);
}
findHandler(source);
assert.ok(handlerSource, "Stats & Trends handler must be registered");
const javascript = ts.transpileModule(`(${handlerSource})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText.trim().replace(/;$/, "");

async function invoke(gamePoints: number[], allowed = true, goalie = false) {
  const rows = gamePoints.map((points, i) => ({
    game_id: `game-${i}`,
    scheduled_at: `2026-11-${String(13 - i).padStart(2, "0")}`,
    goals: points, assists: 0, points, penalty_minutes: 0,
  }));
  const responses = goalie
    ? [
      [{ is_goalie: true }],
      [],
      [{ games_played: 0, goals: 0, assists: 0 }],
      [{ total_beers: 0 }],
    ]
    : [
      [{ is_goalie: false }],
      [{ row_count: 0, recorded_stat_rows: 0 }],
      rows,
      [{ total_beers: 0 }],
    ];
  const errors: unknown[] = [];
  let status = 200;
  let body: any;
  const handler = new Function("db", "sql", "canViewPlayerStats", "console",
    `return ${javascript}`)(
      { execute: async () => {
        assert.ok(responses.length, "unexpected database read");
        return { rows: responses.shift() };
      } },
      sql, async () => allowed, {
        error: (...args: unknown[]) => errors.push(args.map(value => value instanceof Error ? value.message : value)),
      },
    );
  await handler(
    { params: { userId: "player" }, query: {}, user: { claims: { sub: "viewer" } }, userWithPermissions: {} },
    { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } },
  );
  return { status, body, errors };
}

for (const sample of [
  { points: [], status: "NEUTRAL" },
  { points: [1], status: "NEUTRAL" },
  { points: [2, 1], status: "HOT" },
  { points: [0, 0, 2, 2], status: "COLD" },
  { points: [1, 0, 1, 0], status: "NEUTRAL" },
]) {
  test(`skater stats load for ${JSON.stringify(sample.points)} with ${sample.status} streak`, async () => {
    const result = await invoke(sample.points);
    assert.equal(result.status, 200, JSON.stringify(result.errors));
    assert.equal(result.body.streakStatus, sample.status);
    assert.equal(result.body.gameLog.length, sample.points.length);
    assert.equal(result.body.seasonTotals.goals, sample.points.reduce((a, b) => a + b, 0));
    assert.ok(Number.isFinite(result.body.streakRatio));
  });
}

test("goalie stats still load", async () => {
  const result = await invoke([], true, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.isGoalie, true);
});

test("stats entitlement remains enforced", async () => {
  const result = await invoke([], false);
  assert.equal(result.status, 403);
});
