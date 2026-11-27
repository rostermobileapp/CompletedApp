import test from "node:test";
import assert from "node:assert/strict";
import { savePendingLeagueDraft, readPendingLeagueDraft, clearPendingLeagueDraft } from "../../client/src/lib/pendingLeagueVerification";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const draft = { values: { name: "Synthetic school league", maxTeams: 16, sport: "hockey" },
  rink: { facilityId: "synthetic-rink", name: "Synthetic Rink", address: "Fixture Town" } };
test("verification draft preserves the form and selected rink for the same actor", () => {
  const store = storage();
  assert.equal(savePendingLeagueDraft("admin", draft, store, 1000), true);
  assert.deepEqual(readPendingLeagueDraft("admin", store, 1001), draft);
  assert.equal(readPendingLeagueDraft("other-account", store, 1001), undefined);
  assert.equal(readPendingLeagueDraft(undefined, store, 1001), undefined);
  assert.deepEqual(readPendingLeagueDraft("admin", store, 1001), draft);
  clearPendingLeagueDraft(store);
  assert.equal(readPendingLeagueDraft("admin", store, 1001), undefined);
});
test("expired or malformed drafts never restore", () => {
  const store = storage();
  savePendingLeagueDraft("admin", draft, store, 1000);
  assert.equal(readPendingLeagueDraft("admin", store, 1_801_001), undefined);
  store.setItem("roster.pending-league-verification", "{invalid");
  assert.equal(readPendingLeagueDraft("admin", store, 1000), undefined);
  store.setItem("roster.pending-league-verification", JSON.stringify({ actorId: "admin", expiresAt: 2000,
    values: draft.values, rink: { name: "Missing facility ID" } }));
  assert.equal(readPendingLeagueDraft("admin", store, 1000), undefined);
});
test("blocked storage fails explicitly and does not start an unsafe navigation", () => {
  const blocked = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); },
    removeItem: () => { throw Error("blocked"); } };
  assert.equal(savePendingLeagueDraft("admin", draft, blocked), false);
  assert.equal(readPendingLeagueDraft("admin", blocked), undefined);
  assert.equal(savePendingLeagueDraft(undefined, draft, storage()), false);
});
