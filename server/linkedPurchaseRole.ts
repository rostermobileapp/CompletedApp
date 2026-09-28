type BillingRole = 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier';

/** Highest active, verified entitlement wins; a store-only UI hint never counts. */
export function resolveLinkedPurchaseRole(
  requested: BillingRole,
  entitlements: { appleActive?: boolean; googleCommissioner?: boolean; googlePro?: boolean },
): BillingRole {
  if (entitlements.googleCommissioner && (requested === 'free_tier' || requested === 'player_pro')) {
    return 'commissioner';
  }
  if ((entitlements.appleActive || entitlements.googlePro) && requested === 'free_tier') {
    return 'player_pro';
  }
  return requested;
}