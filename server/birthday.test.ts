import { test } from "node:test";
import assert from "node:assert/strict";
import { eligibleBirthdayDate } from "./birthday";

test("waits until noon in each person's timezone", () => {
  assert.equal(eligibleBirthdayDate("2000-09-25", "America/New_York", new Date("2026-09-25T15:59:59Z")), null);
  assert.equal(eligibleBirthdayDate("2000-09-25", "America/New_York", new Date("2026-09-25T16:00:00Z")), "2026-09-25");
  assert.equal(eligibleBirthdayDate("2000-09-25", "America/Los_Angeles", new Date("2026-09-25T18:59:59Z")), null);
  assert.equal(eligibleBirthdayDate("2000-09-25", "America/Los_Angeles", new Date("2026-09-25T19:00:00Z")), "2026-09-25");
});

test("expires at midnight in the user's timezone, not UTC", () => {
  assert.equal(eligibleBirthdayDate("2000-09-25", "Pacific/Auckland", new Date("2026-09-25T11:59:59Z")), "2026-09-25");
  assert.equal(eligibleBirthdayDate("2000-09-25", "Pacific/Auckland", new Date("2026-09-25T12:00:00Z")), null);
  assert.equal(eligibleBirthdayDate("2000-09-25", "Pacific/Kiritimati", new Date("2026-09-24T22:00:00Z")), "2026-09-25");
});

test("respects daylight saving transitions and annual eligibility", () => {
  assert.equal(eligibleBirthdayDate("1990-07-04", "America/New_York", new Date("2026-07-04T16:00:00Z")), "2026-07-04");
  assert.equal(eligibleBirthdayDate("1990-01-04", "America/New_York", new Date("2026-01-04T17:00:00Z")), "2026-01-04");
  assert.equal(eligibleBirthdayDate("1990-01-04", "America/New_York", new Date("2027-01-04T17:00:00Z")), "2027-01-04");
});

test("does not celebrate missing, invalid, future, or non-leap birthday dates", () => {
  const now = new Date("2026-02-28T17:00:00Z");
  assert.equal(eligibleBirthdayDate(null, "America/New_York", now), null);
  assert.equal(eligibleBirthdayDate("2001-02-29", "America/New_York", now), null);
  assert.equal(eligibleBirthdayDate("2000-02-29", "America/New_York", now), null);
  assert.equal(eligibleBirthdayDate("2030-02-28", "America/New_York", now), null);
  assert.equal(eligibleBirthdayDate("2000-02-28", "Not/A_Timezone", now), null);
  assert.equal(eligibleBirthdayDate("2000-02-28", "America/New_York", now), "2026-02-28");
  assert.equal(eligibleBirthdayDate("2000-02-29", "America/New_York", new Date("2028-02-29T17:00:00Z")), "2028-02-29");
});