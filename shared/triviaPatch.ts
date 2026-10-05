import { TRIVIA_CATEGORY_LABELS, validateTriviaTiers, triviaPatchImagePath, type TriviaCategory } from "./trivia";

export type TriviaPatchTierRow = {
  tier: number;
  correct_answers_required: number;
  image_path: string | null;
  awarded_at: string | Date | null;
};

/** The same patch shape is used by the daily modal and the Trophy Case. */
export function buildTriviaPatchView(input: {
  category: TriviaCategory;
  patchId: string;
  name: string;
  description: string;
  correctCount: number;
  tiers: TriviaPatchTierRow[];
}) {
  const configuration = validateTriviaTiers(input.tiers.map((row) => ({
    tier: Number(row.tier),
    correctAnswersRequired: Number(row.correct_answers_required),
  })));
  const rows = new Map(input.tiers.map((row) => [Number(row.tier), row]));
  const tierStates = configuration.map(({ tier, correctAnswersRequired }) => {
    const row = rows.get(tier)!;
    const unlockedAt = row.awarded_at ? new Date(row.awarded_at).toISOString() : null;
    return {
      tier,
      threshold: correctAnswersRequired,
      unlocked_at: unlockedAt,
      imagePath: row.image_path ?? triviaPatchImagePath(input.category, tier),
      earned: input.correctCount >= correctAnswersRequired || unlockedAt !== null,
    };
  });
  const currentTier = tierStates.filter((tier) => tier.earned).at(-1)?.tier ?? 0;
  const next = tierStates.find((tier) => !tier.earned);
  return {
    category: TRIVIA_CATEGORY_LABELS[input.category],
    patch_id: input.patchId,
    name: input.name,
    description: input.description,
    imagePath: tierStates[Math.max(0, currentTier - 1)].imagePath,
    correct_count: input.correctCount,
    current_tier: currentTier,
    next_threshold: next?.threshold ?? null,
    complete: !next,
    tiers: tierStates.map(({ earned: _earned, ...tier }) => tier),
  };
}