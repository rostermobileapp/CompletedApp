import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isValidGoogleReceiptRecoveryInput, isVerifiedPriorGoogleClaim, matchesGooglePlayCustomer } from '../googleIap';
import { getActiveGoogleOrderIds, getRevenueCatGoogleOrderIds } from '../revenueCatApi';
import { verifyGoogleOrderWithLinkedFallback } from '../googleOrderRecovery';

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

test('a linked Play order remains discoverable when RevenueCat omits ownership_type', async () => {
  const receipt = 'GPA.1234-5678-9012-34567';
  const orders = await getRevenueCatGoogleOrderIds('roster_' + 'a'.repeat(64), {
    apiKey: 'test-only',
    fetcher: async () => new Response(JSON.stringify({ subscriber: { subscriptions: {
      player_pro_monthly: {
        store: 'play_store',
        expires_date: '2030-10-30T00:00:00Z',
        store_transaction_id: receipt,
      },
    } } }), { status: 200 }),
  });
  assert.deepEqual(orders, [receipt]);
  assert.equal(orders.includes('GPA.9999-9999-9999-99999'), false);
  assert.deepEqual(getActiveGoogleOrderIds({ subscriber: { subscriptions: {
    player_pro_monthly: {
      store: 'play_store', ownership_type: 'FAMILY_SHARED',
      expires_date: '2030-10-30T00:00:00Z', store_transaction_id: receipt,
    },
  } } }), []);
});

test('mismatched device recovers only the exact order on the signed-in account', async () => {
  const receipt = 'GPA.1234-5678-9012-34567';
  let verifiedWithGoogle = false;
  const result = await verifyGoogleOrderWithLinkedFallback(
    receipt,
    async () => { throw Object.assign(new Error('device mismatch'), { status: 403 }); },
    async () => [receipt],
    async () => { verifiedWithGoogle = true; return { role: 'player_pro' }; },
  );
  assert.deepEqual(result, { role: 'player_pro' });
  assert.equal(verifiedWithGoogle, true);
});

test('a wrong or missing linked order cannot bypass the device mismatch', async () => {
  const mismatch = Object.assign(new Error('device mismatch'), { status: 403 });
  let verifiedWithGoogle = false;
  await assert.rejects(
    verifyGoogleOrderWithLinkedFallback(
      'GPA.1234-5678-9012-34567',
      async () => { throw mismatch; },
      async () => ['GPA.9999-9999-9999-99999'],
      async () => { verifiedWithGoogle = true; },
    ),
    (error: unknown) => error === mismatch,
  );
  assert.equal(verifiedWithGoogle, false);
});

test('inactive or conflicting claims do not fall back to a different identity', async () => {
  for (const status of [402, 409]) {
    const denied = Object.assign(new Error('purchase denied'), { status });
    let lookedUpAnotherIdentity = false;
    await assert.rejects(
      verifyGoogleOrderWithLinkedFallback(
        'GPA.1234-5678-9012-34567',
        async () => { throw denied; },
        async () => { lookedUpAnotherIdentity = true; return []; },
        async () => 'player_pro',
      ),
      (error: unknown) => error === denied,
    );
    assert.equal(lookedUpAnotherIdentity, false);
  }
});

test('Google verification failure on the linked order cannot grant access', async () => {
  const googleError = Object.assign(new Error('expired'), { status: 402 });
  await assert.rejects(
    verifyGoogleOrderWithLinkedFallback(
      'GPA.1234-5678-9012-34567',
      async () => { throw Object.assign(new Error('device mismatch'), { status: 403 }); },
      async () => ['GPA.1234-5678-9012-34567'],
      async () => { throw googleError; },
    ),
    (error: unknown) => error === googleError,
  );
});