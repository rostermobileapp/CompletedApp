import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAlreadyOwnedPurchaseError, parseAndroidPurchaseStatus } from '../../client/src/lib/androidPurchaseStatus';

test('an already active Google Play product is not mistaken for a verifiable purchase', () => {
  const result = parseAndroidPurchaseStatus({
    status: 'SUCCESS',
    customerInfo: { activeSubscriptions: ['player_pro_monthly'] },
  });
  assert.deepEqual(result.activeProductIds, ['player_pro_monthly']);
  assert.deepEqual(result.purchases, []);
});

test('restored purchase token can be sent for server-side verification', () => {
  const result = parseAndroidPurchaseStatus({
    purchases: [{ productIdentifier: 'player_pro_monthly', purchaseToken: 'play-proof' }],
  });
  assert.equal(result.purchases[0].purchaseToken, 'play-proof');
  assert.deepEqual(result.activeProductIds, []);
});

test('does not treat an unrelated store product as a Roster entitlement', () => {
  const result = parseAndroidPurchaseStatus({ activeSubscriptions: ['other_app_monthly'] });
  assert.deepEqual(result.activeProductIds, []);
  assert.deepEqual(result.purchases, []);
});

test('a historical purchase is not shown as active without a current store entitlement', () => {
  const result = parseAndroidPurchaseStatus({
    purchases: [{ productIdentifier: 'player_pro_monthly' }],
  });
  assert.deepEqual(result.activeProductIds, []);
  assert.deepEqual(result.purchases, []);
});

test('already-owned errors lead to restore rather than another payment attempt', () => {
  assert.equal(isAlreadyOwnedPurchaseError('This product is already active for the user.'), true);
  assert.equal(isAlreadyOwnedPurchaseError("You're already subscribed to Player Pro - Monthly"), true);
  assert.equal(isAlreadyOwnedPurchaseError('ITEM_ALREADY_OWNED'), true);
  assert.equal(isAlreadyOwnedPurchaseError('Billing unavailable'), false);
});