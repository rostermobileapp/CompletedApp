import type { VerifiedAppleSubscription } from './revenueCatApi';

/** The v1 subscriber API has no original transaction ID. Its subscription's
 * first purchase time is anchored to the original ID independently attested
 * from v2 history; a replacement purchase has a different first purchase. */
export function matchingApplePurchase(
  subscriptions: VerifiedAppleSubscription[],
  originalPurchasedAt: Date,
): VerifiedAppleSubscription | undefined {
  return subscriptions.find(sub =>
    sub.role === 'player_pro' &&
    ['com.rosterapp.player_pro_monthly', 'com.rosterapp.player_pro_yearly'].includes(sub.productId) &&
    Math.abs(Date.parse(sub.originalPurchasedAt) - originalPurchasedAt.getTime()) <= 1000
  );
}

export function isOlderPeriodRevocation(
  revokedPeriodExpiryMs: number | undefined,
  verifiedCurrentExpiry: Date | null,
): boolean {
  return Number.isFinite(revokedPeriodExpiryMs) && Boolean(verifiedCurrentExpiry) &&
    verifiedCurrentExpiry!.getTime() > revokedPeriodExpiryMs!;
}

export function isLaterVerifiedPeriod(
  active: VerifiedAppleSubscription | undefined,
  revokedPeriodExpiry: Date | null,
): boolean {
  return Boolean(active && revokedPeriodExpiry &&
    Date.parse(active.expiresAt) > revokedPeriodExpiry.getTime());
}