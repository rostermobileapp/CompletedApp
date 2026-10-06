import test from "node:test";
import assert from "node:assert/strict";
import { buildTriviaPatchView, countEarnedTriviaPatches } from "./triviaPatch";
import { DEFAULT_TRIVIA_THRESHOLDS, triviaPatchImagePath } from "./trivia";

const base = {
  category: "movies_media" as const, patchId: "patch", name: "Movies & Media Trivia",
  description: "Lifetime progress", correctCount: 0,
  tiers: DEFAULT_TRIVIA_THRESHOLDS.map((threshold, index) => ({
    tier: index + 1, correct_answers_required: threshold,
    image_path: `/custom/tier-${index + 1}.png`, awarded_at: null as string | null,
  })),
};

test("patch total includes every unlocked Trivia tier across categories, not just category count", () => {
  const tiers = DEFAULT_TRIVIA_THRESHOLDS.map((_, index) => ({ tier: index + 1, unlocked_at: null }));
  assert.equal(countEarnedTriviaPatches(), 0);
  assert.equal(countEarnedTriviaPatches([{ current_tier: 0, tiers }]), 0);
  assert.equal(countEarnedTriviaPatches([
    { current_tier: 3, tiers },
    { current_tier: 2, tiers },
    { current_tier: 0, tiers },
  ]), 5);
  assert.equal(countEarnedTriviaPatches([{ current_tier: 8, tiers }]), 8);
});

test("patch total preserves separately recorded unlocks and supports string tier numbers", () => {
  assert.equal(countEarnedTriviaPatches([{
    current_tier: 1,
    tiers: [
      { tier: "1", unlocked_at: null },
      { tier: "2", unlocked_at: null },
      { tier: "3", unlocked_at: "2026-10-05T12:00:00Z" },
    ],
  }]), 2);
});

test("uploaded category artwork matches every earned tier and the unearned Tier 1 preview", () => {
  for (const category of ["nhl_history", "stanley_cup", "players_legends", "records_stats", "teams_franchises", "hockey_culture", "movies_media", "nicknames_slang"] as const) {
    for (let tier = 0; tier <= 8; tier++) {
      const patch = buildTriviaPatchView({
        ...base, category,
        correctCount: tier === 0 ? 0 : DEFAULT_TRIVIA_THRESHOLDS[tier - 1],
        tiers: base.tiers.map((row) => ({ ...row, image_path: null })),
      });
      assert.equal(patch.current_tier, tier);
      assert.equal(patch.imagePath, triviaPatchImagePath(category, Math.max(1, tier)));
      assert.deepEqual(patch.tiers.map((row) => row.imagePath),
        Array.from({ length: 8 }, (_, index) => triviaPatchImagePath(category, index + 1)));
    }
  }
});

test("daily patch feedback preserves the full trophy patch contract at every count", () => {
  for (const count of [0, 1, 4, 5, 10, 25, 50, 100, 150, 200, 300]) {
    const patch = buildTriviaPatchView({ ...base, correctCount: count });
    const earned = DEFAULT_TRIVIA_THRESHOLDS.filter((threshold) => count >= threshold).length;
    assert.equal(patch.current_tier, earned);
    assert.equal(patch.correct_count, count);
    assert.equal(patch.next_threshold, DEFAULT_TRIVIA_THRESHOLDS[earned] ?? null);
    assert.equal(patch.complete, earned === 8);
    assert.equal(patch.category, "Movies & Media");
    assert.equal(patch.imagePath, `/custom/tier-${Math.max(1, earned)}.png`);
    assert.equal(patch.tiers.length, 8);
    assert.ok(patch.tiers.every((tier) => !("earned" in tier)));
  }
});

test("existing earned tiers and their timestamps survive a threshold increase", () => {
  const tiers = base.tiers.map((tier) => ({
    ...tier, correct_answers_required: tier.correct_answers_required + 100,
    awarded_at: tier.tier === 1 ? "2026-10-02T12:00:00Z" : null,
  }));
  const patch = buildTriviaPatchView({ ...base, correctCount: 1, tiers });
  assert.equal(patch.current_tier, 1);
  assert.equal(patch.next_threshold, 105);
  assert.equal(patch.tiers[0].unlocked_at, "2026-10-02T12:00:00.000Z");
});

test("missing artwork uses the category tier path and invalid configuration fails explicitly", () => {
  const patch = buildTriviaPatchView({
    ...base, correctCount: 5, tiers: base.tiers.map((tier) => ({ ...tier, image_path: null })),
  });
  assert.equal(patch.imagePath, "/badges/trivia/movies_media/tier-2.png?v=20261005");
  assert.throws(() => buildTriviaPatchView({ ...base, tiers: base.tiers.slice(1) }));
});