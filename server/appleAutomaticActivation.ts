import { createHmac } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';
import type { AppleTransactionPayload } from './appleIap';
import type { VerifiedAppleSubscription } from './revenueCatApi';

const APPLE_LOGIN_DOMAIN = 'revenuecat-apple:';
const APPLE_PRODUCT_IDS = new Set(Object.keys(IAP_PRODUCT_ROLES));
const ORIGINAL_TRANSACTION_ID = /^\d{10,20}$/;
const IAP_APP_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export function appleRevenueCatLoginId(userId: string, secret = process.env.SESSION_SECRET): string {
  if (!secret) {
    throw Object.assign(new Error('Automatic Apple activation is unavailable.'), { status: 503 });
  }
  return `roster_ios_${createHmac('sha256', secret).update(`${APPLE_LOGIN_DOMAIN}${userId}`).digest('hex')}`;
}

export type AutomaticAppleDependencies = {
  getSubscriptions(customerId: string): Promise<VerifiedAppleSubscription[]>;
  lookupTransactionById(transactionId: string): Promise<{ payload: AppleTransactionPayload }>;
  claim(input: {
    userId: string;
    customerId: string;
    originalTransactionId: string;
    productId: string;
    originalPurchasedAt: string;
    expiresAt: string;
  }): Promise<void>;
  reconcileUser(userId: string): Promise<'commissioner' | 'player_pro' | 'free_tier'>;
};

function activationError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/** Verify the app-scoped RevenueCat identity and independently establish Apple lineage. */
export async function activateAppleAutomatically(input: {
  userId: string;
  loginId: unknown;
  expectedProductId?: unknown;
  secret?: string;
  now?: number;
  dependencies: AutomaticAppleDependencies;
}): Promise<{ role: 'commissioner' | 'player_pro'; verified: true }> {
  const derivedLoginId = appleRevenueCatLoginId(input.userId, input.secret);
  if (typeof input.loginId !== 'string' || input.loginId !== derivedLoginId) {
    throw activationError('Your signed-in account changed. Reopen the purchase screen and try again.', 409);
  }
  if (input.expectedProductId !== undefined &&
      (typeof input.expectedProductId !== 'string' || !APPLE_PRODUCT_IDS.has(input.expectedProductId))) {
    throw activationError('The selected Apple subscription is not recognized.', 400);
  }

  let subscriptions: VerifiedAppleSubscription[];
  try {
    subscriptions = await input.dependencies.getSubscriptions(derivedLoginId);
  } catch {
    throw activationError('Apple purchase verification is temporarily unavailable. Please try again later.', 503);
  }
  const now = input.now ?? Date.now();
  const expectedAccountToken = uuidv5(input.userId, IAP_APP_NAMESPACE).toLowerCase();
  const candidates = subscriptions
    .filter(subscription => APPLE_PRODUCT_IDS.has(subscription.productId) &&
      (input.expectedProductId === undefined || subscription.productId === input.expectedProductId) &&
      Date.parse(subscription.expiresAt) > now &&
      Date.parse(subscription.originalPurchasedAt) <= now &&
      /^\d{10,20}$/.test(subscription.storeTransactionId ?? ''))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  if (!candidates.length) {
    throw activationError('No active Apple subscription was found for this account. Restore purchases or contact support.', 402);
  }

  let lastLookupFailed = false;
  for (const candidate of candidates) {
    let transaction: AppleTransactionPayload;
    try {
      transaction = (await input.dependencies.lookupTransactionById(candidate.storeTransactionId!)).payload;
    } catch {
      lastLookupFailed = true;
      continue;
    }
    if (transaction.appAccountToken &&
        transaction.appAccountToken.toLowerCase() !== expectedAccountToken) {
      throw activationError('This Apple purchase is linked to a different account. Contact support.', 409);
    }
    const expiresAt = transaction.expiresDate;
    const purchaseAt = transaction.purchaseDate;
    let originalPurchaseAt = transaction.originalPurchaseDate;
    if (!Number.isFinite(originalPurchaseAt)) {
      try {
        const original = (await input.dependencies.lookupTransactionById(
          transaction.originalTransactionId,
        )).payload;
        if (original.bundleId !== 'com.rosterapp' ||
            String(original.transactionId) !== transaction.originalTransactionId ||
            original.originalTransactionId !== transaction.originalTransactionId ||
            !Number.isFinite(original.purchaseDate) ||
            (original.appAccountToken &&
              original.appAccountToken.toLowerCase() !== expectedAccountToken)) {
          continue;
        }
        originalPurchaseAt = original.purchaseDate;
      } catch {
        lastLookupFailed = true;
        continue;
      }
    }
    if (transaction.bundleId !== 'com.rosterapp' ||
        String(transaction.transactionId) !== candidate.storeTransactionId ||
        transaction.productId !== candidate.productId ||
        !ORIGINAL_TRANSACTION_ID.test(transaction.originalTransactionId ?? '') ||
        !Number.isFinite(purchaseAt) || purchaseAt > now ||
        !Number.isFinite(originalPurchaseAt) ||
        !Number.isFinite(expiresAt) || expiresAt! <= now ||
        transaction.revocationDate || transaction.revocationReason !== undefined ||
        Math.abs(Date.parse(candidate.expiresAt) - expiresAt!) > 1000 ||
        Math.abs(Date.parse(candidate.originalPurchasedAt) - originalPurchaseAt!) > 1000) {
      continue;
    }
    try {
      await input.dependencies.claim({
        userId: input.userId,
        customerId: derivedLoginId,
        originalTransactionId: transaction.originalTransactionId,
        productId: candidate.productId,
        originalPurchasedAt: new Date(originalPurchaseAt!).toISOString(),
        expiresAt: new Date(expiresAt!).toISOString(),
      });
      const role = await input.dependencies.reconcileUser(input.userId);
      const requiredRole = IAP_PRODUCT_ROLES[candidate.productId];
      if (role === 'free_tier' || (requiredRole === 'commissioner' && role !== 'commissioner')) {
        throw activationError('Your Apple subscription is verified but could not be applied to this account. Contact support.', 409);
      }
      return { role, verified: true };
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      throw activationError('This Apple subscription is already linked to another account. Contact support.', 409);
    }
  }
  if (lastLookupFailed) {
    throw activationError('Apple could not verify this purchase right now. Please try again later.', 503);
  }
  throw activationError('This Apple subscription is expired, refunded, or does not match the selected plan.', 402);
}