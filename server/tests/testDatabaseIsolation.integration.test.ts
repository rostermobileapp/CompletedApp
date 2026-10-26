import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { createDatabasePool } from "../databasePool";
import { getDatabaseConnectionString } from "../testDatabaseGuard";
import { TEST_DATABASE_NAME } from "../testDatabaseEnvironment";

neonConfig.webSocketConstructor = ws;

test("managed test database is reachable and synthetic transaction data stays isolated", async () => {
  assert.equal(process.env.NODE_ENV, "test", "Use npm run test:db for this test");
  assert.equal(process.env.DATABASE_URL, undefined, "Production credentials must not be inherited");
  const pool = createDatabasePool(getDatabaseConnectionString(process.env, process.argv));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const metadata = await client.query(`
      SELECT current_database() AS name,
        current_setting('server_version_num')::int AS version,
        to_regnamespace('auth') IS NOT NULL AS has_auth,
        to_regnamespace('storage') IS NOT NULL AS has_storage,
        gen_random_uuid() IS NOT NULL AS uuid_supported
    `);
    assert.equal(metadata.rows[0].name, TEST_DATABASE_NAME);
    assert.ok(metadata.rows[0].version >= 130000);
    assert.equal(metadata.rows[0].has_auth, false);
    assert.equal(metadata.rows[0].has_storage, false);
    assert.equal(metadata.rows[0].uuid_supported, true);
    await client.query("CREATE TEMP TABLE isolated_release_check (id int PRIMARY KEY, label text)");
    const result = await client.query(
      "INSERT INTO isolated_release_check VALUES ($1, $2) RETURNING id, label",
      [1, "synthetic fixture"],
    );
    assert.deepEqual(result.rows, [{ id: 1, label: "synthetic fixture" }]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
