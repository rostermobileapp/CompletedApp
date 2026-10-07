import assert from "node:assert/strict";
import { test } from "node:test";
import { countSeasonPatches, seasonPatchWindow, type PatchStatsAward } from "./seasonPatchCounts";

const period = {
  start: new Date("2026-09-01T04:00:00Z"),
  endExclusive: new Date("2026-10-01T04:00:00Z"),
};
const award = (changes: Partial<PatchStatsAward> = {}): PatchStatsAward => ({
  userId: "player", badgeDefinitionId: "achievement", tier: "bronze",
  scopeKey: "global:tier:bronze", count: 100, achievementType: "tiered",
  awardedAt: new Date("2026-09-15T12:00:00Z"), ...changes,
});

test("season counts include every awarded category and tier, not metric counts", () => {
  const result = countSeasonPatches([
    award(),
    award({ tier: "silver", scopeKey: "global:tier:silver" }),
    award({ badgeDefinitionId: "trivia", scopeKey: "trivia:lifetime:tier:bronze", count: 25 }),
    award({ badgeDefinitionId: "custom", tier: null, achievementType: null, count: 1 }),
    award({ userId: "goalie", badgeDefinitionId: "shutouts" }),
  ], period);
  assert.equal(result.get("player"), 4);
  assert.equal(result.get("goalie"), 1);
});

test("earning dates, not award season scope, determine the period", () => {
  const result = countSeasonPatches([
    award({ awardedAt: new Date("2026-09-01T03:59:59.999Z") }),
    award({ awardedAt: period.start }),
    award({ awardedAt: new Date("2026-10-01T03:59:59.999Z") }),
    award({ awardedAt: period.endExclusive }),
    award({ awardedAt: new Date("2026-10-02T12:00:00Z"), scopeKey: "season:selected:tier:bronze" }),
  ], period);
  assert.equal(result.get("player"), 2);
});

test("cumulative repeats use their pre-season baseline, not summed snapshots", () => {
  const result = countSeasonPatches([
    award({ achievementType: "multiplier", tier: null, scopeKey: "global:count:3", count: 3 }),
    award({ achievementType: "multiplier", tier: null, scopeKey: "global:count:1", count: 1, awardedAt: new Date("2026-08-01T12:00:00Z") }),
    award({ achievementType: "multiplier", tier: null, scopeKey: "global:count:2", count: 2 }),
    award({ achievementType: "multiplier", tier: null, scopeKey: "global:count:8", count: 8, awardedAt: period.endExclusive }),
  ], period);
  assert.equal(result.get("player"), 2);
});

test("scoped repeat patches count once each regardless of recorded count", () => {
  const result = countSeasonPatches([
    award({ achievementType: "multiplier", tier: null, scopeKey: "season:a", count: 1 }),
    award({ achievementType: "multiplier", tier: null, scopeKey: "season:b", count: 8 }),
  ], period);
  assert.equal(result.get("player"), 2);
});

test("All Seasons counts all earned patches without double-counting cumulative snapshots", () => {
  const result = countSeasonPatches([
    award(),
    award({ achievementType: "multiplier", tier: null, scopeKey: "global:count:1", count: 1 }),
    award({ achievementType: "multiplier", tier: null, scopeKey: "global:count:3", count: 3 }),
    award({ achievementType: "multiplier", tier: null, scopeKey: "season:repeat", count: 1 }),
  ]);
  assert.equal(result.get("player"), 5);
  assert.equal(countSeasonPatches([]).size, 0);
});

test("calendar season boundaries use league-local days, including DST and the full last day", () => {
  const window = seasonPatchWindow({
    startDate: new Date("2026-03-01T00:00:00Z"), endDate: new Date("2026-03-31T00:00:00Z"),
    firstGame: null, lastGame: null, isActive: false, timezone: "America/New_York",
  })!;
  assert.equal(window.start.toISOString(), "2026-03-01T05:00:00.000Z");
  assert.equal(window.endExclusive.toISOString(), "2026-04-01T04:00:00.000Z");
});

test("an undated historical season derives its period from league-local game dates", () => {
  const window = seasonPatchWindow({
    startDate: null, endDate: null, firstGame: new Date("2026-09-02T01:00:00Z"),
    lastGame: new Date("2026-09-30T23:00:00Z"), isActive: false, timezone: "America/New_York",
  })!;
  assert.deepEqual(window, period);
});

test("an ongoing season without an end date counts through the current local day", () => {
  const window = seasonPatchWindow({
    startDate: new Date("2026-09-01T00:00:00Z"), endDate: null,
    firstGame: null, lastGame: null, isActive: true, timezone: "America/New_York",
  }, new Date("2026-10-07T15:00:00Z"))!;
  assert.equal(window.endExclusive.toISOString(), "2026-10-08T04:00:00.000Z");
});

test("undated, unscheduled or reversed seasons never fall back to lifetime totals", () => {
  assert.equal(seasonPatchWindow({
    startDate: null, endDate: null, firstGame: null, lastGame: null,
    isActive: true, timezone: "America/New_York",
  }), null);
  assert.equal(seasonPatchWindow({
    startDate: new Date("2026-10-01"), endDate: new Date("2026-09-01"),
    firstGame: null, lastGame: null, isActive: false, timezone: "America/New_York",
  }), null);
});
