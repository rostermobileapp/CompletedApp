import { apiRequest, queryClient } from './queryClient';
import {
  canPurchaseAndroidProduct,
  ensureCurrentNativePurchaseAccount,
  getCurrentNativePurchaseAppUserId,
  purchaseProduct,
  purchaseProductAndroid,
  restorePurchases,
  restorePurchasesAndroid,
} from './nativePurchases';
import { getCanonicalNativeRevenueCatId } from './nativeRevenueCat';
import { onboardingProductId, type PaidTier, type BillingPeriod } from './onboardingNativeProducts';

/** A server-issued account ID plus an authoritative *current* native read-back. */
async function authorizeStoreAccount(): Promise<string> {
  const id = await getCanonicalNativeRevenueCatId();
  await ensureCurrentNativePurchaseAccount(id);
  // Prevent a sign-out/account switch while native login was pending.
  if (await getCanonicalNativeRevenueCatId() !== id ||
      await getCurrentNativePurchaseAppUserId() !== id) {
    throw new Error('The signed-in purchase account changed. No purchase was started.');
  }
  return id;
}

async function refreshAccess() {
  await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
  await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
}

/** Uses the same store callbacks and verification endpoints as Subscriptions. */
export async function buyOnboardingNativePlan(
  platform: 'ios' | 'android',
  tier: PaidTier,
  period: BillingPeriod,
  prices: Record<string, string>,
  googleAvailability?: { available: boolean; productIds: string[] },
  onPurchaseStarted?: () => void,
): Promise<'active' | 'pending'> {
  const productId = onboardingProductId(tier, period);
  if (!prices[productId]) throw new Error('This plan is not available from your app store right now.');
  if (platform === 'android' && !canPurchaseAndroidProduct(
    prices, productId, googleAvailability?.available, googleAvailability?.productIds,
  )) throw new Error('Google Play cannot verify this plan right now. No purchase was started.');

  const accountId = await authorizeStoreAccount();
  // There must be no awaited work between this check and the native purchase call.
  onPurchaseStarted?.();
  if (platform === 'ios') {
    const transaction = await purchaseProduct(productId);
    const payload = transaction.jwsRepresentation
      ? { jws: transaction.jwsRepresentation }
      : transaction.transactionId ? { transactionId: transaction.transactionId } : null;
    if (!payload) throw new Error('Purchase completed but verification data is missing. Do not buy again; use Restore Purchases.');
    if (await getCanonicalNativeRevenueCatId() !== accountId) {
      throw new Error('The signed-in account changed during purchase. Do not buy again; sign back in and restore.');
    }
    let response: Response;
    try {
      response = await apiRequest('POST', '/api/iap/verify', {
        ...payload, expectedRevenueCatAppUserId: accountId,
      });
    } catch {
      throw new Error('Purchase completed but could not be verified. Do not buy again; use Restore Purchases.');
    }
    const result = await response.json() as { role?: string };
    if (response.status === 202 || !result.role || result.role === 'free_tier') return 'pending';
    await refreshAccess();
    return 'active';
  }
  const purchase = await purchaseProductAndroid(productId);
  if (await getCanonicalNativeRevenueCatId() !== accountId) {
    throw new Error('The signed-in account changed during purchase. Do not buy again; sign back in and restore.');
  }
  let response: Response;
  try {
    response = await apiRequest('POST', '/api/iap/verify-google', {
      purchaseToken: purchase.purchaseToken,
      productId: purchase.productIdentifier || productId,
      expectedRevenueCatAppUserId: accountId,
    });
  } catch {
    throw new Error('Purchase completed but could not be verified. Do not buy again; use Restore Purchases.');
  }
  if (response.status === 202) return 'pending';
  const result = await response.json() as { role?: string };
  if (!result.role || result.role === 'free_tier') return 'pending';
  await refreshAccess();
  return 'active';
}

export async function restoreOnboardingNativePurchase(platform: 'ios' | 'android'): Promise<boolean> {
  const accountId = await authorizeStoreAccount();
  if (platform === 'ios') {
    const purchases = await restorePurchases();
    if (!purchases.some(p => p.jwsRepresentation || p.transactionId)) {
      throw new Error('No verifiable App Store purchase was returned. Do not buy again if you already subscribed.');
    }
    let verified = false;
    for (const proof of purchases) {
      if (!proof.jwsRepresentation && !proof.transactionId) continue;
      try {
        const response = await apiRequest('POST', '/api/iap/verify',
          proof.jwsRepresentation
            ? { jws: proof.jwsRepresentation, expectedRevenueCatAppUserId: accountId }
            : { transactionId: proof.transactionId, expectedRevenueCatAppUserId: accountId });
        const result = await response.json() as { role?: string };
        if (result.role && result.role !== 'free_tier') verified = true;
      } catch {
        // Expired or unrelated transactions do not hide a later active one.
      }
    }
    if (verified) await refreshAccess();
    return verified;
  }
  const purchases = await restorePurchasesAndroid();
  if (purchases.length === 0) {
    // This existing endpoint can recover store-side purchases without a
    // bridge-supplied token; it still verifies ownership server-side.
    const response = await apiRequest('POST', '/api/iap/restore-google-automatic', {
      expectedRevenueCatAppUserId: accountId,
    });
    const result = await response.json() as { role?: string };
    if (!response.ok || !result.role || result.role === 'free_tier') return false;
    await refreshAccess();
    return true;
  }
  let verified = false;
  for (const p of purchases) {
    try {
      const response = await apiRequest('POST', '/api/iap/verify-google', {
        purchaseToken: p.purchaseToken,
        productId: p.productIdentifier,
        expectedRevenueCatAppUserId: accountId,
      });
      if (response.status === 202) continue;
      const result = await response.json() as { role?: string };
      if (result.role && result.role !== 'free_tier') verified = true;
    } catch {
      // Another token may still be active; continue verification.
    }
  }
  if (verified) await refreshAccess();
  return verified;
}