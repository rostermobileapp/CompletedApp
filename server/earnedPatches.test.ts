import assert from "node:assert/strict";
import { test } from "node:test";
import { collectEarnedPatches, type PatchAward, type PatchDefinition } from "./earnedPatches";

const definitions: PatchDefinition[] = [
  { id: "seasonal", name: "Hat Trick", description: "Goals", category: "achievement", achievementType: "tiered", imagePath: "/base.webp", tiers: [{ tier: "bronze", imagePath: "/bronze.webp" }, { tier: "silver", imagePath: "/silver.webp" }] },
  { id: "repeat", name: "RSVP King", description: "Perfect season", category: "achievement", achievementType: "multiplier", imagePath: "/rsvp.webp", tiers: [] },
  { id: "global", name: "Team Player", description: "Subs", category: "achievement", achievementType: "multiplier", imagePath: null, tiers: [] },
  { id: "archived", name: "Old trophy", description: "Historic", category: "nhl_trophy", achievementType: null, imagePath: null, tiers: [] },
];
const date = new Date("2025-04-01T12:00:00Z");
function award(badgeDefinitionId: string, scopeKey: string, tier: string | null = null, count = 1): PatchAward {
  return { badgeDefinitionId, scopeKey, tier, count, awardedAt: date };
}

test("groups earned awards by definition and tier across seasons, retaining tier artwork", () => {
  const result = collectEarnedPatches(definitions, [
    award("seasonal", "season:a:tier:bronze", "bronze"),
    award("seasonal", "season:b:tier:bronze", "bronze"),
    award("seasonal", "season:b:tier:silver", "silver"),
    award("archived", "league:x:season:a"),
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result.find((patch) => patch.tier === "bronze") && { count: result.find((patch) => patch.tier === "bronze")!.count, imagePath: result.find((patch) => patch.tier === "bronze")!.imagePath }, { count: 2, imagePath: "/bronze.webp" });
  assert.equal(result.find((patch) => patch.tier === "silver")?.count, 1);
  assert.ok(result.some((patch) => patch.name === "Old trophy"));
  const bronze = result.find((patch) => patch.tier === "bronze")!;
  assert.equal(bronze.history.length, 2);
  assert.equal(bronze.history[0].totalReached, null);
});

test("scoped repeats add once each while cumulative snapshots use the highest total", () => {
  const result = collectEarnedPatches(definitions, [
    award("repeat", "season:a", null, 1),
    award("repeat", "season:b", null, 1),
    award("global", "global:count:1", null, 1),
    award("global", "global:count:3", null, 3),
    award("global", "global:count:2", null, 2),
  ]);
  assert.equal(result.find((patch) => patch.name === "RSVP King")?.count, 2);
  assert.equal(result.find((patch) => patch.name === "Team Player")?.count, 3);
  assert.deepEqual(result.find((patch) => patch.name === "Team Player")?.history.map((entry) => entry.totalReached), [1, 3, 2]);
  assert.equal(collectEarnedPatches(definitions, [award("missing", "global")]).length, 0);
});

test("preserves each repeat's date and available league, team, and season context", () => {
  const older = { ...award("archived", "league:a:season:one"), awardedAt: new Date("2024-02-01"), leagueName: "City League", seasonName: "Winter" };
  const newer = { ...award("archived", "league:a:season:two"), awardedAt: new Date("2025-02-01"), leagueName: "City League", teamName: "Blades", seasonName: "Spring" };
  const [patch] = collectEarnedPatches(definitions, [older, newer]);
  assert.equal(patch.count, 2);
  assert.deepEqual(patch.history.map((item) => item.seasonName), ["Spring", "Winter"]);
  assert.equal(patch.history[0].teamName, "Blades");
  assert.equal(patch.history[1].leagueName, "City League");
});