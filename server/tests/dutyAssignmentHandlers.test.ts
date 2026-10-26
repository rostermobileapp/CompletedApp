import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import {
  DutyAssignmentError, registerDutyAssignmentHandlers,
  type DutyAssignmentDependencies, type DutyContext,
} from "../dutyAssignmentHandlers";

const assignments = new Map<string, string>();
const context: DutyContext = {
  gameId: "game", teamId: "team", tournamentTeamIds: [], substituteGameId: "game", teamEventId: null,
};
let playersRead = 0;
const dependencies: DutyAssignmentDependencies = {
  async resolveContext(gameId, teamId) {
    if (gameId === "missing") throw new DutyAssignmentError(404, "Game not found");
    if (teamId !== "team" && teamId !== "tournament-team") {
      throw new DutyAssignmentError(403, "Team is not playing");
    }
    return { ...context, gameId };
  },
  async isCaptain(teamId, actor) { return teamId === "team" && actor === "captain"; },
  async getPlayers() {
    playersRead++;
    return [
      { userId: "player", firstName: "Test", lastName: "Player" },
      { userId: "substitute", firstName: "Approved", lastName: "Sub" },
      { userId: "captain", firstName: "Team", lastName: "Captain" },
    ];
  },
  async getAvailableTemplates() { return [{ id: "beverages" }, { id: "snacks" }]; },
  async save(scope, dutyId, userId) {
    const key = `${scope.gameId}:${scope.teamId}:${dutyId}`;
    if (userId === null) assignments.delete(key);
    else assignments.set(key, userId);
  },
};
let server: Server;
let base: string;
before(async () => {
  const app = express();
  app.use(express.json());
  registerDutyAssignmentHandlers(app, (req, res, next) => {
    const actor = req.header("x-test-actor");
    if (!actor) { res.status(401).json({ message: "Sign in required" }); return; }
    (req as any).user = { claims: { sub: actor } };
    next();
  }, dependencies);
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

function request(path: string, body?: unknown, actor: string | null = "captain") {
  return fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "PUT",
    headers: { "Content-Type": "application/json", ...(actor ? { "x-test-actor": actor } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const picker = "/api/games/game/teams/team/duty-players";
const endpoint = "/api/games/game/duties/beverages/assignment";

test("captains can load eligible roster players and approved substitutes", async () => {
  const response = await request(picker);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map((p: any) => p.userId), ["player", "substitute", "captain"]);
});
test("unauthenticated requests cannot view or assign", async () => {
  assert.equal((await request(picker, undefined, null)).status, 401);
  assert.equal((await request(endpoint, { teamId: "team", userId: "player" }, null)).status, 401);
});
test("ordinary players cannot load the picker or assign, reassign or clear", async () => {
  const before = playersRead;
  assert.equal((await request(picker, undefined, "player")).status, 403);
  for (const userId of ["player", "substitute", null]) {
    assert.equal((await request(endpoint, { teamId: "team", userId }, "player")).status, 403);
  }
  assert.equal(playersRead, before);
});
test("captain can assign, reassign, and clear one game without affecting others", async () => {
  assignments.clear();
  assignments.set("other-game:team:beverages", "player");
  assert.equal((await request(endpoint, { teamId: "team", userId: "player" })).status, 200);
  assert.equal(assignments.get("game:team:beverages"), "player");
  assert.equal((await request(endpoint, { teamId: "team", userId: "substitute" })).status, 200);
  assert.equal(assignments.get("game:team:beverages"), "substitute");
  assert.equal((await request(endpoint, { teamId: "team", userId: null })).status, 200);
  assert.equal(assignments.has("game:team:beverages"), false);
  assert.equal(assignments.get("other-game:team:beverages"), "player");
});
test("captains can assign themselves and linked tournament team uses canonical team ID", async () => {
  assert.equal((await request(endpoint, { teamId: "tournament-team", userId: "captain" })).status, 200);
  assert.equal(assignments.get("game:team:beverages"), "captain");
});
test("an opposing, pending, or unrelated player is rejected", async () => {
  for (const userId of ["opponent", "pending-sub", "unrelated"]) {
    assert.equal((await request(endpoint, { teamId: "team", userId })).status, 400);
  }
  assert.equal(assignments.get("game:team:beverages"), "captain");
});
test("foreign, excluded, and otherwise unavailable duties cannot be written or cleared", async () => {
  for (const userId of ["player", null]) {
    assert.equal((await request(endpoint.replace("beverages", "foreign-duty"), { teamId: "team", userId })).status, 404);
  }
});
test("team must participate in the game, including when clearing", async () => {
  for (const userId of ["player", null]) {
    assert.equal((await request(endpoint, { teamId: "unrelated-team", userId })).status, 403);
  }
});
test("missing game is rejected", async () => {
  assert.equal((await request(endpoint.replace("/game/", "/missing/"), { teamId: "team", userId: "player" })).status, 404);
});
test("invalid bodies never silently clear an assignment", async () => {
  for (const body of [{}, { teamId: 2, userId: "player" }, { teamId: "team" },
    { teamId: "team", userId: "" }, { teamId: "team", userId: 1 }]) {
    assert.equal((await request(endpoint, body)).status, 400);
  }
  assert.equal(assignments.get("game:team:beverages"), "captain");
});
