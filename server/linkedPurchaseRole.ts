type BillingRole = 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier';

/** Highest active, verified entitlement wins; a store-only UI hint never counts. */
export function resolveLinkedPurchaseRole<T extends BillingRole>(
  requested: T,
  entitlements: {
    appleActive?: boolean;
    appleCommissioner?: boolean;
    googleCommissioner?: boolean;
    googlePro?: boolean;
  },
): T | 'commissioner' | 'player_pro' {
  if (entitlements.googleCommissioner && (requested === 'free_tier' || requested === 'player_pro')) {
    return 'commissioner';
  }
  if (entitlements.appleCommissioner && (requested === 'free_tier' || requested === 'player_pro')) {
    return 'commissioner';
  }
  if ((entitlements.appleActive || entitlements.googlePro) && requested === 'free_tier') {
    return 'player_pro';
  }
  return requested;
}

/** Resolves store claims without allowing a lower-tier store to downgrade an
 * independent commissioner source. `requested` is the role from Stripe or
 * the current non-store account role. */
export function resolveStoreLinkedRole(
  requested: BillingRole,
  entitlements: { appleRole?: 'commissioner' | 'player_pro' | null; googleRole?: 'commissioner' | 'player_pro' | null },
): BillingRole {
  if (requested === 'secondary_commissioner') return requested;
  if (entitlements.googleRole === 'commissioner' || entitlements.appleRole === 'commissioner') {
    return 'commissioner';
  }
  if (requested === 'commissioner') return requested;
  if (entitlements.googleRole === 'player_pro' || entitlements.appleRole === 'player_pro') {
    return 'player_pro';
  }
  return requested;
}

/** Resolve Apple alongside independently refreshed billing sources. Stripe's
 * snapshot is usable only for the exact subscription that produced it, Google
 * is always resolved from its current verified claim, and a legacy Apple role
 * is never mistaken for an unmanaged baseline. */
export function resolveAppleLinkedRole(input: {
  appleRole?: 'commissioner' | 'player_pro' | null;
  googleRole?: 'commissioner' | 'player_pro' | null;
  unmanagedRole?: BillingRole | null;
  stripeRole?: BillingRole | null;
  stripeSubscriptionIdBeforeApple?: string | null;
  currentStripeSubscriptionId?: string | null;
  legacyAppleOwned?: boolean;
}): BillingRole {
  const hasCurrentStripeBaseline = Boolean(
    input.stripeSubscriptionIdBeforeApple &&
    input.stripeSubscriptionIdBeforeApple === input.currentStripeSubscriptionId &&
    input.stripeRole,
  );
  const baseline = hasCurrentStripeBaseline
    ? input.stripeRole!
    : input.unmanagedRole === 'secondary_commissioner' ? 'secondary_commissioner'
      : input.legacyAppleOwned ? 'free_tier'
        : 'free_tier';
  return resolveStoreLinkedRole(baseline, {
    appleRole: input.appleRole,
    googleRole: input.googleRole,
  });
}