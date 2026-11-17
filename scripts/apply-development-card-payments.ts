import "../server/runtimeBootstrap";
import { readFile } from "node:fs/promises";
import { databaseEndpoint, getDatabaseConnectionString } from "../server/testDatabaseGuard";
import { pool } from "../server/db";

async function main() {
  if (process.env.NODE_ENV !== "development" || process.env.NONPRODUCTION_ISOLATED !== "1") {
    throw new Error("Card payment migration requires isolated development.");
  }

  const connectionString = getDatabaseConnectionString(process.env, process.argv);
  const endpoint = databaseEndpoint(connectionString);
  const devUrl = new URL(process.env.DEV_SUPABASE_URL!);
  const devProject = devUrl.hostname.split(".")[0];
  if (!endpoint.startsWith(`supabase:${devProject}/`)) {
    throw new Error("Card payment migration target does not match the isolated development Supabase project.");
  }
  const forbidden = JSON.parse(process.env.NONPRODUCTION_FORBIDDEN_DATABASES ?? "[]") as unknown;
  if (!Array.isArray(forbidden) || forbidden.length === 0 || forbidden.includes(endpoint)) {
    throw new Error("Card payment migration target is not isolated.");
  }

  const migration = await readFile(new URL("../migrations/0053_organizer_card_payments.sql", import.meta.url), "utf8");
  if (!/^BEGIN;\r?$/m.test(migration) || !/^COMMIT;\s*$/m.test(migration)) {
    throw new Error("Card payment migration must have explicit transaction boundaries.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('roster:organizer-card-payments'))");
    await client.query(migration.replace(/^BEGIN;\r?\n/m, "").replace(/^COMMIT;\s*$/m, ""));
    const verified = await client.query<{ ready: boolean }>(`
      SELECT
        to_regclass('public.organizer_card_payments') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='payment_requests' AND column_name='card_enabled'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='stripe_connected_accounts' AND column_name='transfers_enabled'
        ) AS ready
    `);
    if (!verified.rows[0]?.ready) throw new Error("Card payment migration verification failed.");
    await client.query("COMMIT");
    console.info("[Dev migration] Organizer card payments applied only to the isolated development Supabase project.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[Dev migration] Stopped without touching production.", {
    code: error?.code ?? "MIGRATION_REFUSED",
    message: error instanceof Error ? error.message : "Unknown migration error",
  });
  process.exitCode = 1;
});
