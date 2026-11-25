import test from "node:test";
import assert from "node:assert/strict";
import { createParentVerificationSessionStore, parentDeviceMetadataKey } from "../../client/src/lib/parentVerificationSession";
import { PARENT_DEVICE_SECONDS } from "../../shared/highSchoolParentCodePolicy";
import { HighSchoolParentSecurity, parentDigest } from "../highSchoolParentSecurity";

const jwt = (subject = "parent", session = "original") =>
  `x.${Buffer.from(JSON.stringify({ sub: subject, session_id: session })).toString("base64url")}.x`;
const metadataId = "a".repeat(64);
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, values };
}
test("remembered devices survive reload without persisting a readable authorization token", () => {
  const storage = memoryStorage(), forgotten: unknown[] = [];
  let clock = 10_000;
  const options = { storage, forgetDevice: async (id?: string) => { forgotten.push(id); } };
  const first = createParentVerificationSessionStore(() => clock, options);
  first.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS);
  assert.equal(first.snapshot(), 1);
  assert.deepEqual(first.headers(jwt()), { "x-parent-device-id": metadataId }); // A hint, never the cookie proof.
  const persisted = JSON.parse(storage.getItem(parentDeviceMetadataKey)!);
  assert.deepEqual(Object.keys(persisted).sort(), ["deviceId", "expires", "session", "subject"]);
  clock += 11 * 60 * 1000; // The former ten-minute deadline no longer applies.
  const reloaded = createParentVerificationSessionStore(() => clock, options);
  assert.deepEqual(reloaded.headers(jwt()), { "x-parent-device-id": metadataId });
  assert.ok(storage.getItem(parentDeviceMetadataKey));
  assert.deepEqual(forgotten, []);
  reloaded.clear();
  assert.equal(storage.getItem(parentDeviceMetadataKey), null);
  assert.deepEqual(forgotten, [metadataId]);
  first.clear({ forgetDevice: false });
});
test("missing bootstrap auth does not erase remembered approval", () => {
  const storage = memoryStorage();
  const store = createParentVerificationSessionStore(() => 1000, { storage, forgetDevice: async () => {} });
  store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS);
  assert.deepEqual(store.headers(), {});
  assert.ok(storage.getItem(parentDeviceMetadataKey));
  store.clear();
});
for (const next of [jwt("other-parent"), jwt("parent", "new-session")]) {
  test(`account/session switches erase local approval rather than transferring it: ${next}`, () => {
    const storage = memoryStorage(), forgotten: unknown[] = [];
    const store = createParentVerificationSessionStore(() => 1000, { storage, forgetDevice: async id => { forgotten.push(id); } });
    store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS);
    assert.deepEqual(store.headers(next), {});
    assert.equal(storage.getItem(parentDeviceMetadataKey), null);
    assert.deepEqual(forgotten, [metadataId]);
  });
}
test("thirty-day expiry clears metadata and revokes only its remembered device", () => {
  const storage = memoryStorage();
  let clock = 1000, forgotten = "";
  const store = createParentVerificationSessionStore(() => clock, { storage, forgetDevice: async id => { forgotten = id!; } });
  store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS);
  clock += PARENT_DEVICE_SECONDS * 1000;
  store.headers(jwt());
  assert.equal(storage.getItem(parentDeviceMetadataKey), null);
  assert.equal(forgotten, metadataId);
});
test("forged metadata and stored token fields cannot become a verification header", () => {
  const storage = memoryStorage();
  storage.setItem(parentDeviceMetadataKey, JSON.stringify({ subject: "parent", session: "original", expires: 100_000,
    deviceId: metadataId, token: "s".repeat(43) }));
  const store = createParentVerificationSessionStore(() => 1000, { storage, forgetDevice: async () => {} });
  assert.deepEqual(store.headers(jwt()), { "x-parent-device-id": metadataId });
  store.clear();
  assert.throws(() => store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS + 1));
  assert.throws(() => store.save(jwt(), "s".repeat(43), PARENT_DEVICE_SECONDS));
});
test("legacy ten-minute proofs still remain memory-only and expire normally", () => {
  const storage = memoryStorage();
  let clock = 1000;
  const store = createParentVerificationSessionStore(() => clock, { storage, forgetDevice: async () => {} });
  store.save(jwt(), "s".repeat(43), 600);
  assert.deepEqual(store.headers(jwt()), { "x-parent-verification": "s".repeat(43) });
  assert.equal(storage.getItem(parentDeviceMetadataKey), null);
  clock += 600_001;
  assert.deepEqual(store.headers(jwt()), {});
});
test("device revocation cannot consume a newer cookie or a password-change grant", async () => {
  const calls: Array<{ sql: string; values?: any[] }> = [];
  const query = async (sql: string, values?: any[]) => {
    calls.push({ sql, values });
    return { rows: sql.includes("RETURNING auth_id,session_id") ? [{ auth_id: "parent", session_id: "session" }]
      : sql.startsWith("SELECT auth_id FROM hs_parent_security.grants") ? [{ auth_id: "parent" }] : [] };
  };
  const security = new HighSchoolParentSecurity({ query, connect: async () => ({ query, release() {} }) });
  const old = "a".repeat(43), newer = "b".repeat(43);
  await security.forgetDevice(newer, parentDigest(old));
  assert.equal(calls.length, 0);
  await security.forgetDevice(old, parentDigest(old));
  assert.ok(calls.filter(call => call.sql.includes("UPDATE hs_parent_security.grants")).length === 2);
  assert.ok(calls.filter(call => call.sql.includes("UPDATE hs_parent_security.grants")).every(call => call.sql.includes("purpose='parent_action'")));
  assert.deepEqual(calls[0].values, [parentDigest(old)]);
});
test("remembered devices renew short socket proofs without another email code", async () => {
  const originalFetch = globalThis.fetch, storage = memoryStorage();
  let clock = 1000, calls = 0;
  const store = createParentVerificationSessionStore(() => clock, { storage, forgetDevice: async () => {} });
  try {
    globalThis.fetch = async (_input, init) => {
      calls++;
      assert.equal(new Headers(init?.headers).get("x-parent-device-id"), metadataId);
      assert.equal(init?.credentials, "same-origin");
      return new Response(JSON.stringify({ verificationToken: String(calls).repeat(43), expiresInSeconds: 600 }), { status: 200 });
    };
    store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS);
    assert.equal(await store.socketGrant(jwt()), "1".repeat(43));
    assert.equal(await store.socketGrant(jwt()), "1".repeat(43)); assert.equal(calls, 1);
    clock += 601_000;
    assert.equal(await store.socketGrant(jwt()), "2".repeat(43)); assert.equal(calls, 2);
    assert.equal(JSON.stringify([...storage.values.values()]).includes("2".repeat(43)), false);
  } finally { store.clear(); globalThis.fetch = originalFetch; }
});
test("a late socket proof cannot restore parent access after child mode or sign-out", async () => {
  const originalFetch = globalThis.fetch, storage = memoryStorage();
  const store = createParentVerificationSessionStore(() => 1000, { storage, forgetDevice: async () => {} });
  let respond!: (value: Response) => void;
  try {
    globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
    store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS);
    const pending = store.socketGrant(jwt());
    store.clear();
    respond(new Response(JSON.stringify({ verificationToken: "s".repeat(43), expiresInSeconds: 600 })));
    await assert.rejects(pending, /Parent device changed/);
    assert.deepEqual(store.headers(jwt()), {});
    assert.equal(storage.getItem(parentDeviceMetadataKey), null);
  } finally { store.clear(); globalThis.fetch = originalFetch; }
});
test("temporary socket transport failures do not discard remembered parent verification", async () => {
  const originalFetch = globalThis.fetch, storage = memoryStorage();
  const store = createParentVerificationSessionStore(() => 1000, { storage, forgetDevice: async () => {} });
  try {
    store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS);
    globalThis.fetch = async () => { throw new TypeError("Temporary network failure"); };
    await assert.rejects(store.socketGrant(jwt()));
    assert.ok(storage.getItem(parentDeviceMetadataKey));
    globalThis.fetch = async () => new Response("{}", { status: 403 });
    await assert.rejects(store.socketGrant(jwt()));
    assert.equal(storage.getItem(parentDeviceMetadataKey), null);
  } finally { store.clear(); globalThis.fetch = originalFetch; }
});
test("blocked browser storage explicitly reports session-only access", () => {
  const storage = { getItem() { return null; }, setItem() { throw new Error("Blocked"); }, removeItem() {} };
  const store = createParentVerificationSessionStore(() => 1000, { storage, forgetDevice: async () => {} });
  assert.equal(store.remember(jwt(), metadataId, PARENT_DEVICE_SECONDS), false);
  assert.deepEqual(store.headers(jwt()), { "x-parent-device-id": metadataId });
  store.clear();
});
