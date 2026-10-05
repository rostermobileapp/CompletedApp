import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import { createDatabasePool } from "../databasePool";

const fixtureUrl = "postgresql://fixture@127.0.0.1:1/unused_fixture";

test("database pool bounds connection waits and uses a limited, keepalive-enabled pool", async () => {
  const pool = createDatabasePool(fixtureUrl, () => {});
  try {
    const options = (pool as unknown as {
      options: { max: number; connectionTimeoutMillis: number; idleTimeoutMillis: number; keepAlive: boolean };
    }).options;
    assert.equal(options.max, 10);
    assert.equal(options.connectionTimeoutMillis, 10_000);
    assert.equal(options.idleTimeoutMillis, 30_000);
    assert.equal(options.keepAlive, true);
  } finally {
    await pool.end();
  }
});

test("idle connection errors do not crash the process or log private connection context", async () => {
  const logs: { message: string; details: { code: string } }[] = [];
  const pool = createDatabasePool(fixtureUrl, (message, details) => logs.push({ message, details }));
  try {
    const error = Object.assign(new Error("private fixture connection context"), { code: "ECONNRESET" });
    assert.doesNotThrow(() => pool.emit("error", error));
    assert.doesNotThrow(() => pool.emit("error", new Error("another idle disconnect")));
    assert.deepEqual(logs.map(log => log.details), [{ code: "ECONNRESET" }, { code: "unknown" }]);
    assert.ok(logs.every(log => !JSON.stringify(log).includes("private fixture")));
    assert.ok(logs.every(log => !JSON.stringify(log).includes(fixtureUrl)));
  } finally {
    await pool.end();
  }
});

test("connection resilience does not wrap queries in an automatic retry", async () => {
  const pool = createDatabasePool(fixtureUrl, () => {});
  try {
    assert.equal(pool.query, Pool.prototype.query);
  } finally {
    await pool.end();
  }
});
