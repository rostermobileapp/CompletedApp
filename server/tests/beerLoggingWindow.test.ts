import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isBeerLoggingWindowOpen } from "../../shared/beerLoggingWindow.js";
import { incrementBeerCountIfWindowOpen } from "../beerLogging.js";

describe("beer logging window", () => {
  const scheduledAt = "2026-10-01T19:00:00";
  const timezone = "America/New_York";
  // October 1 is in daylight time: 7 PM in New York is 11 PM UTC.
  const scheduledStartMs = Date.parse("2026-10-01T23:00:00.000Z");
  const opensAtMs = scheduledStartMs - 60 * 60 * 1000;
  const closesAtMs = scheduledStartMs + 4 * 60 * 60 * 1000;

  test("opens one hour before the scheduled start and closes four hours after, inclusively", () => {
    assert.equal(isBeerLoggingWindowOpen(scheduledAt, timezone, opensAtMs - 1), false);
    assert.equal(isBeerLoggingWindowOpen(scheduledAt, timezone, opensAtMs), true);
    assert.equal(isBeerLoggingWindowOpen(scheduledAt, timezone, scheduledStartMs), true);
    assert.equal(isBeerLoggingWindowOpen(scheduledAt, timezone, closesAtMs), true);
    assert.equal(isBeerLoggingWindowOpen(scheduledAt, timezone, closesAtMs + 1), false);
  });

  test("does not increment beer counts outside the window", async () => {
    let incrementCalls = 0;
    const increment = async () => ++incrementCalls;
    const game = { scheduledAt, timezone, isScrimmage: false };

    const tooEarly = await incrementBeerCountIfWindowOpen(game, increment, opensAtMs - 1);
    assert.deepEqual(tooEarly, { allowed: false });
    assert.equal(incrementCalls, 0);

    const tooLate = await incrementBeerCountIfWindowOpen(game, increment, closesAtMs + 1);
    assert.deepEqual(tooLate, { allowed: false });
    assert.equal(incrementCalls, 0);

    const atOpening = await incrementBeerCountIfWindowOpen(game, increment, opensAtMs);
    assert.deepEqual(atOpening, { allowed: true, result: 1 });
    assert.equal(incrementCalls, 1);
  });

  test("does not increment beer counts for scrimmages", async () => {
    let incrementCalls = 0;
    const result = await incrementBeerCountIfWindowOpen(
      { scheduledAt, timezone, isScrimmage: true },
      async () => ++incrementCalls,
      scheduledStartMs,
    );

    assert.deepEqual(result, { allowed: false });
    assert.equal(incrementCalls, 0);
  });

  test("fails closed for invalid schedules and timezones", () => {
    assert.equal(isBeerLoggingWindowOpen("not-a-date", timezone, scheduledStartMs), false);
    assert.equal(isBeerLoggingWindowOpen(scheduledAt, "Not/A-Timezone", scheduledStartMs), false);
  });
});