import { pool } from './db';
import { nativePurchaseLoginId } from './nativePurchaseAccount';
import { getRevenueCatActiveAppleSubscriptions } from './revenueCatApi';
import { getRevenueCatAppleHistoricalTransaction, isRevenueCatAppleHistoryConfigured } from './revenueCatAppleHistory';
import { claimAutomaticApplePurchase, reconcileApplePurchaseLinkForUser } from './applePurchaseLinks';
import {
  activateRevenueCatApplePurchase, syncRevenueCatApplePurchase, prepareRevenueCatApplePurchase,
  type TrustedRevenueCatTransaction, type RevenueCatAppleActivationDependencies,
} from './revenueCatAppleActivation';

/** Shared by authenticated native routes and the operator-only backfill. */
export async function refreshRevenueCatAppleAccount(input: {
  userId: string; loginId: string; expectedProductId?: unknown;
  trustedTransaction?: TrustedRevenueCatTransaction; syncCurrentStatus?: boolean;
  dryRun?: boolean;
}) {
  if (input.loginId !== nativePurchaseLoginId(input.userId, 'ios')) {
    throw Object.assign(new Error('Your signed-in purchase account changed. Reopen Subscription.'), { status: 409 });
  }
  if (!input.dryRun && input.syncCurrentStatus) {
    const link = (await pool.query<{ customer_id: string }>(
      'SELECT customer_id FROM apple_purchase_links WHERE user_id = $1', [input.userId],
    )).rows[0];
    if (link && link.customer_id !== input.loginId) {
      // Named-customer refresh must not rewrite an operator-attested or direct
      // Apple claim. Refresh that owner's established verification source.
      const existing = await reconcileApplePurchaseLinkForUser(input.userId);
      return existing?.active && (existing.role === 'commissioner' || existing.role === 'player_pro')
        ? { verified: true as const, role: existing.role }
        : { verified: false as const, active: false as const };
    }
  }
  if (!input.dryRun && !input.syncCurrentStatus) {
    const existing = await reconcileApplePurchaseLinkForUser(input.userId);
    if (existing?.active && (existing.role === 'commissioner' || existing.role === 'player_pro') &&
        (!input.expectedProductId || input.expectedProductId === existing.productId)) {
      return { verified: true as const, role: existing.role };
    }
  }
  const dependencies: RevenueCatAppleActivationDependencies = {
    getSubscriptions: async id => {
      for (let attempt = 0; ; attempt++) {
        const records = await getRevenueCatActiveAppleSubscriptions(id);
        if (records.length || attempt === 2) return records;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    },
    getOwnedLineage: async (id, customerId) => {
      const link = (await pool.query<{ original_transaction_id: string; original_purchased_at: Date }>(
        'SELECT original_transaction_id, original_purchased_at FROM apple_purchase_links WHERE user_id = $1 AND customer_id = $2',
        [id, customerId],
      )).rows[0];
      return link ? { originalTransactionId: link.original_transaction_id,
        originalPurchasedAt: new Date(link.original_purchased_at).toISOString() } : undefined;
    },
    getHistoricalTransaction: async (id, subscription) =>
      isRevenueCatAppleHistoryConfigured() ? getRevenueCatAppleHistoricalTransaction(id, subscription) : undefined,
    claim: claimAutomaticApplePurchase,
    reconcileUser: async id => {
      const role = (await reconcileApplePurchaseLinkForUser(id))?.role ?? 'free_tier';
      return role === 'secondary_commissioner' ? 'player_pro' : role;
    },
  };
  if (input.dryRun) {
    const prepared = await prepareRevenueCatApplePurchase({ ...input, dependencies });
    // Preview only. Applying re-fetches the provider and atomically checks all
    // ownership constraints; this result is not an authorization to bypass them.
    return { verified: true as const, dryRun: true as const, role: prepared.role,
      productId: prepared.claim.productId, expiresAt: prepared.claim.expiresAt };
  }
  const activate = input.syncCurrentStatus ? syncRevenueCatApplePurchase : activateRevenueCatApplePurchase;
  return activate({ ...input, dependencies });
}
