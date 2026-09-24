import { test } from "node:test";
import assert from "node:assert/strict";
import { newlyReachedTiers, reachedTiers } from "../badgeTierEligibility";

const beerTiers = [
  { tier: "bronze", threshold: 1 },
  { tier: "silver", threshold: 10 },
  { tier: "gold", threshold: 25 },
  { tier: "platinum", threshold: 50 },
  { tier: "legend", threshold: 100 },
  { tier: "god_mode", threshold: 250 },
];

test("Beer Me at seven beers earns only bronze", () => {
  assert.deepEqual(reachedTiers(beerTiers, 7).map((tier) => tier.tier), ["bronze"]);
  assert.deepEqual(reachedTiers(beerTiers, 0), []);
  assert.deepEqual(reachedTiers(beerTiers, 10).map((tier) => tier.tier), ["bronze", "silver"]);
});

test("only a new threshold crossing announces, including after a corrected count falls", () => {
  assert.deepEqual(newlyReachedTiers(beerTiers, 7, 7), []);
  assert.deepEqual(newlyReachedTiers(beerTiers, 7, 10).map((tier) => tier.tier), ["silver"]);
  assert.deepEqual(newlyReachedTiers(beerTiers, 256, 7), []);
  assert.deepEqual(newlyReachedTiers(beerTiers, 7, 25).map((tier) => tier.tier), ["silver", "gold"]);
});