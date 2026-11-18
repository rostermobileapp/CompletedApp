/**
 * Explicitly read-only check of the external Supabase deployment and request
 * contract. Does not replay queues or calculate/save a prediction.
 *
 * npx tsx scripts/verify-win-chance-deployment.ts --production-read-only
 */
import pg from "pg";
import { readFile } from "node:fs/promises";
import { databaseEndpoint } from "../server/testDatabaseGuard";
import { WIN_CHANCE_CONTRACT, WIN_CHANCE_TARGETS } from "../supabase/functions/recalculate-win-chance/handler";

let client: pg.Client | undefined;
try {
  if (!process.argv.includes("--production-read-only")) throw new Error("READ_ONLY_CONFIRMATION_REQUIRED");
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL) throw new Error("CONFIG_MISSING");
  const project = new URL(process.env.SUPABASE_URL);
  if (project.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(project.hostname)) {
    throw new Error("INVALID_SUPABASE_PROJECT");
  }
  if (databaseEndpoint(process.env.DATABASE_URL) !== `supabase:${project.hostname.split(".")[0]}/postgres`) {
    throw new Error("PRODUCTION_TARGET_MISMATCH");
  }
  const connection = new URL(process.env.DATABASE_URL);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) connection.searchParams.delete(key);
  client = new pg.Client({
    connectionString: connection.toString(), connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true, ca: await readFile(new URL("../server/certs/supabase-ca.pem", import.meta.url), "utf8") },
  });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='10s'");
  const { rows } = await client.query(`
    SELECT
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='win_chance_project_url' LIMIT 1) AS project_url,
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='win_chance_secret_key' LIMIT 1) AS secret_key
  `);
  await client.query("ROLLBACK");
  const config = rows[0];
  if (config?.project_url?.trim().replace(/\/+$/, "") !== project.origin
    || !config?.secret_key?.trim().startsWith("sb_secret_")) throw new Error("VAULT_CONFIG_MISMATCH");

  const endpoint = new URL("/functions/v1/recalculate-win-chance", project);
  const headers = { apikey: config.secret_key.trim(), "Content-Type": "application/json" };
  const manifest = await fetch(`${endpoint}?contract=1`, {
    headers, redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  const contract = await manifest.json().catch(() => null);
  if (!manifest.ok || contract?.ok !== true || contract?.contract !== WIN_CHANCE_CONTRACT
    || !WIN_CHANCE_TARGETS.every(target => contract?.targets?.includes(target))) {
    throw new Error("DEPLOYED_FUNCTION_CONTRACT_OUTDATED");
  }
  // Never send POST probes to a function without the explicit dry-run contract.
  for (const target of WIN_CHANCE_TARGETS) {
    const response = await fetch(endpoint, {
      method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        [target]: target === "source_game_ids" ? ["__contract_probe_only__"] : "__contract_probe_only__",
        validate_only: true,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || result?.validated !== true
      || result?.contract !== WIN_CHANCE_CONTRACT || result?.target !== target) {
      throw new Error("DEPLOYED_FUNCTION_VALIDATION_FAILED");
    }
  }
  console.log(JSON.stringify({
    productionTargetMatched: true, contract: WIN_CHANCE_CONTRACT,
    validatedTargets: WIN_CHANCE_TARGETS, recalculationsInvoked: 0, predictionsWritten: 0,
  }));
} catch (error) {
  // Provider errors can contain credentials. Only our fixed guard errors print.
  const allowed = [
    "READ_ONLY_CONFIRMATION_REQUIRED", "CONFIG_MISSING", "INVALID_SUPABASE_PROJECT",
    "PRODUCTION_TARGET_MISMATCH", "VAULT_CONFIG_MISMATCH",
    "DEPLOYED_FUNCTION_CONTRACT_OUTDATED", "DEPLOYED_FUNCTION_VALIDATION_FAILED",
  ];
  const message = error instanceof Error ? error.message : "";
  console.error("Win-chance read-only verification failed:", allowed.includes(message) ? message : "CONNECTION_OR_PROVIDER_ERROR");
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
