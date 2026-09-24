export function reachedTiers<T extends { threshold: number }>(tiers: T[], count: number): T[] {
  return tiers.filter((tier) => count >= tier.threshold);
}

export function newlyReachedTiers<T extends { threshold: number }>(
  tiers: T[],
  previousCount: number,
  count: number,
): T[] {
  return tiers.filter((tier) => previousCount < tier.threshold && count >= tier.threshold);
}