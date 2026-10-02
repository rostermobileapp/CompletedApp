import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAppleStoreSubscriptions } from '../appleStoreSubscriptions';
import type { AppleTransactionPayload } from '../appleIap';
import { assertNativeBillingRequestAccount } from '../nativeBillingAccount';
const originalId = '100000000001';
function payload(overrides: Partial<AppleTransactionPayload> = {}): AppleTransactionPayload {
  return {
    bundleId: 'com.rosterapp', originalTransactionId: originalId, transactionId: '200000000001',
    productId: 'com.rosterapp.player_pro_monthly', purchaseDate: Date.now() - 10_000,
    originalPurchaseDate: Date.now() - 20_000, expiresDate: Date.now() + 1_000_000,
    environment: 'Sandbox', type: 'Auto-Renewable Subscription', ...overrides,
  };
}
test('direct signed Apple status supplies active entitlement without RevenueCat data or credentials', async () => {
  const tx = payload();
  const result = await getAppleStoreSubscriptions(originalId, {
    statuses: async id => { assert.equal(id, originalId); return { activePayloads: [tx] }; },
    transaction: async () => { throw new Error('Not needed'); },
  });
  assert.equal(result[0].role, 'player_pro');
  assert.equal(result[0].originalPurchasedAt, new Date(tx.originalPurchaseDate!).toISOString());
});
test('original date fallback is resolved with Apple, not RevenueCat', async () => {
  const tx = payload({ originalPurchaseDate: undefined });
  const original = payload();
  const result = await getAppleStoreSubscriptions(originalId, {
    statuses: async () => ({ activePayloads: [tx] }),
    transaction: async id => { assert.equal(id, originalId); return { payload: original }; },
  });
  assert.equal(result[0].originalPurchasedAt, new Date(original.originalPurchaseDate!).toISOString());
});
for (const override of [{ revocationDate: Date.now() }, { expiresDate: Date.now() - 1 }, { productId: 'unknown' }, { expiresDate: undefined }]) {
  test('revoked, expired, unknown or incomplete Apple transaction grants nothing', async () => {
    assert.deepEqual(await getAppleStoreSubscriptions(originalId, {
      statuses: async () => ({ activePayloads: [payload(override)] }),
      transaction: async () => { throw new Error('Not needed'); },
    }), []);
  });
}
test('Apple outage is unknown, never entitlement proof', async () => {
  await assert.rejects(getAppleStoreSubscriptions(originalId, {
    statuses: async () => { throw new Error('Apple unavailable'); },
    transaction: async () => { throw new Error('Not needed'); },
  }), /Apple unavailable/);
});
test('another original transaction cannot substitute for the owned lineage', async () => {
  await assert.rejects(getAppleStoreSubscriptions(originalId, {
    statuses: async () => ({ activePayloads: [payload({ originalTransactionId: 'different' })] }),
    transaction: async () => { throw new Error('Not needed'); },
  }), /different purchase lineage/);
});
test('account race is rejected before store verification', () => {
  assert.throws(() => assertNativeBillingRequestAccount('account-a', { expectedUserId: 'account-b' }), { status: 409 });
  assertNativeBillingRequestAccount('account-a', { expectedUserId: 'account-a' });
});