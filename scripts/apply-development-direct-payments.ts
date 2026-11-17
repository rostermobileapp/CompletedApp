import "../server/runtimeBootstrap";
import { readFile } from "node:fs/promises";
import { databaseEndpoint, getDatabaseConnectionString } from "../server/testDatabaseGuard";
import { pool } from "../server/db";

try {
  if (process.env.NODE_ENV !== "development" || process.env.NONPRODUCTION_ISOLATED !== "1") {
    throw new Error("Isolated development is required.");
  }
  const endpoint = databaseEndpoint(getDatabaseConnectionString(process.env, process.argv));
  const project = new URL(process.env.DEV_SUPABASE_URL!).hostname.split(".")[0];
  const forbidden = JSON.parse(process.env.NONPRODUCTION_FORBIDDEN_DATABASES ?? "[]");
  if (!endpoint.startsWith(`supabase:${project}/`) || !Array.isArray(forbidden) ||
      !forbidden.length || forbidden.includes(endpoint)) throw new Error("Development target is not isolated.");
  const migration = await readFile(new URL("../migrations/0056_organizer_direct_payments.sql", import.meta.url), "utf8");
  await pool.query(migration);
  console.info("Direct organizer schema applied to isolated development only.");
} catch (error: any) {
  console.error("Direct development migration stopped.", { code: error?.code ?? "TARGET_GUARD_FAILED" });
  process.exitCode = 1;
} finally { await pool.end(); }
