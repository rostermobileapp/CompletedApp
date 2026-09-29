import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { getDatabaseConnectionString } from "./testDatabaseGuard";

neonConfig.webSocketConstructor = ws;

export const pool = new Pool({
  connectionString: getDatabaseConnectionString(process.env, process.argv),
});
// The Neon pool removes its own client error listener while a client is checked
// out. A dropped WebSocket must not become an uncaught EventEmitter error and
// terminate the API; the failed query still rejects and the pool discards it.
pool.on('connect', (client) => {
  client.on('error', (error) => {
    console.error('[DB] Checked-out connection failed:', error.message);
  });
});
pool.on('error', (error) => {
  console.error('[DB] Idle connection failed:', error.message);
});
export const db = drizzle({ client: pool, schema });