import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "@supabase/supabase-js";
import { createAuthSessionController, retryTransientSignIn } from "./authSessionController";

const session = { access_token: "test-token", user: { id: "test-user" } } as Session;
const result = (value: Session | null, error: unknown = null) => ({ data: { session: value }, error });
const transient = { name: "AuthRetryableFetchError", message: "Failed to fetch" };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(overrides: Record<string, any> = {}) {
  const calls = { get: 0, validate: 0, refresh: 0, clear: 0 };
  let event: (name: string, value: Session | null) => void = () => {};
  const controller = createAuthSessionController({
    getSession: async () => { calls.get++; return result(session); },
    validateSession: async () => { calls.validate++; return "valid"; },
    refreshSession: async () => { calls.refresh++; return result(session); },
    clearSession: async () => { calls.clear++; },
    listen: callback => { event = callback; },
    ...overrides,
  });
  return { controller, calls, event: (name: string, value: Session | null) => event(name, value) };
}

test("twenty hook subscribers share one initialization and account validation", async () => {
  const f = fixture();
  const removers = Array.from({ length: 20 }, () => f.controller.subscribe(() => {}));
  await flush();
  assert.deepEqual(f.calls, { get: 1, validate: 1, refresh: 0, clear: 0 });
  assert.equal(f.controller.getSnapshot().user?.id, session.user.id);
  removers.forEach(remove => remove());
  f.controller.subscribe(() => {});
  await flush();
  assert.equal(f.calls.validate, 1, "later screen mounts do not revalidate the session");
});

test("backend network failure does not refresh or clear a valid local session", async () => {
  const f = fixture({ validateSession: async () => "unavailable" });
  f.controller.subscribe(() => {});
  await flush();
  assert.equal(f.controller.getSnapshot().user, session.user);
  assert.equal(f.calls.clear, 0);
  assert.equal(f.calls.refresh, 0);
});

test("explicit rejection still refreshes the token", async () => {
  const f = fixture({ validateSession: async () => "rejected" });
  f.controller.subscribe(() => {});
  await flush();
  assert.equal(f.calls.refresh, 1);
  assert.equal(f.controller.getSnapshot().user, session.user);
});

test("temporary refresh failure preserves the session, permanent rejection clears it", async () => {
  for (const error of [transient, { name: "AuthApiError", status: 400, message: "Invalid refresh token" }]) {
    const f = fixture({
      validateSession: async () => "rejected",
      refreshSession: async () => result(null, error),
    });
    f.controller.subscribe(() => {});
    await flush();
    assert.equal(f.calls.clear, error === transient ? 0 : 1);
    assert.equal(f.controller.getSnapshot().user, error === transient ? session.user : null);
  }
});

test("a login event wins over a late empty initial session", async () => {
  let resolve!: (value: ReturnType<typeof result>) => void;
  const f = fixture({ getSession: () => new Promise(done => { resolve = done; }) });
  f.controller.subscribe(() => {});
  f.event("SIGNED_IN", session);
  resolve(result(null));
  await flush();
  assert.equal(f.controller.getSnapshot().user, session.user);
  assert.equal(f.calls.clear, 0);
});

test("a logout event wins over a late backend validation", async () => {
  let resolve!: (value: string) => void;
  const f = fixture({ validateSession: () => new Promise(done => { resolve = done; }) });
  f.controller.subscribe(() => {});
  await flush();
  f.event("SIGNED_OUT", null);
  resolve("valid");
  await flush();
  assert.equal(f.controller.getSnapshot().user, null);
});

test("INITIAL_SESSION cannot bypass the initial backend check", async () => {
  let resolve!: (value: string) => void;
  const f = fixture({ validateSession: () => new Promise(done => { resolve = done; }) });
  f.controller.subscribe(() => {});
  await flush();
  f.event("INITIAL_SESSION", session);
  assert.equal(f.controller.getSnapshot().isLoading, true);
  resolve("valid");
  await flush();
  assert.equal(f.controller.getSnapshot().isLoading, false);
});

test("sign-in retries only transient transport errors, at most once", async () => {
  for (const error of [null, transient, { name: "AuthApiError", status: 400, message: "Invalid login credentials" }]) {
    let calls = 0;
    const returned = await retryTransientSignIn(async () => { calls++; return { error }; }, async () => {});
    assert.equal(returned.error, error);
    assert.equal(calls, error === transient ? 2 : 1);
  }
});

test("sign-in recovers from a single thrown transport failure", async () => {
  let calls = 0;
  const returned = await retryTransientSignIn(async () => {
    if (++calls === 1) throw new TypeError("Failed to fetch");
    return { error: null };
  }, async () => {});
  assert.equal(calls, 2);
  assert.equal(returned.error, null);
});
