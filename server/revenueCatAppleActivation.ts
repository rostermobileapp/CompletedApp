import { nativePurchaseLoginId } from './nativePurchaseAccount';
import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';
import type { VerifiedAppleSubscription } from './revenueCatApi';
import type { AutomaticAppleClaimInput } from './appleAutomaticClaim';

export interface RevenueCatAppleActivationDependencies {
  getSubscriptions(customerId: string): Promise<VerifiedAppleSubscription[]>;
  getOwnedLineage(userId: string, customerId: string): Promise<{
    originalTransactionId: string; originalPurchasedAt: string;
  } | undefined>;
  getHistoricalTransaction?(customerId: string, subscription: VerifiedAppleSubscription): Promise<TrustedRevenueCatTransaction | undefined>;
  claim(input: AutomaticAppleClaimInput): Promise<void>;
  reconcileUser(userId: string): Promise<'commissioner' | 'player_pro' | 'free_tier'>;
}

/** Only populated by an authenticated provider webhook or server history lookup, never request-body hints. */
export interface TrustedRevenueCatTransaction {
  originalTransactionId: string;
  transactionId: string;
}

/**
 * All real provider events refresh the current server-side subscriber.
 * No active entitlement means reconcile existing claims, not grant from a
 * stale event. Missing ownership proof and provider failures remain retryable.
 */
export async function syncRevenueCatApplePurchase(
  input: Parameters<typeof activateRevenueCatApplePurchase>[0],
): Promise<{ verified: true; role: 'commissioner' | 'player_pro' } |
  { verified: false; active: false }> {
  try {
    return await activateRevenueCatApplePurchase({ ...input, expectedProductId: undefined });
  } catch (error) {
    if ((error as { status?: number })?.status !== 402) throw error;
    await input.dependencies.reconcileUser(input.userId);
    return { verified: false, active: false };
  }
}

export async function activateRevenueCatApplePurchase(input: {
  userId: string;
  loginId: unknown;
  expectedProductId?: unknown;
  trustedTransaction?: TrustedRevenueCatTransaction;
  dependencies: RevenueCatAppleActivationDependencies;
  secret?: string;
  now?: number;
}): Promise<{ verified: true; role: 'commissioner' | 'player_pro' }> {
  const purchase = await prepareRevenueCatApplePurchase(input);
  await input.dependencies.claim(purchase.claim);
  const role = await input.dependencies.reconcileUser(input.userId);
  if (role === 'free_tier' || (purchase.role === 'commissioner' && role !== 'commissioner')) {
    throw Object.assign(new Error('The verified subscription could not be applied to this account. Contact support.'), { status: 409 });
  }
  return { verified: true, role };
}

/** Read-only verification shared with dry-run backfill; never creates a claim or changes a role. */
export async function prepareRevenueCatApplePurchase(
  input: Parameters<typeof activateRevenueCatApplePurchase>[0],
): Promise<{ claim: AutomaticAppleClaimInput; role: 'commissioner' | 'player_pro' }> {
  const customerId = nativePurchaseLoginId(input.userId, 'ios', input.secret);
  const fail = (message: string, status: number): never => {
    throw Object.assign(new Error(message), { status });
  };
  if (input.loginId !== customerId) fail('Your signed-in purchase account changed. Reopen Subscription.', 409);
  if (input.expectedProductId !== undefined &&
      (typeof input.expectedProductId !== 'string' || !Object.hasOwn(IAP_PRODUCT_ROLES, input.expectedProductId))) {
    fail('The selected Apple subscription is not recognized.', 400);
  }
  const subscriptions = await input.dependencies.getSubscriptions(customerId);
  const now = input.now ?? Date.now();
  const candidates = subscriptions.filter(subscription =>
    Object.hasOwn(IAP_PRODUCT_ROLES, subscription.productId) &&
    (input.expectedProductId === undefined || subscription.productId === input.expectedProductId) &&
    Date.parse(subscription.expiresAt) > now &&
    Number.isFinite(Date.parse(subscription.originalPurchasedAt)) &&
    Date.parse(subscription.originalPurchasedAt) <= now,
  ).sort((a, b) =>
    Number(b.role === 'commissioner') - Number(a.role === 'commissioner') ||
    Date.parse(b.expiresAt) - Date.parse(a.expiresAt));
  if (!candidates.length) {
    fail('No active Apple subscription was verified for this account. Do not purchase again; use Restore purchases.', 402);
  }
  const ownedLineage = await input.dependencies.getOwnedLineage(input.userId, customerId);
  for (const subscription of candidates) {
    let transaction = input.trustedTransaction;
    const matchingOwnedLineage = ownedLineage &&
      Date.parse(ownedLineage.originalPurchasedAt) === Date.parse(subscription.originalPurchasedAt)
      ? ownedLineage.originalTransactionId : undefined;
    if (!matchingOwnedLineage && (!transaction ||
        !/^\d{10,20}$/.test(transaction.originalTransactionId) ||
        !/^\d{10,20}$/.test(transaction.transactionId) ||
        transaction.transactionId !== subscription.storeTransactionId)) {
      transaction = await input.dependencies.getHistoricalTransaction?.(customerId, subscription);
    }
    // A current, server-read subscription must match the trusted provider event
    // before its original transaction is allowed to establish a first claim.
    const notifiedLineage = transaction &&
      /^\d{10,20}$/.test(transaction.originalTransactionId) &&
      /^\d{10,20}$/.test(transaction.transactionId) &&
      transaction.transactionId === subscription.storeTransactionId
      ? transaction.originalTransactionId : undefined;
    if (ownedLineage && notifiedLineage && ownedLineage.originalTransactionId !== notifiedLineage) {
      fail('This account already owns a different Apple purchase lineage. Contact support.', 409);
    }
    const originalTransactionId = notifiedLineage ?? matchingOwnedLineage;
    if (!originalTransactionId || !/^\d{10,20}$/.test(originalTransactionId)) continue;
    return { role: subscription.role, claim: {
      userId: input.userId, customerId, originalTransactionId,
      productId: subscription.productId,
      originalPurchasedAt: subscription.originalPurchasedAt, expiresAt: subscription.expiresAt,
    } };
  }
  return fail('Your purchase is recorded, but its original transaction could not be verified. Contact support; do not purchase again.', 202);
}