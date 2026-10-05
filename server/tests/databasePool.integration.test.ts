import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import WebSocket, { WebSocketServer } from "ws";
import { createDatabasePool } from "../databasePool";

const testUrl = process.env.DATABASE_POOL_TEST_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "55433" ||
      url.pathname !== "/roster_connection_resilience_test") {
    throw new Error("Connection resilience tests require the isolated local fixture database.");
  }
}

test("real connection loss is recoverable without silently replaying failed queries", { skip: !testUrl }, async t => {
  const bridge = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(bridge, "listening");
  const address = bridge.address();
  assert.ok(address && typeof address !== "string");
  let connectionCount = 0;
  bridge.on("connection", peer => {
    connectionCount++;
    const tcp = createConnection({ host: "127.0.0.1", port: 55433 });
    peer.on("message", data => {
      tcp.write(Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    tcp.on("data", data => {
      if (peer.readyState === WebSocket.OPEN) peer.send(data);
    });
    tcp.on("error", () => peer.terminate());
    tcp.on("close", () => peer.close());
    peer.on("close", () => tcp.destroy());
    peer.on("error", () => tcp.destroy());
  });

  const previous = {
    webSocketConstructor: neonConfig.webSocketConstructor,
    wsProxy: neonConfig.wsProxy,
    useSecureWebSocket: neonConfig.useSecureWebSocket,
    pipelineConnect: neonConfig.pipelineConnect,
  };
  neonConfig.webSocketConstructor = WebSocket;
  neonConfig.wsProxy = () => `127.0.0.1:${address.port}`;
  // Plain WS is confined to this loopback-only fixture; production TLS is unchanged.
  neonConfig.useSecureWebSocket = false;
  // This fixture uses trust auth, not the proxy's cleartext-password handshake.
  neonConfig.pipelineConnect = false;
  const logs: { code: string }[] = [];
  const pool = createDatabasePool(testUrl!, (_message, details) => logs.push(details));
  try {
    assert.equal((await pool.query("SELECT 1 AS ok")).rows[0].ok, 1);

    await t.test("losing an idle connection emits a handled error and a fresh connection succeeds", async () => {
      const lost = once(pool, "error");
      for (const peer of bridge.clients) peer.terminate();
      await lost;
      assert.equal(pool.totalCount, 0);
      assert.equal(logs.length, 1);
      assert.equal((await pool.query("SELECT 1 AS ok")).rows[0].ok, 1);
      assert.equal(connectionCount, 2);
    });

    await t.test("an active query fails explicitly rather than being replayed", async () => {
      const countBefore = connectionCount;
      const rejected = assert.rejects(pool.query("SELECT pg_sleep(1)"), /terminated|closed|connection/i);
      await new Promise(resolve => setTimeout(resolve, 25));
      for (const peer of bridge.clients) peer.terminate();
      await rejected;
      assert.equal(connectionCount, countBefore);
      assert.equal((await pool.query("SELECT 1 AS ok")).rows[0].ok, 1);
      assert.equal(connectionCount, countBefore + 1);
    });
  } finally {
    await pool.end();
    for (const peer of bridge.clients) peer.terminate();
    await new Promise<void>((resolve, reject) => bridge.close(error => error ? reject(error) : resolve()));
    Object.assign(neonConfig, previous);
  }
});
