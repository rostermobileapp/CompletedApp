import { isSubscriptionEntitled, matchesGooglePlayCustomer, type GooglePlaySubscriptionPurchase } from './googleIap';

/** Inputs come from an authenticated, derived RevenueCat subscriber record.
 * An order hint alone, a client callback, or a client-selected customer is
 * insufficient. Google remains the source of the actual token and state.
 */
export async function verifyGoogleAccountOrder(input: {
  orderId: string;
  loginId: string;
  originalId?: string;
  products: Record<string, 'commissioner' | 'player_pro'>;
  getOrder(id: string): Promise<{ purchaseToken: string; state: string; productIds: string[] }>;
  verifyToken(token: string): Promise<GooglePlaySubscriptionPurchase>;
}): Promise<{ role: 'commissioner' | 'player_pro'; purchase: GooglePlaySubscriptionPurchase }> {
  const order = await input.getOrder(input.orderId);
  if (order.state !== 'PROCESSED') {
    throw Object.assign(new Error('Google Play has not completed this order. Restore later; do not buy again.'), { status: 402 });
  }
  const purchase = await input.verifyToken(order.purchaseToken);
  if (purchase.purchaseToken !== order.purchaseToken) {
    throw Object.assign(new Error('Google Play returned an inconsistent purchase.'), { status: 402 });
  }
  if (purchase.obfuscatedExternalAccountId &&
      !matchesGooglePlayCustomer(input.loginId, purchase.obfuscatedExternalAccountId) &&
      !(input.originalId && matchesGooglePlayCustomer(input.originalId, purchase.obfuscatedExternalAccountId))) {
    throw Object.assign(new Error('Google Play linked this purchase to a different account. Contact support.'), { status: 403 });
  }
  const role = input.products[purchase.productId];
  if ((role !== 'commissioner' && role !== 'player_pro') ||
      !order.productIds.includes(purchase.productId) ||
      !isSubscriptionEntitled(purchase.subscriptionState, purchase.expiryTimeMs) ||
      !Number.isFinite(purchase.expiryTimeMs)) {
    throw Object.assign(new Error('Google Play did not confirm an active Roster subscription.'), { status: 402 });
  }
  return { role, purchase };
}