/**
 * Read-only diagnostic for a customer independently confirmed to exist in
 * RevenueCat. Never creates a Roster claim or changes account access.
 */
import { getRevenueCatActiveAppleSubscriptions } from '../server/revenueCatApi';
import { lookupTransactionById } from '../server/appleIap';

const customerId = process.argv[2];
if (!/^roster_ios_[a-f0-9]{64}$/.test(customerId ?? '')) {
  throw new Error('Supply an independently confirmed existing iOS customer ID.');
}

try {
  const subscriptions = await getRevenueCatActiveAppleSubscriptions(customerId);
  console.log(JSON.stringify({ subscriptions }));
  for (const subscription of subscriptions) {
    if (!subscription.storeTransactionId) {
      console.log(JSON.stringify({ appleLookup: 'missing_transaction_id' }));
      continue;
    }
    try {
      const { payload } = await lookupTransactionById(subscription.storeTransactionId);
      console.log(JSON.stringify({
        appleLookup: 'verified',
        productId: payload.productId,
        bundleId: payload.bundleId,
        originalTransactionId: payload.originalTransactionId,
        purchaseDate: payload.purchaseDate,
        originalPurchaseDate: payload.originalPurchaseDate,
        expiresDate: payload.expiresDate,
        hasAccountToken: Boolean(payload.appAccountToken),
        revoked: Boolean(payload.revocationDate || payload.revocationReason !== undefined),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const httpStatus = message.match(/^Apple transactions API unavailable \(HTTP (\d{3})\)$/)?.[1];
      console.log(JSON.stringify({
        appleLookup: 'failed',
        ...(httpStatus ? { httpStatus: Number(httpStatus) } : {}),
        stage: /crypto is not defined/.test(message) ? 'local_crypto_runtime'
          : /certificate|cert chain|x5c|signature|bundleId/.test(message) ? 'signed_response_validation'
          : httpStatus ? 'apple_api' : 'local_or_network',
      }));
    }
  }
} catch {
  console.log(JSON.stringify({ revenueCatLookup: 'failed' }));
}