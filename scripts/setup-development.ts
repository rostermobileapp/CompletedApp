import "../server/runtimeBootstrap";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { getDatabaseConnectionString } from "../server/testDatabaseGuard";
import { databaseEndpoint } from "../server/testDatabaseGuard";

async function main() {
  if (process.env.NODE_ENV !== "development" || process.env.NONPRODUCTION_ISOLATED !== "1") {
    throw new Error("Schema setup requires isolated development");
  }
  const connectionString = getDatabaseConnectionString(process.env, process.argv);
  if (!databaseEndpoint(connectionString).startsWith("supabase:")) {
    throw new Error("Unexpected development database provider");
  }
  const ddl = execFileSync("./node_modules/.bin/drizzle-kit", [
    "export", "--dialect", "postgresql", "--schema", "./shared/schema.ts",
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const sql = postgres(connectionString, {
    max: 1, connect_timeout: 10, idle_timeout: 1,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(new URL("../server/certs/supabase-ca.pem", import.meta.url), "utf8"),
    },
  });
  try {
    await sql.begin(async tx => {
      const [existing] = await tx`
        SELECT count(*)::int AS count FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
      `;
      if (existing.count !== 0) throw new Error("Refusing setup: development public schema is not empty");
      const [users] = await tx`SELECT count(*)::int AS count FROM auth.users`;
      if (users.count !== 0) throw new Error("Refusing setup: development already has Auth users");
      await tx.unsafe(ddl);
    });
    console.info("[Dev setup] Applied schema only to the empty isolated development database.");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch(error => {
  console.error("[Dev setup] Stopped without changing production.", { code: error?.code ?? "SETUP_REFUSED" });
  process.exitCode = 1;
});
