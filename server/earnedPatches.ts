export type PatchDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  achievementType: string | null;
  imagePath: string | null;
  tiers: Array<{ tier: string; imagePath: string | null }>;
};

export type PatchAward = {
  badgeDefinitionId: string;
  tier: string | null;
  scopeKey: string;
  count: number;
  awardedAt: Date;
  leagueName?: string | null;
  seasonName?: string | null;
  teamName?: string | null;
};

export function collectEarnedPatches(definitions: PatchDefinition[], awards: PatchAward[]) {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const collected = new Map<string, {
    id: string; name: string; description: string; category: string;
    tier: string | null; imagePath: string | null; count: number; lastEarnedAt: Date;
    history: Array<{ awardedAt: Date; leagueName: string | null; seasonName: string | null; teamName: string | null; totalReached: number | null }>;
  }>();
  for (const award of awards) {
    const definition = definitionsById.get(award.badgeDefinitionId);
    if (!definition) continue;
    const key = `${definition.id}:${award.tier ?? ""}`;
    const existing = collected.get(key);
    const cumulative = definition.achievementType === "multiplier" && award.scopeKey.startsWith("global:count:");
    const increment = cumulative ? Math.max(1, award.count) : 1;
    const historyItem = {
      awardedAt: award.awardedAt,
      leagueName: award.leagueName ?? null,
      seasonName: award.seasonName ?? null,
      teamName: award.teamName ?? null,
      totalReached: cumulative ? increment : null,
    };
    if (existing) {
      // Global multiplier records are snapshots of the total, not additional earnings.
      existing.count = cumulative ? Math.max(existing.count, increment) : existing.count + increment;
      if (award.awardedAt > existing.lastEarnedAt) existing.lastEarnedAt = award.awardedAt;
      existing.history.push(historyItem);
    } else {
      collected.set(key, {
        id: key, name: definition.name, description: definition.description,
        category: definition.category, tier: award.tier,
        imagePath: (award.tier ? definition.tiers.find((tier) => tier.tier === award.tier)?.imagePath : null) || definition.imagePath,
        count: increment, lastEarnedAt: award.awardedAt,
        history: [historyItem],
      });
    }
  }
  return Array.from(collected.values()).map((patch) => ({
    ...patch, history: patch.history.sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime()),
  })).sort((a, b) => b.lastEarnedAt.getTime() - a.lastEarnedAt.getTime());
}