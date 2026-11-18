import test from "node:test";
import assert from "node:assert/strict";
import { handleWinChanceRequest, WIN_CHANCE_CONTRACT, WIN_CHANCE_TARGETS } from "../../supabase/functions/recalculate-win-chance/handler";

function fixture() {
  const calls: Array<{ kind: string; target: unknown }> = [];
  const admin = new Proxy({}, { get: () => assert.fail("handler accessed the database directly") });
  const calculator = (kind: string) => async (client: any, target: any) => {
    assert.equal(client, admin);
    calls.push({ kind, target });
    return { updated: 3 };
  };
  return {
    calls, admin,
    calculate: {
      recalculateGame: calculator("game_id"),
      recalculateSourceGame: calculator("source_game_id"),
      recalculateSourceGames: calculator("source_game_ids"),
      recalculateTeam: calculator("team_id"),
    },
  };
}
function post(body: unknown) {
  return new Request("https://fixture.supabase.co/functions/v1/recalculate-win-chance", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const targets = [
  { team_id: "team-1" }, { game_id: "game-1" },
  { source_game_id: "game-1" }, { source_game_ids: ["game-1", "game-2"] },
];

test("deployment handshake advertises every supported target without calculations", async () => {
  const f = fixture();
  const response = await handleWinChanceRequest(
    new Request("https://fixture.supabase.co/functions/v1/recalculate-win-chance?contract=1"),
    f.admin, f.calculate,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, contract: WIN_CHANCE_CONTRACT, targets: WIN_CHANCE_TARGETS });
  assert.deepEqual(f.calls, []);
});

for (const target of targets) {
  const kind = Object.keys(target)[0];
  test(`${kind} reaches its calculator and returns confirmed completion`, async () => {
    const f = fixture();
    const response = await handleWinChanceRequest(post(target), f.admin, f.calculate);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, updated: 3 });
    assert.deepEqual(f.calls, [{ kind, target: Object.values(target)[0] }]);
  });

  test(`${kind} validates without accessing the database or any calculator`, async () => {
    const f = fixture();
    const response = await handleWinChanceRequest(post({ ...target, validate_only: true }), f.admin, f.calculate);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, validated: true, contract: WIN_CHANCE_CONTRACT, target: kind });
    assert.deepEqual(f.calls, []);
  });
}

test("invalid bodies, ambiguous targets, and bad validation flags never reach a calculator", async () => {
  for (const body of [
    null, [], "text", {}, { unsupported: "target" },
    { team_id: "team", game_id: "game" }, { team_id: "" }, { game_id: " " },
    { source_game_id: 1 }, { source_game_ids: [] }, { source_game_ids: [""] },
    { source_game_ids: [null] }, { source_game_ids: [3] }, { source_game_ids: [" "] },
    { source_game_ids: Array(26).fill("game") }, { team_id: "a".repeat(101) },
    { source_game_ids: ["a".repeat(101)] }, { team_id: "team", validate_only: "true" },
  ]) {
    const f = fixture();
    const response = await handleWinChanceRequest(post(body), f.admin, f.calculate);
    assert.equal(response.status, 400);
    assert.deepEqual(f.calls, []);
  }
});

test("malformed JSON and unsupported methods do not calculate", async () => {
  const f = fixture();
  const malformed = new Request("https://fixture.supabase.co", { method: "POST", body: "{" });
  assert.equal((await handleWinChanceRequest(malformed, f.admin, f.calculate)).status, 400);
  for (const method of ["GET", "PUT", "DELETE"]) {
    assert.equal((await handleWinChanceRequest(new Request("https://fixture.supabase.co", { method }), f.admin, f.calculate)).status, 405);
  }
  assert.deepEqual(f.calls, []);
});

test("calculator failures cannot produce success or leak provider errors", async () => {
  const f = fixture();
  f.calculate.recalculateGame = async () => { throw new Error("private provider details"); };
  const response = await handleWinChanceRequest(post({ game_id: "game" }), f.admin, f.calculate);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Prediction update failed" });
});
