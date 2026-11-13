import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const source = readFileSync("server/routes.ts", "utf8").match(
  /app\.get\('\/api\/games\/:gameId\/prediction'[\s\S]*?^  \}\);/m,
)?.[0];
assert.ok(source);

async function request(entitled: boolean, member = true) {
  const games = { id: "id", homeTeamId: "home", awayTeamId: "away", leagueId: "league" };
  const teamMemberships = { userId: "user", status: "status", teamId: "team" };
  const leagueMemberships = { userId: "user", status: "status", assignedTeamId: "team" };
  const teams = { id: "id", captainId: "captain" };
  const gamePredictions = Object.fromEntries([
    "gameId", "homeTeamId", "awayTeamId", "homeWinProbability", "awayWinProbability", "tieProbability",
  ].map(key => [key, key]));
  const prediction = {
    gameId: "game", homeTeamId: "home", awayTeamId: "away",
    homeWinProbability: "0.95", awayWinProbability: "0.05", tieProbability: "0",
    topScorersHome: Array.from({ length: 10 }, (_, id) => ({ id })),
    moneylineHome: "-1900", overUnderLine: "8.5",
  };
  const selections: unknown[] = [];
  let handler: any;
  const db = {
    select(fields?: Record<string, unknown>) {
      return { from(table: unknown) {
        let rows: any[] = [];
        if (table === games) rows = [{ homeTeamId: "home", awayTeamId: "away", leagueId: "league" }];
        if (table === teamMemberships && member) rows = [{ teamId: "home" }];
        if (table === gamePredictions) {
          selections.push(fields);
          rows = [fields ? Object.fromEntries(Object.keys(fields).map(key => [key, prediction[key as keyof typeof prediction]])) : prediction];
        }
        const query = {
          where: () => query,
          limit: () => Promise.resolve(rows),
          then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
        };
        return query;
      } };
    },
  };
  runInNewContext(transformSync(source!, { loader: "ts" }).code, {
    app: { get: (_path: string, ...handlers: any[]) => { handler = handlers.at(-1); } },
    isAuthenticated: () => {}, loadUserPermissions: () => {},
    games, teamMemberships, leagueMemberships, teams, gamePredictions, db,
    eq: () => true, and: () => true, inArray: () => true,
    canAccessLeaguePremiumFeatures: async (_user: unknown, league: string) => {
      assert.equal(league, "league");
      return entitled;
    },
    canAccessPremiumFeatures: () => entitled,
    console,
  });
  let body: any;
  let status = 200;
  const res = {
    set: () => res,
    status: (code: number) => { status = code; return res; },
    json: (value: unknown) => { body = value; return res; },
  };
  await handler({ params: { gameId: "game" }, user: { claims: { sub: "viewer" } }, userWithPermissions: { id: "viewer" } }, res);
  return { body, status, selections };
}

test("free roster members receive only the basic win chance, never premium details", async () => {
  const { body, status, selections } = await request(false);
  assert.equal(status, 200);
  assert.equal(body.canViewDetails, false);
  assert.equal(body.homeWinProbability, 0.95);
  assert.equal(body.topScorersHome, undefined);
  assert.equal(body.moneylineHome, undefined);
  assert.equal(body.overUnderLine, undefined);
  assert.ok(selections[0], "free reads use an explicit summary projection");
});

test("premium roster members receive the full latest saved forecast", async () => {
  const { body, status } = await request(true);
  assert.equal(status, 200);
  assert.equal(body.canViewDetails, true);
  assert.equal(body.topScorersHome.length, 10);
  assert.equal(body.overUnderLine, 8.5);
});

test("premium access does not bypass the team-membership requirement", async () => {
  const { status, selections } = await request(true, false);
  assert.equal(status, 403);
  assert.equal(selections.length, 0);
});
