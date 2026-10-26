import assert from "node:assert/strict";
import test from "node:test";
import { getDatabaseConnectionString, isTestProcess } from "../testDatabaseGuard";

const appUrl = "postgresql://app:secret@db.example.com:5432/live";
const testUrl = "postgresql://tester:secret@db.example.com:5432/isolated_test";

test("detects test files and the Node test runner without changing normal app processes", () => {
  assert.equal(isTestProcess({} as NodeJS.ProcessEnv, ["/app/server/tests/example.integration.test.ts"]), true);
  assert.equal(isTestProcess({ NODE_TEST_CONTEXT: "child-v8" }, ["/app/server/index.ts"]), true);
  assert.equal(isTestProcess({ NODE_ENV: "test" }, ["/app/server/index.ts"]), true);
  assert.equal(isTestProcess({ NODE_ENV: "production" }, ["/app/dist/index.js"]), false);
});

test("tests fail closed rather than use the app's database", () => {
  assert.throws(
    () => getDatabaseConnectionString({ DATABASE_URL: appUrl }, ["example.test.ts"]),
    /require TEST_DATABASE_URL/,
  );
  assert.throws(
    () => getDatabaseConnectionString({
      DATABASE_URL: appUrl,
      TEST_DATABASE_URL: "postgresql://other:another-secret@db.example.com/live",
    }, ["example.test.ts"]),
    /same database/,
  );
  assert.equal(
    getDatabaseConnectionString({ DATABASE_URL: appUrl, TEST_DATABASE_URL: testUrl }, ["example.test.ts"]),
    testUrl,
  );
});

test("normal app processes retain their configured database", () => {
  assert.equal(
    getDatabaseConnectionString({ DATABASE_URL: appUrl }, ["/app/server/index.ts"]),
    appUrl,
  );
});

test("tests reject the development database independently of the production reference", () => {
  assert.throws(
    () => getDatabaseConnectionString({
      DATABASE_URL: appUrl,
      DEV_DATABASE_URL: testUrl,
      TEST_DATABASE_URL: "postgres://other:different@DB.EXAMPLE.COM/isolated_test?sslmode=require",
    }, ["example.test.ts"]),
    /same database as DEV_DATABASE_URL/,
  );
  assert.equal(
    getDatabaseConnectionString({
      DATABASE_URL: appUrl,
      DEV_DATABASE_URL: "postgres://dev:password@dev.example.com/dev",
      TEST_DATABASE_URL: testUrl,
    }, ["example.test.ts"]),
    testUrl,
  );
});

test("Supabase direct and pooled aliases identify the same database across ports", () => {
  const variants = [
    "postgres://postgres:one@db.project-a.supabase.co/postgres",
    "postgres://postgres.project-a:two@aws-0-region.pooler.supabase.com:6543/postgres",
    "postgres://reader.project-a:three@aws-1-region.pooler.supabase.com:5432/postgres",
  ];
  for (const source of variants) {
    for (const target of variants) {
      assert.throws(
        () => getDatabaseConnectionString({
          DATABASE_URL: source,
          TEST_DATABASE_URL: target,
        }, ["example.test.ts"]),
        /same database/,
      );
    }
  }
  assert.equal(
    getDatabaseConnectionString({
      DATABASE_URL: variants[0],
      DEV_DATABASE_URL: variants[1],
      TEST_DATABASE_URL: "postgres://postgres.project-b:other@aws-0-region.pooler.supabase.com:6543/postgres",
    }, ["example.test.ts"]),
    "postgres://postgres.project-b:other@aws-0-region.pooler.supabase.com:6543/postgres",
  );
});

test("unknown or malformed database identities fail closed without leaking credentials", () => {
  const invalid = [
    "postgres://postgres:sensitive@aws-0-region.pooler.supabase.com/postgres",
    "postgres://user:sensitive@host.example.com/",
    "postgres://user:sensitive@host.example.com/%XX",
    "postgres://user:sensitive@host.example.com:invalid/test",
  ];
  for (const connectionString of invalid) {
    assert.throws(
      () => getDatabaseConnectionString({
        DATABASE_URL: appUrl,
        TEST_DATABASE_URL: connectionString,
      }, ["example.test.ts"]),
      (error: unknown) => error instanceof Error && !error.message.includes("sensitive"),
    );
  }
});