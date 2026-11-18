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
  const migrations = process.argv.includes("--unlink-only")
    ? ["0057_organizer_stripe_unlink.sql"]
    : ["0056_organizer_direct_payments.sql", "0057_organizer_stripe_unlink.sql"];
  for (const name of migrations) {
    await pool.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  console.info("Direct organizer schema applied to isolated development only.");
} catch (error: any) {
  console.error("Direct development migration stopped.", { code: error?.code ?? "TARGET_GUARD_FAILED" });
  process.exitCode = 1;
} finally { await pool.end(); }
