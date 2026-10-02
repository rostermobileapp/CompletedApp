import type { AppleTransactionPayload } from './appleIap';
import type { VerifiedAppleSubscription } from './revenueCatApi';
import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';

/** Only signed Apple status/transaction responses establish active Apple access.
 * The legacy customer_id is a database lookup key, never a provider identity.
 */
export async function getAppleStoreSubscriptions(
  originalId: string,
  dependencies: {
    statuses(id: string): Promise<{ activePayloads: AppleTransactionPayload[] }>;
    transaction(id: string): Promise<{ payload: AppleTransactionPayload }>;
  },
): Promise<VerifiedAppleSubscription[]> {
  const { activePayloads } = await dependencies.statuses(originalId);
  const result: VerifiedAppleSubscription[] = [];
  for (const tx of activePayloads) {
    if (tx.originalTransactionId !== originalId) throw new Error('Apple returned a different purchase lineage.');
    const role = IAP_PRODUCT_ROLES[tx.productId];
    if (!role || tx.revocationDate || !tx.expiresDate || tx.expiresDate <= Date.now()) continue;
    let purchasedAt = tx.originalPurchaseDate;
    if (!Number.isFinite(purchasedAt)) {
      const original = (await dependencies.transaction(originalId)).payload;
      if (original.originalTransactionId !== originalId) throw new Error('Apple returned a different purchase lineage.');
      purchasedAt = original.originalPurchaseDate ?? original.purchaseDate;
    }
    if (!Number.isFinite(purchasedAt)) throw new Error('Apple did not confirm the original purchase date.');
    result.push({
      productId: tx.productId, role, expiresAt: new Date(tx.expiresDate).toISOString(),
      originalPurchasedAt: new Date(purchasedAt!).toISOString(), storeTransactionId: tx.transactionId,
    });
  }
  return result;
}