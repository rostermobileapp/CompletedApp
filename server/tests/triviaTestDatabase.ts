import { Pool as TcpPool } from "pg";
import { sql } from "drizzle-orm";
import { db, pool } from "../db.js";
import { getDatabaseConnectionString } from "../testDatabaseGuard.js";

const connectionString = getDatabaseConnectionString(process.env, process.argv);
const testDatabase = new URL(connectionString);
if (testDatabase.hostname !== "127.0.0.1" || testDatabase.port !== "55432" ||
    testDatabase.pathname !== "/roster_trivia_test") {
  throw new Error("Trivia integration tests may mutate only the isolated local roster_trivia_test database on port 55432.");
}

const tcpPool = new TcpPool({ connectionString });
const neonPool = pool as unknown as {
  query: typeof tcpPool.query;
  connect: typeof tcpPool.connect;
  end: typeof tcpPool.end;
};
neonPool.query = tcpPool.query.bind(tcpPool) as typeof tcpPool.query;
neonPool.connect = tcpPool.connect.bind(tcpPool) as typeof tcpPool.connect;
neonPool.end = tcpPool.end.bind(tcpPool) as typeof tcpPool.end;

export async function prepareTriviaTestDatabase() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id varchar PRIMARY KEY,
      email varchar NOT NULL UNIQUE,
      first_name varchar NOT NULL DEFAULT '',
      last_name varchar NOT NULL DEFAULT '',
      role varchar NOT NULL DEFAULT 'free_tier',
      date_of_birth date,
      display_id varchar UNIQUE,
      onboarding_completed boolean NOT NULL DEFAULT false,
      last_updated timestamp NOT NULL DEFAULT now(),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      fee_exempt boolean NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS leagues (id varchar PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS seasons (id varchar PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS teams (id varchar PRIMARY KEY);
  `);
}