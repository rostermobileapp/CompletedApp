import { test } from "node:test";
import assert from "node:assert/strict";
import { triviaReleasedDate, triviaReleaseNextDelay } from "./triviaRelease";

test("October launch-day popup is hidden at 11 AM and appears at noon Eastern", () => {
  assert.equal(triviaReleasedDate(new Date("2026-10-07T15:00:00Z")), null);
  assert.equal(triviaReleasedDate(new Date("2026-10-07T15:59:59.999Z")), null);
  assert.equal(triviaReleasedDate(new Date("2026-10-07T16:00:00Z")), "2026-10-07");
});

test("the noon rule repeats each day and does not depend on launch/test eligibility", () => {
  assert.equal(triviaReleasedDate(new Date("2026-10-08T15:59:59Z")), null);
  assert.equal(triviaReleasedDate(new Date("2026-10-08T16:00:00Z")), "2026-10-08");
  assert.equal(triviaReleasedDate(new Date("2026-10-09T04:00:00Z")), null);
});

test("noon follows New York daylight saving rather than a fixed UTC hour", () => {
  for (const [before, noon, date] of [
    ["2026-01-07T16:59:59Z", "2026-01-07T17:00:00Z", "2026-01-07"],
    ["2026-03-08T15:59:59Z", "2026-03-08T16:00:00Z", "2026-03-08"],
    ["2026-11-01T16:59:59Z", "2026-11-01T17:00:00Z", "2026-11-01"],
  ]) {
    assert.equal(triviaReleasedDate(new Date(before)), null);
    assert.equal(triviaReleasedDate(new Date(noon)), date);
  }
});

test("noon and midnight checks do not wait for a later polling interval", () => {
  assert.equal(triviaReleaseNextDelay(new Date("2026-10-07T15:59:50Z")), 10_000);
  assert.equal(triviaReleaseNextDelay(new Date("2026-10-07T15:00:00Z")), 60_000);
  assert.equal(triviaReleaseNextDelay(new Date("2026-10-08T03:59:50Z")), 10_000);
});

test("invalid clocks fail closed", () => {
  assert.equal(triviaReleasedDate(new Date("invalid")), null);
  assert.equal(triviaReleaseNextDelay(new Date("invalid")), 60_000);
});
