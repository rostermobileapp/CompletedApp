import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runTriviaPushDelivery, triviaPushDate, triviaPushNextDelay, triviaPushScope,
  type TriviaPushStore, type TriviaPushRecipient,
} from "./triviaPushDelivery";

function fixture() {
  let now = new Date("2026-10-02T16:00:00Z");
  const sent = new Set<string>();
  const claimed = new Set<string>();
  const keys = new Map<string, string>();
  const retryAt = new Map<string, number>();
  const calls: Array<{ userId: string; date: string; idempotencyKey: string }> = [];
  const errors: unknown[] = [];
  let available: TriviaPushRecipient[] = [{ id: "owner", displayId: "U00001" }];
  let recipientEligible = true;
  let providerAccepts = true;
  let failSaveOnce = false;
  let reads = 0;
  const store: TriviaPushStore = {
    async list(date) {
      return available.filter(r => !sent.has(`${r.id}:${date}`) && now.getTime() >= (retryAt.get(`${r.id}:${date}`) ?? 0));
    },
    async claim(userId, date) {
      const id = `${userId}:${date}`;
      if (sent.has(id) || claimed.has(id)) return null;
      claimed.add(id);
      if (!keys.has(id)) keys.set(id, `stable-key-${id}`);
      return { token: `lease-${id}`, idempotencyKey: keys.get(id)! };
    },
    async eligible() { return recipientEligible; },
    async finish(userId, date, _lease, accepted) {
      if (accepted && failSaveOnce) { failSaveOnce = false; throw Error("Ambiguous save"); }
      const id = `${userId}:${date}`;
      claimed.delete(id);
      if (accepted) sent.add(id);
      else retryAt.set(id, now.getTime() + 5 * 60_000);
    },
  };
  const deps = {
    now: () => now, scope: ["U00001"] as string[] | null, store,
    async ensureQuestion(_date: string) { reads++; return { category: "nhl_history" as const }; },
    async send(input: { userId: string; date: string; idempotencyKey: string }) {
      calls.push(input);
      return providerAccepts;
    },
    logError(_message: string, error: unknown) { errors.push(error); },
  };
  return { deps, calls, errors, sent, reads: () => reads,
    time: (date: string) => { now = new Date(date); },
    recipients: (value: TriviaPushRecipient[]) => { available = value; },
    eligible: (value: boolean) => { recipientEligible = value; },
    accepts: (value: boolean) => { providerAccepts = value; },
    failSave: () => { failSaveOnce = true; },
  };
}

test("noon gate follows Eastern daylight saving, winter, and transition days", () => {
  for (const [before, noon, date] of [
    ["2026-10-02T15:59:59.999Z", "2026-10-02T16:00:00Z", "2026-10-02"],
    ["2026-01-02T16:59:59.999Z", "2026-01-02T17:00:00Z", "2026-01-02"],
    ["2026-03-08T15:59:59.999Z", "2026-03-08T16:00:00Z", "2026-03-08"],
    ["2026-11-01T16:59:59.999Z", "2026-11-01T17:00:00Z", "2026-11-01"],
  ]) {
    assert.equal(triviaPushDate(new Date(before)), null);
    assert.equal(triviaPushDate(new Date(noon)), date);
  }
  assert.equal(triviaPushDate(new Date("2026-10-03T03:59:59Z")), "2026-10-02");
  assert.equal(triviaPushDate(new Date("2026-10-03T04:00:00Z")), null);
  assert.equal(triviaPushDate(new Date(NaN)), null);
});

test("timer aligns with noon instead of delaying until the next minute", () => {
  assert.equal(triviaPushNextDelay(new Date("2026-10-02T15:59:30Z")), 30_000);
  assert.equal(triviaPushNextDelay(new Date("2026-10-02T15:00:00Z")), 60_000);
  assert.equal(triviaPushNextDelay(new Date("2026-10-02T16:00:00Z")), 60_000);
});

test("test mode is fail-closed and restricted to the explicitly approved account", () => {
  const beforeLaunch = new Date("2026-10-06T16:00:00Z");
  assert.deepEqual(triviaPushScope({}, beforeLaunch), ["U00001"]);
  assert.deepEqual(triviaPushScope({ TRIVIA_TEST_USER_IDS: " U00001,U00002 " }, beforeLaunch), ["U00001"]);
  assert.deepEqual(triviaPushScope({ TRIVIA_TEST_USER_IDS: "U00002" }, beforeLaunch), []);
  assert.deepEqual(triviaPushScope({ TRIVIA_TEST_USER_IDS: "" }, beforeLaunch), []);
  assert.equal(triviaPushScope({ TRIVIA_TEST_MODE: "false" }, beforeLaunch), null);
});

test("noon launch broadens delivery without replaying earlier dates or duplicate pushes", async () => {
  const f = fixture();
  const env = { TRIVIA_TEST_MODE: "true", TRIVIA_TEST_USER_IDS: "U00001" };
  f.recipients([{ id: "owner", displayId: "U00001" }, { id: "player", displayId: "U00002" }]);
  f.time("2026-10-06T16:00:00Z");
  f.deps.scope = triviaPushScope(env, f.deps.now());
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 1);
  f.time("2026-10-07T15:59:59.999Z");
  f.deps.scope = triviaPushScope(env, f.deps.now());
  assert.deepEqual(f.deps.scope, ["U00001"]);
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 0);
  f.time("2026-10-07T16:00:00.000Z");
  f.deps.scope = triviaPushScope(env, f.deps.now());
  assert.equal(f.deps.scope, null);
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 2);
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 0);
  assert.deepEqual(f.calls.map(call => [call.userId, call.date]), [
    ["owner", "2026-10-06"], ["owner", "2026-10-07"], ["player", "2026-10-07"],
  ]);
  assert.equal(triviaPushScope({ TRIVIA_TEST_USER_IDS: "" }, f.deps.now()), null);
});

test("before noon and empty allowlists perform no database or provider work", async () => {
  const f = fixture();
  f.time("2026-10-02T15:59:59Z");
  assert.equal((await runTriviaPushDelivery(f.deps)).date, null);
  f.time("2026-10-02T16:00:00Z");
  f.deps.scope = [];
  await runTriviaPushDelivery(f.deps);
  assert.equal(f.reads(), 0);
  assert.equal(f.calls.length, 0);
});

test("noon sends the approved account only, and repeat passes do not resend", async () => {
  const f = fixture();
  f.recipients([{ id: "owner", displayId: "U00001" }, { id: "other", displayId: "U00002" }]);
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 1);
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].userId, "owner");
  assert.equal(f.calls[0].date, "2026-10-02");
});

test("two concurrent workers can send only one occurrence", async () => {
  const f = fixture();
  await Promise.all([runTriviaPushDelivery(f.deps), runTriviaPushDelivery(f.deps)]);
  assert.equal(f.calls.length, 1);
});

test("after-noon restart catches up today, never yesterday; next day has a new key", async () => {
  const f = fixture();
  f.time("2026-10-02T22:00:00Z");
  await runTriviaPushDelivery(f.deps);
  await runTriviaPushDelivery(f.deps);
  f.time("2026-10-03T16:00:00Z");
  await runTriviaPushDelivery(f.deps);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls.map(c => c.date), ["2026-10-02", "2026-10-03"]);
  assert.notEqual(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
});

test("provider rejection retries after backoff with the same key", async () => {
  const f = fixture();
  f.accepts(false);
  assert.equal((await runTriviaPushDelivery(f.deps)).failed, 1);
  await runTriviaPushDelivery(f.deps);
  assert.equal(f.calls.length, 1);
  f.time("2026-10-02T16:05:00Z");
  f.accepts(true);
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 1);
  assert.equal(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
});

test("uncertain acceptance save retries the same provider occurrence", async () => {
  const f = fixture();
  f.failSave();
  assert.equal((await runTriviaPushDelivery(f.deps)).failed, 1);
  assert.equal(f.sent.size, 0);
  f.time("2026-10-02T16:05:00Z");
  await runTriviaPushDelivery(f.deps);
  assert.equal(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
  assert.equal(f.sent.size, 1);
});

test("provider exceptions do not mark sent and remain retryable", async () => {
  const f = fixture();
  f.deps.send = async () => { throw Error("Timeout"); };
  assert.equal((await runTriviaPushDelivery(f.deps)).failed, 1);
  assert.equal(f.sent.size, 0);
  assert.equal(f.errors.length, 1);
});

test("opt-out or lost lease prevents the external send", async () => {
  const f = fixture();
  f.eligible(false);
  assert.equal((await runTriviaPushDelivery(f.deps)).skipped, 1);
  assert.equal(f.calls.length, 0);
});

test("a date rollover during question lookup never sends yesterday's push", async () => {
  const f = fixture();
  f.deps.ensureQuestion = async () => { f.time("2026-10-03T04:00:00Z"); return { category: "nhl_history" }; };
  await runTriviaPushDelivery(f.deps);
  assert.equal(f.calls.length, 0);
});

test("no announcement is sent when the question is unavailable", async () => {
  const f = fixture();
  f.deps.ensureQuestion = async () => { throw Error("Question unavailable"); };
  await assert.rejects(runTriviaPushDelivery(f.deps), /Question unavailable/);
  assert.equal(f.calls.length, 0);
});

test("provider concurrency is bounded at five workers", async () => {
  const f = fixture();
  f.deps.scope = null;
  f.recipients(Array.from({ length: 12 }, (_, i) => ({ id: `player-${i}`, displayId: `U${i}` })));
  let active = 0, peak = 0, total = 0;
  f.deps.send = async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--; total++;
    return true;
  };
  assert.equal((await runTriviaPushDelivery(f.deps)).accepted, 12);
  assert.equal(total, 12);
  assert.equal(peak, 5);
});