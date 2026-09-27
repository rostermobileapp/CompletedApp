import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPaidTrophyCaseAccess } from "./trophyCaseAccess";

test("Trophy Case access is limited to Player Pro and commissioner users", () => {
  assert.equal(hasPaidTrophyCaseAccess(null), false);
  assert.equal(hasPaidTrophyCaseAccess({ role: "free_tier" }), false);
  assert.equal(hasPaidTrophyCaseAccess({ role: "player_pro" }), true);
  assert.equal(hasPaidTrophyCaseAccess({ role: "commissioner" }), true);
  assert.equal(hasPaidTrophyCaseAccess({ role: "secondary_commissioner" }), true);
  assert.equal(hasPaidTrophyCaseAccess({ role: "free_tier", isPrimaryCommissioner: true }), true);
});