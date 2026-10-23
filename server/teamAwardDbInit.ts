import { readFile } from "node:fs/promises";

type MigrationClient = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
  release: () => void;
};
type MigrationPool = { connect: () => Promise<MigrationClient> };

// Append future team-award updates here; never re-use an applied version.
const updates = [{
  version: "team-award-celebrations",
  source: new URL("../migrations/0045_team_award_celebrations.sql", import.meta.url),
}];

/** Startup owns the transaction; the SQL file also remains usable manually. */
function transactionBody(source: string): string {
  if (!/^BEGIN;\r?$/m.test(source) || !/^COMMIT;\s*$/m.test(source)) {
    throw new Error("Team-award update must have an explicit transaction wrapper.");
  }
  return source.replace(/^BEGIN;\r?\n/m, "").replace(/^COMMIT;\s*$/m, "");
}

/**
 * Pinned connection + transaction-scoped lock make concurrent app starts safe.
 * Missing original awards setup is deliberately left alone; never auto-enable it.
 * Caller injects the pool so tests cannot accidentally import the live database.
 */
export async function ensureTeamAwardDatabaseUpdates(pool: MigrationPool) {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('roster:team-award-schema-updates'))");
    const installed = await client.query("SELECT to_regclass('public.award_grant_events') IS NOT NULL AS ready");
    if (!installed.rows[0]?.ready) {
      await client.query("COMMIT");
      return { installed: false, applied };
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.team_award_schema_updates (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.team_award_schema_updates ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.team_award_schema_updates FROM PUBLIC,anon,authenticated;
    `);
    for (const update of updates) {
      const previous = await client.query(
        "SELECT 1 FROM public.team_award_schema_updates WHERE version=$1", [update.version]);
      if (previous.rows.length) continue;
      await client.query(transactionBody(await readFile(update.source, "utf8")));
      await client.query("INSERT INTO public.team_award_schema_updates(version) VALUES($1)", [update.version]);
      applied.push(update.version);
    }
    await client.query("COMMIT");
    return { installed: true, applied };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    client.release();
  }
}
