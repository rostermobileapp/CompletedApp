import assert from "node:assert/strict";
import { test } from "node:test";
import { badgeAnnouncementPresentation } from "./badgeAnnouncementPresentation";
import { hasPaidTrophyCaseAccess } from "./trophyCaseAccess";

const definition = {
  id: "beer-patch",
  name: "Beer Me",
  description: "Celebrate a beer milestone.",
  imagePath: "/patch-base.png",
};
const payload = {
  tier: "bronze",
  count: 5,
  awardId: "saved-award",
  year: 2026,
  imagePath: "/patch-bronze.png",
};

test("free users keep the celebration details but receive no patch artwork", () => {
  const result = badgeAnnouncementPresentation(
    definition, payload, hasPaidTrophyCaseAccess({ role: "free_tier" }),
  );
  assert.equal(result.artworkLocked, true);
  assert.equal(result.definition.imagePath, null);
  assert.equal(result.payload.imagePath, null);
  assert.equal(result.definition.name, "Beer Me");
  assert.equal(result.payload.tier, "bronze");
  assert.equal(result.payload.count, 5);
  assert.equal(result.payload.awardId, "saved-award");
  assert.equal(JSON.stringify(result).includes("/patch-"), false);
});

test("all existing paid Trophy Case entitlements retain earned tier artwork", () => {
  for (const viewer of [
    { role: "player_pro" },
    { role: "commissioner" },
    { role: "secondary_commissioner" },
    { role: "free_tier", isPrimaryCommissioner: true },
  ]) {
    const result = badgeAnnouncementPresentation(definition, payload, hasPaidTrophyCaseAccess(viewer));
    assert.equal(result.artworkLocked, false);
    assert.equal(result.definition.imagePath, "/patch-base.png");
    assert.equal(result.payload.imagePath, "/patch-bronze.png");
  }
});

test("missing entitlement fails closed and does not alter saved artwork or awards", () => {
  const result = badgeAnnouncementPresentation(definition, payload, hasPaidTrophyCaseAccess(null));
  assert.equal(result.artworkLocked, true);
  assert.equal(definition.imagePath, "/patch-base.png");
  assert.equal(payload.imagePath, "/patch-bronze.png");
  assert.equal(payload.awardId, "saved-award");
});

test("untiered stats awards are also hidden without losing their details", () => {
  const result = badgeAnnouncementPresentation(
    { ...definition, id: "stats-patch", name: "Hat Trick" },
    { count: 1 },
    false,
  );
  assert.equal(result.artworkLocked, true);
  assert.equal(result.definition.imagePath, null);
  assert.equal(result.payload.imagePath, null);
  assert.equal(result.definition.name, "Hat Trick");
});
