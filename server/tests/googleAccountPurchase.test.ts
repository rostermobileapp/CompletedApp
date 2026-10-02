import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyGoogleAccountOrder } from '../googleAccountPurchase';
import type { GooglePlaySubscriptionPurchase } from '../googleIap';
const loginId = 'roster_' + 'a'.repeat(64);
const original = '$RCAnonymousID:' + 'b'.repeat(32);
function fixture() {
  let tokenReads = 0;
  const purchase: GooglePlaySubscriptionPurchase = {
    purchaseToken: 'fixture-token', productId: 'player_pro_monthly',
    expiryTimeMs: Date.now() + 60000, subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGED', raw: {},
  };
  const order = { purchaseToken: 'fixture-token', state: 'PROCESSED', productIds: ['player_pro_monthly'] };
  const input = { orderId: 'GPA.1234-5678-9012-34567', loginId, originalId: original,
    products: { player_pro_monthly: 'player_pro' as const },
    getOrder: async () => order, verifyToken: async () => { tokenReads++; return purchase; } };
  return { input, order, purchase, tokenReads: () => tokenReads };
}
test('authenticated record discovery still requires independently verified Google order and token', async () => {
  const f = fixture();
  assert.equal((await verifyGoogleAccountOrder(f.input)).role, 'player_pro');
  assert.equal(f.tokenReads(), 1);
});
for (const encoding of ['base64', 'hex'] as const) {
  for (const identity of [loginId, original]) {
    test(`Google binding accepts the server identity or its confirmed original in ${encoding}`, async () => {
      const f = fixture();
      f.purchase.obfuscatedExternalAccountId = createHash('sha256').update(identity).digest(encoding);
      assert.equal((await verifyGoogleAccountOrder(f.input)).role, 'player_pro');
    });
  }
}
test('a different store-bound customer cannot use alias discovery to transfer a purchase', async () => {
  const f = fixture();
  f.purchase.obfuscatedExternalAccountId = createHash('sha256').update('another-account').digest('base64');
  await assert.rejects(verifyGoogleAccountOrder(f.input), { status: 403 });
});
test('unfinished orders never request token verification or grant access', async () => {
  const f = fixture(); f.order.state = 'PENDING';
  await assert.rejects(verifyGoogleAccountOrder(f.input), { status: 402 });
  assert.equal(f.tokenReads(), 0);
});
for (const change of [
  { subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }, { expiryTimeMs: Date.now() - 60000 },
  { productId: 'toString' }, { purchaseToken: 'unrelated-token' }, { expiryTimeMs: undefined },
]) {
  test('missing, expired, malformed or unrelated store proof never grants a tier', async () => {
    const f = fixture(); Object.assign(f.purchase, change);
    await assert.rejects(verifyGoogleAccountOrder(f.input), { status: 402 });
  });
}
test('order product mismatch cannot activate an otherwise active subscription', async () => {
  const f = fixture(); f.order.productIds = ['commissioner_monthly'];
  await assert.rejects(verifyGoogleAccountOrder(f.input), { status: 402 });
});