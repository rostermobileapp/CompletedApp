import { createHash } from "node:crypto";

export type GameSummaryKind = "league_standings" | "team_streaks" | "trophy_case";
export type GameSummaryReadMode = "off" | "verify" | "summary";
export const GAME_SUMMARY_CACHE_VERSION = 1;

export interface VerifiedGameSummaryCache<T = unknown> {
  cacheVersion: number;
  sourceRevision: string;
  payload: T;
  matchingReads: number;
  verified: boolean;
}

export interface VerifiedGameSummaryStore {
  getSourceRevision(kind: GameSummaryKind, entityId: string): Promise<string>;
  getCache<T>(kind: GameSummaryKind, entityId: string, scopeKey: string): Promise<VerifiedGameSummaryCache<T> | null>;
  saveCache<T>(
    kind: GameSummaryKind,
    entityId: string,
    scopeKey: string,
    cache: VerifiedGameSummaryCache<T>,
  ): Promise<void>;
  recordParity(input: {
    kind: GameSummaryKind;
    entityId: string;
    scopeKey: string;
    sourceRevision: string;
    matched: boolean;
    cachedHash: string;
    rawHash: string;
    rowCount: number;
  }): Promise<void>;
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toJSON());
  if (value && typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return stableJson((value as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => item === undefined ? "null" : stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(object[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function countRows(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value == null ? 0 : 1;
}

export function getGameSummaryReadMode(
  env: NodeJS.ProcessEnv = process.env,
): GameSummaryReadMode {
  const configured = env.GAME_SUMMARY_READ_MODE ?? "off";
  if (configured === "off" || configured === "verify" || configured === "summary") {
    return configured;
  }
  throw new Error(`Invalid GAME_SUMMARY_READ_MODE: ${configured}`);
}

/**
 * Raw reads populate and verify summaries. A summary is served only after two
 * independent raw comparisons for the same source revision have matched.
 * Any mismatch replaces the cache with the raw result and resets verification.
 */
export async function readVerifiedGameSummary<T>(
  store: VerifiedGameSummaryStore,
  input: {
    kind: GameSummaryKind;
    entityId: string;
    scopeKey: string;
    mode?: GameSummaryReadMode;
    computeRaw: () => Promise<T>;
  },
): Promise<T> {
  const mode = input.mode ?? getGameSummaryReadMode();
  if (mode === "off") return input.computeRaw();

  let sourceRevision = await store.getSourceRevision(input.kind, input.entityId);
  const cache = await store.getCache<T>(input.kind, input.entityId, input.scopeKey);
  if (
    mode === "summary" &&
    cache?.sourceRevision === sourceRevision &&
    cache.cacheVersion === GAME_SUMMARY_CACHE_VERSION &&
    cache.verified
  ) {
    if (await store.getSourceRevision(input.kind, input.entityId) === sourceRevision) {
      return cache.payload;
    }
    sourceRevision = await store.getSourceRevision(input.kind, input.entityId);
  }

  const raw = await input.computeRaw();
  // Do not label or cache a result if any source changed while it was computed.
  if (await store.getSourceRevision(input.kind, input.entityId) !== sourceRevision) {
    return raw;
  }

  if (cache?.sourceRevision === sourceRevision && cache.cacheVersion === GAME_SUMMARY_CACHE_VERSION) {
    const cachedHash = hash(cache.payload);
    const rawHash = hash(raw);
    const matched = cachedHash === rawHash;
    const matchingReads = matched ? cache.matchingReads + 1 : 0;
    await store.recordParity({
      kind: input.kind,
      entityId: input.entityId,
      scopeKey: input.scopeKey,
      sourceRevision,
      matched,
      cachedHash,
      rawHash,
      rowCount: countRows(raw),
    });
    await store.saveCache(input.kind, input.entityId, input.scopeKey, {
      cacheVersion: GAME_SUMMARY_CACHE_VERSION,
      sourceRevision,
      payload: raw,
      matchingReads,
      verified: matched && matchingReads >= 2,
    });
  } else {
    await store.saveCache(input.kind, input.entityId, input.scopeKey, {
      cacheVersion: GAME_SUMMARY_CACHE_VERSION,
      sourceRevision,
      payload: raw,
      matchingReads: 0,
      verified: false,
    });
  }

  // Verification mode always serves the old calculation. Summary mode falls
  // back to it until the cache has passed the required comparisons.
  return raw;
}
