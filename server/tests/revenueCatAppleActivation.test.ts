import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateRevenueCatApplePurchase, type RevenueCatAppleActivationDependencies } from '../revenueCatAppleActivation';
import { appleRevenueCatLoginId } from '../appleAutomaticActivation';
import type { AutomaticAppleClaimInput } from '../appleAutomaticClaim';

const userId = 'account-a';
const secret = 'fixture-secret';
const loginId = appleRevenueCatLoginId(userId, secret);
const now = Date.parse('2026-10-03');
const originalTransactionId = '100000000001';
const transactionId = '200000000002';
const subscription = {
  productId: 'com.rosterapp.commissioner_monthly',
  role: 'commissioner' as const, expiresAt: '2026-11-03T00:00:00Z',
  originalPurchasedAt: '2026-10-01T00:00:00Z', storeTransactionId: transactionId,
};
function fixture() {
  const claims: AutomaticAppleClaimInput[] = [];
  const dependencies: RevenueCatAppleActivationDependencies = {
    getSubscriptions: async id => { assert.equal(id, loginId); return [subscription]; },
    getOwnedLineage: async () => undefined,
    claim: async input => { claims.push(input); },
    reconcileUser: async () => 'commissioner',
  };
  return { dependencies, claims };
}
const activate = (dependencies: RevenueCatAppleActivationDependencies, transaction?: {
  originalTransactionId: string; transactionId: string;
}) => activateRevenueCatApplePurchase({
  userId, loginId, secret, now, dependencies, trustedTransaction: transaction,
});

test('RevenueCat record plus authenticated notification establishes canonical ownership without Apple API calls', async () => {
  const f = fixture();
  assert.deepEqual(await activate(f.dependencies, { originalTransactionId, transactionId }), {
    verified: true, role: 'commissioner',
  });
  assert.equal(f.claims[0].originalTransactionId, originalTransactionId);
  assert.equal(f.claims[0].customerId, loginId);
});

test('latest renewal transaction is never used as an unproven original ownership ID', async () => {
  const f = fixture();
  await assert.rejects(activate(f.dependencies), { status: 202 });
  assert.equal(f.claims.length, 0);
});

test('renewals use previously owned canonical lineage, not a new latest transaction ID', async () => {
  const f = fixture();
  f.dependencies.getOwnedLineage = async () => ({
    originalTransactionId, originalPurchasedAt: subscription.originalPurchasedAt,
  });
  await activate(f.dependencies);
  assert.equal(f.claims[0].originalTransactionId, originalTransactionId);
});

test('a stale or mismatched notification cannot establish a first claim', async () => {
  const f = fixture();
  await assert.rejects(activate(f.dependencies, {
    originalTransactionId, transactionId: '300000000003',
  }), { status: 202 });
  assert.equal(f.claims.length, 0);
});

test('a conflicting original lineage never changes existing ownership', async () => {
  const f = fixture();
  f.dependencies.getOwnedLineage = async () => ({
    originalTransactionId: '300000000003', originalPurchasedAt: subscription.originalPurchasedAt,
  });
  await assert.rejects(activate(f.dependencies, { originalTransactionId, transactionId }), { status: 409 });
  assert.equal(f.claims.length, 0);
});

test('wrong signed-in customer identity is rejected before any provider request', async () => {
  const f = fixture();
  f.dependencies.getSubscriptions = async () => assert.fail('must not fetch');
  await assert.rejects(activateRevenueCatApplePurchase({
    userId, loginId: `roster_ios_${'b'.repeat(64)}`, secret, now, dependencies: f.dependencies,
  }), { status: 409 });
});

test('an expired subscription cannot grant from an authenticated purchase event', async () => {
  const f = fixture();
  f.dependencies.getSubscriptions = async () => [{ ...subscription, expiresAt: '2026-10-02T00:00:00Z' }];
  await assert.rejects(activate(f.dependencies, { originalTransactionId, transactionId }), { status: 402 });
  assert.equal(f.claims.length, 0);
});

test('provider failures propagate without claims or grants', async () => {
  const f = fixture();
  f.dependencies.getSubscriptions = async () => { throw Object.assign(new Error('Provider unavailable'), { status: 503 }); };
  await assert.rejects(activate(f.dependencies, { originalTransactionId, transactionId }), { status: 503 });
  assert.equal(f.claims.length, 0);
});

test('a globally conflicting claim or unapplied Commissioner tier is not reported as success', async () => {
  const f = fixture();
  f.dependencies.claim = async () => { throw Object.assign(new Error('Owned elsewhere'), { status: 409 }); };
  await assert.rejects(activate(f.dependencies, { originalTransactionId, transactionId }), { status: 409 });
  f.dependencies.claim = async () => {};
  f.dependencies.reconcileUser = async () => 'player_pro';
  await assert.rejects(activate(f.dependencies, { originalTransactionId, transactionId }), { status: 409 });
});

test('a different purchase history cannot reuse an existing canonical ownership claim', async () => {
  const f = fixture();
  f.dependencies.getOwnedLineage = async () => ({
    originalTransactionId, originalPurchasedAt: '2025-01-01T00:00:00Z',
  });
  await assert.rejects(activate(f.dependencies), { status: 202 });
  assert.equal(f.claims.length, 0);
});