import { neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { getDatabaseConnectionString } from "./testDatabaseGuard";
import { createDatabasePool } from "./databasePool";

neonConfig.webSocketConstructor = ws;

export const pool = createDatabasePool(getDatabaseConnectionString(process.env, process.argv));
export const db = drizzle({ client: pool, schema });