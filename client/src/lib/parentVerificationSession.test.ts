import assert from "node:assert/strict";
import test from "node:test";
import { createParentVerificationSessionStore } from "./parentVerificationSession";
const jwt = (sub: string, session_id: string) => `header.${Buffer.from(JSON.stringify({ sub, session_id })).toString("base64url")}.signature`;
const grant = "a".repeat(43);
test("parent authority is session/account bound, expires, and is never inherited by a fresh store", () => {
  let now = 1000;
  const store = createParentVerificationSessionStore(() => now);
  const one = jwt("synthetic-parent", "session-one");
  try {
    store.save(one, grant, 600);
    assert.deepEqual(store.headers(one), { "x-parent-verification": grant });
    assert.deepEqual(createParentVerificationSessionStore().headers(one), {});
    assert.deepEqual(store.headers(jwt("synthetic-parent", "session-two")), {});
    store.save(one, grant, 600);
    assert.deepEqual(store.headers(jwt("different-account", "session-one")), {});
    store.save(one, grant, 1);
    now += 1001;
    assert.deepEqual(store.headers(one), {});
  } finally { store.clear(); }
});
test("lock, logout and malformed sessions remove authority and notify subscribers", () => {
  const store = createParentVerificationSessionStore();
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  try {
    store.save(jwt("parent", "session"), grant, 600);
    assert.equal(changes, 1);
    store.clear();
    assert.equal(changes, 2);
    store.save(jwt("parent", "session"), grant, 600);
    assert.deepEqual(store.headers(), {});
    assert.equal(changes, 3);
    assert.deepEqual(store.headers("invalid"), {});
    assert.equal(changes, 4);
    assert.throws(() => store.save("invalid", grant, 600));
    assert.throws(() => store.save(jwt("parent", "session"), "invalid", 600));
    assert.throws(() => store.save(jwt("parent", "session"), grant, 601));
  } finally { unsubscribe(); store.clear(); }
});
