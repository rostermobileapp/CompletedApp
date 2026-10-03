import { appleRevenueCatLoginId } from './appleAutomaticActivation';
import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';
import type { VerifiedAppleSubscription } from './revenueCatApi';
import type { AutomaticAppleClaimInput } from './appleAutomaticClaim';

export interface RevenueCatAppleActivationDependencies {
  getSubscriptions(customerId: string): Promise<VerifiedAppleSubscription[]>;
  getOwnedLineage(userId: string, customerId: string): Promise<{
    originalTransactionId: string; originalPurchasedAt: string;
  } | undefined>;
  claim(input: AutomaticAppleClaimInput): Promise<void>;
  reconcileUser(userId: string): Promise<'commissioner' | 'player_pro' | 'free_tier'>;
}

/** Only populated by the authenticated RevenueCat webhook, never request-body hints. */
export interface TrustedRevenueCatTransaction {
  originalTransactionId: string;
  transactionId: string;
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
  const customerId = appleRevenueCatLoginId(input.userId, input.secret);
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
    const transaction = input.trustedTransaction;
    // A current, server-read subscription must match the trusted notification
    // before its original transaction is allowed to establish a first claim.
    const notifiedLineage = transaction &&
      /^\d{10,20}$/.test(transaction.originalTransactionId) &&
      /^\d{10,20}$/.test(transaction.transactionId) &&
      transaction.transactionId === subscription.storeTransactionId
      ? transaction.originalTransactionId : undefined;
    if (ownedLineage && notifiedLineage && ownedLineage.originalTransactionId !== notifiedLineage) {
      fail('This account already owns a different Apple purchase lineage. Contact support.', 409);
    }
    const matchingOwnedLineage = ownedLineage &&
      Date.parse(ownedLineage.originalPurchasedAt) === Date.parse(subscription.originalPurchasedAt)
      ? ownedLineage.originalTransactionId : undefined;
    const originalTransactionId = notifiedLineage ?? matchingOwnedLineage;
    if (!originalTransactionId || !/^\d{10,20}$/.test(originalTransactionId)) continue;
    await input.dependencies.claim({
      userId: input.userId, customerId, originalTransactionId,
      productId: subscription.productId,
      originalPurchasedAt: subscription.originalPurchasedAt, expiresAt: subscription.expiresAt,
    });
    const role = await input.dependencies.reconcileUser(input.userId);
    if (role === 'free_tier' ||
        (IAP_PRODUCT_ROLES[subscription.productId] === 'commissioner' && role !== 'commissioner')) {
      return fail('The verified subscription could not be applied to this account. Contact support.', 409);
    }
    return { verified: true, role };
  }
  return fail('Your purchase is recorded. Waiting for its secure RevenueCat notification; do not purchase again.', 202);
}