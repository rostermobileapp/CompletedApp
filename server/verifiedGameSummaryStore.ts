import { sql } from "drizzle-orm";
import { db } from "./db";
import type {
  GameSummaryKind,
  VerifiedGameSummaryCache,
  VerifiedGameSummaryStore,
} from "./verifiedGameSummaries";

export const databaseGameSummaryStore: VerifiedGameSummaryStore = {
  async getSourceRevision(kind, entityId) {
    if (kind === "trophy_case") {
      const result = await db.execute(sql`
        SELECT
          COALESCE(MAX(revision) FILTER (WHERE entity_id = ${entityId}), 0)::text
          || ':' ||
          COALESCE(MAX(revision) FILTER (WHERE entity_id = '*'), 0)::text AS revision
        FROM game_summary_source_revisions
        WHERE summary_type = ${kind}
          AND entity_id IN (${entityId}, '*')
      `);
      return String(result.rows[0]?.revision ?? "0:0");
    }
    const result = await db.execute(sql`
      SELECT revision::text AS revision
      FROM game_summary_source_revisions
      WHERE summary_type = ${kind} AND entity_id = ${entityId}
    `);
    return String(result.rows[0]?.revision ?? "0");
  },

  async getCache<T>(kind: GameSummaryKind, entityId: string, scopeKey: string) {
    const result = await db.execute(sql`
      SELECT cache_version, source_revision, payload, matching_reads, is_verified
      FROM verified_game_summary_cache
      WHERE summary_type = ${kind}
        AND entity_id = ${entityId}
        AND scope_key = ${scopeKey}
      LIMIT 1
    `);
    const row = result.rows[0];
    return row ? {
      cacheVersion: Number(row.cache_version),
      sourceRevision: String(row.source_revision),
      payload: row.payload as T,
      matchingReads: Number(row.matching_reads),
      verified: row.is_verified === true,
    } : null;
  },

  async saveCache<T>(
    kind: GameSummaryKind,
    entityId: string,
    scopeKey: string,
    cache: VerifiedGameSummaryCache<T>,
  ) {
    await db.execute(sql`
      INSERT INTO verified_game_summary_cache (
        summary_type, entity_id, scope_key, cache_version, source_revision, payload,
        matching_reads, is_verified, computed_at, verified_at
      ) VALUES (
        ${kind}, ${entityId}, ${scopeKey}, ${cache.cacheVersion}, ${cache.sourceRevision},
        ${JSON.stringify(cache.payload)}::jsonb, ${cache.matchingReads},
        ${cache.verified}, clock_timestamp(),
        CASE WHEN ${cache.verified} THEN clock_timestamp() ELSE NULL END
      )
      ON CONFLICT (summary_type, entity_id, scope_key) DO UPDATE SET
        cache_version = EXCLUDED.cache_version,
        source_revision = EXCLUDED.source_revision,
        payload = EXCLUDED.payload,
        matching_reads = EXCLUDED.matching_reads,
        is_verified = EXCLUDED.is_verified,
        computed_at = EXCLUDED.computed_at,
        verified_at = EXCLUDED.verified_at
    `);
  },

  async recordParity(input) {
    await db.execute(sql`
      INSERT INTO game_summary_parity_reports (
        summary_type, entity_id, scope_key, source_revision, matched,
        cached_hash, raw_hash, row_count
      ) VALUES (
        ${input.kind}, ${input.entityId}, ${input.scopeKey}, ${input.sourceRevision},
        ${input.matched}, ${input.cachedHash}, ${input.rawHash}, ${input.rowCount}
      )
    `);
  },
};
