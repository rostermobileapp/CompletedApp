import assert from "node:assert/strict";
import test from "node:test";
import { buildTestDatabaseEnvironment } from "../testDatabaseEnvironment";

const source = {
  PGHOST: "test-managed.neon.tech",
  PGPORT: "5432",
  PGUSER: "fixture_user",
  PGPASSWORD: "fixture@password:/",
  PGDATABASE: "existing_database",
  DATABASE_URL: "postgres://app:fixture@db.production-project.supabase.co/postgres",
  DEV_DATABASE_URL: "postgres://app:fixture@db.dev-project.supabase.co/postgres",
  DEV_SUPABASE_URL: "https://dev-project.supabase.co",
  DEV_SUPABASE_SERVICE_ROLE_KEY: "synthetic-dev-key",
  STRIPE_SECRET_KEY: "synthetic-live-key",
  ONESIGNAL_REST_API_KEY: "synthetic-live-key",
  RESEND_API_KEY: "synthetic-live-key",
  REVENUECAT_API_KEY: "synthetic-live-key",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-production-key",
  NODE_OPTIONS: "--require dangerous-hook",
  TRIVIA_PUSH_TEST_DATABASE_URL: "postgres://other:fixture@elsewhere/database",
};

test("managed test URL is wired automatically without inheriting live credentials", () => {
  const child = buildTestDatabaseEnvironment(source);
  const url = new URL(child.TEST_DATABASE_URL!);
  assert.equal(url.pathname, "/roster_test");
  assert.equal(decodeURIComponent(url.password), source.PGPASSWORD);
  assert.equal(child.NODE_ENV, "test");
  assert.equal(child.SUPABASE_URL, source.DEV_SUPABASE_URL);
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, source.DEV_SUPABASE_SERVICE_ROLE_KEY);
  for (const key of [
    "DATABASE_URL", "DEV_DATABASE_URL", "PGDATABASE", "PGPASSWORD",
    "STRIPE_SECRET_KEY", "ONESIGNAL_REST_API_KEY", "RESEND_API_KEY",
    "REVENUECAT_API_KEY", "NODE_OPTIONS", "TRIVIA_PUSH_TEST_DATABASE_URL",
  ]) assert.equal(child[key], undefined, `${key} must not reach test subprocesses`);
  assert.equal(source.PGDATABASE, "existing_database");
});

test("launcher refuses a managed test target matching either app or development", () => {
  const child = buildTestDatabaseEnvironment(source);
  for (const key of ["DATABASE_URL", "DEV_DATABASE_URL"]) {
    assert.throws(
      () => buildTestDatabaseEnvironment({ ...source, [key]: child.TEST_DATABASE_URL }),
      /same database/,
    );
  }
});

test("launcher rejects missing configuration, unsupported hosts and explicit conflicting targets", () => {
  assert.throws(() => buildTestDatabaseEnvironment({ ...source, PGPASSWORD: undefined }));
  assert.throws(() => buildTestDatabaseEnvironment({ ...source, PGHOST: "db.example.supabase.co" }));
  assert.throws(() => buildTestDatabaseEnvironment({ ...source, PGPORT: "invalid" }));
  assert.throws(() => buildTestDatabaseEnvironment({ ...source, TEST_DATABASE_URL: source.DATABASE_URL }));
});
