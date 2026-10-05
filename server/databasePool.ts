import { Pool } from "@neondatabase/serverless";

type PoolErrorLogger = (message: string, details: { code: string }) => void;

export function createDatabasePool(
  connectionString: string,
  logError: PoolErrorLogger = (message, details) => console.error(message, details),
) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

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
