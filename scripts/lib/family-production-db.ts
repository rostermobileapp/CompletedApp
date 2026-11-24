import { readFile } from "node:fs/promises";
import pg from "pg";
import { databaseEndpoint } from "../../server/testDatabaseGuard";

/** Never accept an arbitrary CLI URL or inherited PG* defaults. */
export async function familyProductionConnection() {
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.DEV_SUPABASE_URL ||
    !process.env.DEV_DATABASE_URL || process.env.NONPRODUCTION_ISOLATED === "1")
    throw new Error("PRODUCTION_CONFIGURATION_REQUIRED");
  const project = new URL(process.env.SUPABASE_URL);
  if (project.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(project.hostname) ||
    project.origin === new URL(process.env.DEV_SUPABASE_URL).origin ||
    databaseEndpoint(process.env.DATABASE_URL) !== `supabase:${project.hostname.split(".")[0]}/postgres` ||
    databaseEndpoint(process.env.DATABASE_URL) === databaseEndpoint(process.env.DEV_DATABASE_URL))
    throw new Error("PRODUCTION_TARGET_MISMATCH");
  const url = new URL(process.env.DATABASE_URL);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  const db = new pg.Client({
    connectionString: url.toString(), connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true, ca: await readFile(new URL("../../server/certs/supabase-ca.pem", import.meta.url), "utf8") },
  });
  await db.connect();
  return db;
}
