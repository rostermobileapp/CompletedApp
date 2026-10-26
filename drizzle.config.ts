import { defineConfig } from "drizzle-kit";
import "./server/runtimeBootstrap";
import { getDatabaseConnectionString } from "./server/testDatabaseGuard";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseConnectionString(process.env, process.argv),
  },
});
