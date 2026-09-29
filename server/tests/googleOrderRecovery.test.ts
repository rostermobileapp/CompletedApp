import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertGooglePlayPurchaseAllowed, isValidGoogleReceiptRecoveryInput, isVerifiedPriorGoogleClaim, matchesGooglePlayCustomer } from '../googleIap';
import { getActiveGoogleOrderIds, getRevenueCatGoogleOrderIds } from '../revenueCatApi';

const customer = '$RCAnonymousID:41dedea94486443a9242902ecf5424d1';
const binding = createHash('sha256').update(customer).digest('base64');

test('anonymous RevenueCat identity matches the account binding Google recorded', () => {
  assert.equal(matchesGooglePlayCustomer(customer, binding), true);
});

test('order ID alone, a different device, and malformed identities cannot claim a purchase', () => {
  assert.equal(matchesGooglePlayCustomer(customer, undefined), false);
  assert.equal(matchesGooglePlayCustomer('$RCAnonymousID:differentcustomer0000000000000000', binding), false);
  assert.equal(matchesGooglePlayCustomer('GPA.3376-1900-5718-15142', binding), false);
  assert.equal(matchesGooglePlayCustomer('', binding), false);
  assert.equal(matchesGooglePlayCustomer(customer, 'bad-base64'), false);
  assert.equal(isValidGoogleReceiptRecoveryInput('GPA.1234-5678-9012-34567', customer), true);
  assert.equal(isValidGoogleReceiptRecoveryInput('GPA.1234-5678-9012-34567', ''), false);
  assert.equal(isValidGoogleReceiptRecoveryInput('GPA.1234-5678-9012-34567', undefined), false);
  assert.equal(isValidGoogleReceiptRecoveryInput('', customer), false);
});

test('legacy Apple backfill is not mistaken for a verified older Google claim', () => {
  assert.equal(isVerifiedPriorGoogleClaim('current', { userId: 'current', productId: null }), false);
  assert.equal(isVerifiedPriorGoogleClaim('current', { userId: 'other', productId: 'player_pro_monthly' }), false);
  assert.equal(isVerifiedPriorGoogleClaim('current', { userId: 'current', productId: 'player_pro_yearly' }), true);
});

test('production rejects Play license-test purchases before any purchase or restore can claim a role', () => {
  assert.throws(
    () => assertGooglePlayPurchaseAllowed({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', testPurchase: {} }, 'production'),
    { status: 403, message: 'Google Play test purchases cannot grant production access.' },
  );
  assert.throws(
    () => assertGooglePlayPurchaseAllowed({ testPurchase: null }, 'production'),
    { status: 403 },
  );
  assert.doesNotThrow(() => assertGooglePlayPurchaseAllowed({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }, 'production'));
  assert.doesNotThrow(() => assertGooglePlayPurchaseAllowed({ testPurchase: {} }, 'development'));
});

test('RevenueCat supplies active purchased Google orders for automatic lookup', () => {
  const result = getActiveGoogleOrderIds({ subscriber: { subscriptions: {
    player_pro_monthly: {
      store: 'play_store', ownership_type: 'PURCHASED',
      expires_date: '2030-10-28T00:00:00Z',
      store_transaction_id: 'GPA.1234-5678-9012-34567..0',
    },
    commissioner_monthly: {
      store: 'play_store', ownership_type: 'PURCHASED',
      expires_date: '2020-10-28T00:00:00Z',
      store_transaction_id: 'GPA.9999-9999-9999-99999',
    },
    player_pro_yearly: {
      store: 'app_store', ownership_type: 'PURCHASED',
      expires_date: '2030-10-28T00:00:00Z',
      store_transaction_id: 'GPA.1111-1111-1111-11111',
    },
  } } }, Date.parse('2026-09-28T00:00:00Z'));
  assert.deepEqual(result, ['GPA.1234-5678-9012-34567..0']);
});

test('RevenueCat lookup never returns unverified receipt data directly to the client', async () => {
  const orders = await getRevenueCatGoogleOrderIds(customer, {
    apiKey: 'test-only',
    fetcher: async (url, init) => {
      assert.match(String(url), /\/v1\/subscribers\//);
      assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, 'Bearer test-only');
      return new Response(JSON.stringify({ subscriber: { subscriptions: {
        player_pro_monthly: {
          store: 'play_store', ownership_type: 'PURCHASED',
          expires_date: '2030-10-28T00:00:00Z',
          store_transaction_id: 'GPA.1234-5678-9012-34567',
        },
      } } }), { status: 200 });
    },
  });
  assert.deepEqual(orders, ['GPA.1234-5678-9012-34567']);
  assert.deepEqual(getActiveGoogleOrderIds({ subscriber: { subscriptions: {
    player_pro_monthly: {
      store: 'play_store', ownership_type: 'FAMILY_SHARED',
      expires_date: '2030-10-28T00:00:00Z',
      store_transaction_id: 'GPA.1234-5678-9012-34567',
    },
  } } }), []);
});