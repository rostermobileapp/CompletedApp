import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { isolateDevelopmentEnvironment } from "../../server/nonproductionEnvironment";
import { databaseEndpoint } from "../../server/testDatabaseGuard";

export async function parentDevelopmentConnection() {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.notEqual(process.env.PREVIEW_USE_LIVE_SECRETS, "1");
  assert.ok(process.env.DATABASE_URL && process.env.SUPABASE_URL);
  assert.notEqual(databaseEndpoint(process.env.DEV_DATABASE_URL!), databaseEndpoint(process.env.DATABASE_URL));
  const env = isolateDevelopmentEnvironment(process.env);
  const origin = new URL(env.DEV_SUPABASE_URL!).origin;
  assert.notEqual(origin, new URL(process.env.SUPABASE_URL!).origin);
  const url = new URL(env.DEV_DATABASE_URL!);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  const pool = new Pool({
    connectionString: url.toString(), max: 4, connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true, ca: await readFile(new URL("../../server/certs/supabase-ca.pem", import.meta.url), "utf8") },
  });
  pool.on("error", () => {}); // Callers emit sanitized status, never connection strings.
  return { pool, env, origin };
}
