import test from "node:test";
import assert from "node:assert/strict";
import { buildTriviaPatchView } from "./triviaPatch";
import { DEFAULT_TRIVIA_THRESHOLDS } from "./trivia";

const base = {
  category: "movies_media" as const, patchId: "patch", name: "Movies & Media Trivia",
  description: "Lifetime progress", correctCount: 0,
  tiers: DEFAULT_TRIVIA_THRESHOLDS.map((threshold, index) => ({
    tier: index + 1, correct_answers_required: threshold,
    image_path: `/custom/tier-${index + 1}.png`, awarded_at: null as string | null,
  })),
};

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
  assert.equal(patch.imagePath, "/badges/trivia/movies_media/tier-2.svg");
  assert.throws(() => buildTriviaPatchView({ ...base, tiers: base.tiers.slice(1) }));
});