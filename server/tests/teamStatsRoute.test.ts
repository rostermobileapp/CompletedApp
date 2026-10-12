import assert from "node:assert/strict";
import { once } from "node:events";
import express, { type RequestHandler } from "express";
import test from "node:test";
import { registerTeamStatsRoute } from "../teamStatsRoute";

const teamId = "opponent-team";
const leagueId = "stats-test-league";

async function getTeamStats(options: {
  viewerId: string;
  role?: string;
  commissionerId?: string;
  leagueProSeats?: { leagueId: string }[];
  viewerTeams?: { id: string; seasonIsActive?: boolean; isInCompletedTournament?: boolean }[];
}) {
  let statsReadCount = 0;
  const app = express();
  const auth: RequestHandler = (req, _res, next) => {
    (req as any).user = { claims: { sub: options.viewerId } };
    next();
  };

  registerTeamStatsRoute(app, auth, {
    storage: {
      getTeam: async () => ({ id: teamId, leagueId }),
      getUserLeagueMembership: async () => null,
      getUser: async () => ({ id: options.viewerId, role: options.role ?? "player" }),
      getLeague: async () => ({ id: leagueId, commissionerId: options.commissionerId }),
      getUserTeams: async () => options.viewerTeams ?? [],
      getActiveLeagueProSeatsForUser: async () => options.leagueProSeats ?? [],
    },
    db: { execute: async () => ({ rows: [] }) },
    getTeamRosterStats: async () => {
      statsReadCount += 1;
      return [{ userId: "opponent-player", goals: 3 }];
    },
    currentMonth: () => "2026-10",
  });

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/teams/${teamId}/stats`);
    return {
      response,
      statsReadCount,
      body: await response.json(),
    };
  } finally {
    const closed = once(server, "close");
    server.close();
    await closed;
  }
}

test("opponent team stats are forbidden to a non-premium viewer outside the team", async () => {
  const result = await getTeamStats({ viewerId: "ordinary-viewer" });

  assert.equal(result.response.status, 403);
  assert.equal(result.body.message, "Premium access required to view opponent team stats");
  assert.equal(result.statsReadCount, 0, "stats must not be queried for a forbidden viewer");
});

test("league commissioners can view opponent team stats", async () => {
  const result = await getTeamStats({
    viewerId: "league-commissioner",
    commissionerId: "league-commissioner",
  });

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, [{ userId: "opponent-player", goals: 3 }]);
  assert.equal(result.statsReadCount, 1);
});

test("premium viewers can view opponent team stats", async () => {
  const result = await getTeamStats({
    viewerId: "premium-viewer",
    role: "player_pro",
  });

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, [{ userId: "opponent-player", goals: 3 }]);
  assert.equal(result.statsReadCount, 1);
});

test("viewers with an active league Pro seat can view opponent team stats", async () => {
  const result = await getTeamStats({
    viewerId: "league-pro-viewer",
    leagueProSeats: [{ leagueId }],
  });

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, [{ userId: "opponent-player", goals: 3 }]);
  assert.equal(result.statsReadCount, 1);
});

test("free viewers can still view their own team's stats", async () => {
  const result = await getTeamStats({
    viewerId: "teammate",
    viewerTeams: [{ id: teamId }],
  });

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, [{ userId: "opponent-player", goals: 3 }]);
});
