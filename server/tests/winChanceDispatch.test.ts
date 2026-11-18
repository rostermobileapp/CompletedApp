import test from "node:test";
import assert from "node:assert/strict";
import { dispatchWinChance } from "../winChanceDispatch";

const projectUrl = "https://fixture.supabase.co";
const secret = "sb_secret_test_only";
const targets = [
  { source_game_ids: ["game-1", "game-2"] },
  { source_game_id: "game-1" },
  { game_id: "game-1" },
  { team_id: "team-1" },
];

function dependencies(config = { project_url: projectUrl, secret_key: secret }) {
  let calls = 0;
  return {
    projectUrl,
    query: async (text: string) => {
      assert.match(text, /vault\.decrypted_secrets/);
      assert.match(text, /win_chance_secret_key/);
      return { rows: [config] };
    },
    fetch: (async () => { calls++; return Response.json({ ok: true }); }) as typeof fetch,
    calls: () => calls,
  };
}

test("all refresh targets use the Vault API secret, not a bearer service-role JWT", async () => {
  for (const body of targets) {
    const deps = dependencies();
    deps.fetch = (async (url, init) => {
      assert.equal(String(url), `${projectUrl}/functions/v1/recalculate-win-chance`);
      assert.equal(init?.method, "POST");
      assert.deepEqual(init?.headers, { "Content-Type": "application/json", apikey: secret });
      assert.deepEqual(JSON.parse(String(init?.body)), body);
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      return Response.json({ ok: true, updated: 2 });
    }) as typeof fetch;
    await dispatchWinChance(body, deps);
  }
});

test("missing, legacy, and cross-project configuration fail before network access", async () => {
  for (const config of [
    { project_url: projectUrl, secret_key: "" },
    { project_url: projectUrl, secret_key: "legacy-service-role-jwt" },
    { project_url: "https://other.supabase.co", secret_key: secret },
    { project_url: "http://fixture.supabase.co", secret_key: secret },
    { project_url: `${projectUrl}/unexpected`, secret_key: secret },
    { project_url: `${projectUrl}/?key=bad`, secret_key: secret },
    { project_url: "", secret_key: secret },
  ]) {
    const deps = dependencies(config);
    await assert.rejects(dispatchWinChance(targets[0], deps), { code: "WIN_CHANCE_CONFIG" });
    assert.equal(deps.calls(), 0);
  }
});

test("authentication and server failures expose only status, never response content", async () => {
  for (const status of [401, 403, 500, 503]) {
    const deps = dependencies();
    deps.fetch = (async () => new Response(`remote debug ${secret}`, { status })) as typeof fetch;
    await assert.rejects(dispatchWinChance(targets[0], deps), (error: any) => {
      assert.equal(error.code, `WIN_CHANCE_HTTP_${status}`);
      assert.ok(!String(error.stack).includes(secret));
      return true;
    });
  }
});

test("network failures and non-confirming success responses cannot acknowledge jobs", async () => {
  const deps = dependencies();
  deps.fetch = (async () => { throw new Error(`network debug ${secret}`); }) as typeof fetch;
  await assert.rejects(dispatchWinChance(targets[0], deps), { code: "WIN_CHANCE_TRANSPORT" });
  for (const response of [
    new Response("not json"), Response.json({}), Response.json({ ok: false }), Response.json(null),
  ]) {
    deps.fetch = (async () => response) as typeof fetch;
    await assert.rejects(dispatchWinChance(targets[0], deps), { code: "WIN_CHANCE_RESPONSE" });
  }
});

test("credential rotation is read on every dispatch", async () => {
  const deps = dependencies();
  let reads = 0;
  const received: string[] = [];
  deps.query = async () => ({
    rows: [{ project_url: projectUrl, secret_key: `sb_secret_rotation_${++reads}` }],
  });
  deps.fetch = (async (_url, init) => {
    received.push(new Headers(init?.headers).get("apikey")!);
    return Response.json({ ok: true });
  }) as typeof fetch;
  await dispatchWinChance(targets[0], deps);
  await dispatchWinChance(targets[0], deps);
  assert.deepEqual(received, ["sb_secret_rotation_1", "sb_secret_rotation_2"]);
});
