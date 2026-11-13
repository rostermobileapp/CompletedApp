import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GAME_SUMMARY_CACHE_VERSION,
  readVerifiedGameSummary,
  type GameSummaryKind,
  type VerifiedGameSummaryCache,
  type VerifiedGameSummaryStore,
} from "../verifiedGameSummaries.js";

function createMemoryStore() {
  let revision = "1";
  const cache = new Map<string, VerifiedGameSummaryCache>();
  const reports: Array<{ matched: boolean; sourceRevision: string }> = [];
  const key = (kind: GameSummaryKind, entityId: string, scopeKey: string) =>
    `${kind}:${entityId}:${scopeKey}`;
  const store: VerifiedGameSummaryStore = {
    async getSourceRevision() { return revision; },
    async getCache<T>(kind, entityId, scopeKey) {
      return (cache.get(key(kind, entityId, scopeKey)) as VerifiedGameSummaryCache<T>) ?? null;
    },
    async saveCache(kind, entityId, scopeKey, value) {
      cache.set(key(kind, entityId, scopeKey), value);
    },
    async recordParity({ matched, sourceRevision }) {
      reports.push({ matched, sourceRevision });
    },
  };
  return {
    store,
    reports,
    setRevision(value: string) { revision = value; },
    getCache(kind: GameSummaryKind, entityId: string, scopeKey: string) {
      return cache.get(key(kind, entityId, scopeKey));
    },
  };
}

test("summary reads require two raw parity matches for the same revision", async () => {
  const memory = createMemoryStore();
  let rawReads = 0;
  const computeRaw = async () => {
    rawReads++;
    return [{ teamId: "t1", wins: 3 }];
  };

  assert.deepEqual(await readVerifiedGameSummary(memory.store, {
    kind: "league_standings", entityId: "l1", scopeKey: "all",
    mode: "verify", computeRaw,
  }), [{ teamId: "t1", wins: 3 }]);
  assert.equal(memory.getCache("league_standings", "l1", "all")?.verified, false);

  await readVerifiedGameSummary(memory.store, {
    kind: "league_standings", entityId: "l1", scopeKey: "all",
    mode: "verify", computeRaw,
  });
  assert.equal(memory.getCache("league_standings", "l1", "all")?.verified, false);
  await readVerifiedGameSummary(memory.store, {
    kind: "league_standings", entityId: "l1", scopeKey: "all",
    mode: "verify", computeRaw,
  });
  assert.equal(memory.getCache("league_standings", "l1", "all")?.verified, true);

  const cachedValue = await readVerifiedGameSummary(memory.store, {
    kind: "league_standings", entityId: "l1", scopeKey: "all",
    mode: "summary", computeRaw,
  });
  assert.deepEqual(cachedValue, [{ teamId: "t1", wins: 3 }]);
  assert.equal(rawReads, 3);
});

test("a parity mismatch replaces the cached output and blocks summary use", async () => {
  const memory = createMemoryStore();
  await memory.store.saveCache("team_streaks", "t1", "all", {
    cacheVersion: GAME_SUMMARY_CACHE_VERSION,
    sourceRevision: "1", payload: { player: "HOT" }, matchingReads: 2, verified: true,
  });
  const raw = { player: "COLD" };

  const result = await readVerifiedGameSummary(memory.store, {
    kind: "team_streaks", entityId: "t1", scopeKey: "all",
    mode: "verify", computeRaw: async () => raw,
  });
  assert.deepEqual(result, raw);
  assert.equal(memory.reports.at(-1)?.matched, false);
  assert.equal(memory.getCache("team_streaks", "t1", "all")?.verified, false);
  assert.deepEqual(memory.getCache("team_streaks", "t1", "all")?.payload, raw);
});

test("a source revision change invalidates a verified cache", async () => {
  const memory = createMemoryStore();
  await memory.store.saveCache("trophy_case", "u1", "default", {
    cacheVersion: GAME_SUMMARY_CACHE_VERSION,
    sourceRevision: "1", payload: { count: 4 }, matchingReads: 2, verified: true,
  });
  memory.setRevision("2");
  let rawReads = 0;
  const result = await readVerifiedGameSummary(memory.store, {
    kind: "trophy_case", entityId: "u1", scopeKey: "default",
    mode: "summary",
    computeRaw: async () => { rawReads++; return { count: 5 }; },
  });
  assert.deepEqual(result, { count: 5 });
  assert.equal(rawReads, 1);
  assert.equal(memory.getCache("trophy_case", "u1", "default")?.verified, false);
  assert.equal(memory.getCache("trophy_case", "u1", "default")?.sourceRevision, "2");
});

test("an old payload version is rebuilt before it can be served", async () => {
  const memory = createMemoryStore();
  await memory.store.saveCache("team_streaks", "t1", "all", {
    cacheVersion: GAME_SUMMARY_CACHE_VERSION - 1,
    sourceRevision: "1", payload: { player: "HOT" }, matchingReads: 2, verified: true,
  });
  let rawReads = 0;
  const raw = { player: "COLD" };
  const result = await readVerifiedGameSummary(memory.store, {
    kind: "team_streaks", entityId: "t1", scopeKey: "all",
    mode: "summary",
    computeRaw: async () => { rawReads++; return raw; },
  });
  assert.deepEqual(result, raw);
  assert.equal(rawReads, 1);
  assert.equal(memory.getCache("team_streaks", "t1", "all")?.verified, false);
  assert.equal(memory.getCache("team_streaks", "t1", "all")?.cacheVersion, GAME_SUMMARY_CACHE_VERSION);
});

test("off mode never reads or writes summaries", async () => {
  const memory = createMemoryStore();
  const raw = { count: 9 };
  const result = await readVerifiedGameSummary(memory.store, {
    kind: "trophy_case", entityId: "u1", scopeKey: "default",
    mode: "off", computeRaw: async () => raw,
  });
  assert.deepEqual(result, raw);
  assert.equal(memory.getCache("trophy_case", "u1", "default"), undefined);
  assert.equal(memory.reports.length, 0);
});
