import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowBirthdayGreeting } from "./birthdayVisibility";

const now = Date.parse("2026-09-25T17:00:00Z");
const eligible = { eligible: true, expiresAt: "2026-09-26T04:00:00Z" };

test("birthday greeting opens without waiting for an unrelated badge request", () => {
  assert.equal(shouldShowBirthdayGreeting(eligible, now, undefined), true);
  assert.equal(shouldShowBirthdayGreeting(eligible, now, []), true);
  assert.equal(shouldShowBirthdayGreeting(eligible, now, [{ id: "badge" }]), false);
});

test("birthday greeting stays closed when dismissed or past local midnight", () => {
  assert.equal(shouldShowBirthdayGreeting({ ...eligible, eligible: false }, now, []), false);
  assert.equal(shouldShowBirthdayGreeting(eligible, Date.parse(eligible.expiresAt), []), false);
  assert.equal(shouldShowBirthdayGreeting({ eligible: true }, now, []), false);
});