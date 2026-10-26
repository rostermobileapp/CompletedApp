import { Pool } from "@neondatabase/serverless";
import { Pool as NativePool } from "pg";
import { readFileSync } from "node:fs";

type PoolErrorLogger = (message: string, details: { code: string }) => void;

export function createDatabasePool(
  connectionString: string,
  logError: PoolErrorLogger = (message, details) => console.error(message, details),
) {
  const options = {
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  };
  let pool: Pool;
  if (process.env.NODE_ENV === "development") {
    if (process.env.NONPRODUCTION_ISOLATED !== "1") {
      throw new Error("Development database transport requires validated isolation");
    }
    const url = new URL(connectionString);
    // pg's connection-string SSL options override explicit SSL configuration.
    // Use the trusted public Supabase CA, never sslmode=no-verify.
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
    pool = new NativePool({
      ...options, connectionString: url.toString(),
      ssl: { rejectUnauthorized: true, ca: readFileSync(new URL("./certs/supabase-ca.pem", import.meta.url), "utf8") },
    }) as unknown as Pool;
  } else {
    pool = new Pool(options);
  }

  // The pool removes a failed idle client before emitting this event. Without
  // a listener, EventEmitter throws and takes down the entire web server.
  pool.on("error", (error: Error & { code?: string }) => {
    logError("[Database] Idle connection lost; the pool discarded it.", {
      code: error.code ?? "unknown",
    });
  });

  // Do not retry queries here: replaying writes can duplicate payments or stats.
  // Active-query failures still reject, and later requests can obtain a new client.
  return pool;
}
