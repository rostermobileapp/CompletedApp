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