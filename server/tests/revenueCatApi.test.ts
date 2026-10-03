import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getActiveAppleSubscriptions, getRevenueCatAppleSubscriptions, getRevenueCatSubscriber } from '../revenueCatApi';

const purchased = {
  store: 'app_store',
  expires_date: '2026-10-26T14:48:13Z',
  original_purchase_date: '2026-08-26T14:48:13Z',
  refunded_at: null,
  ownership_type: 'PURCHASED',
};

test('account confirmation reads only the derived custom ID and keeps original identity inside the provider context', async () => {
  const loginId = 'roster_' + 'a'.repeat(64);
  const result = await getRevenueCatSubscriber(loginId, {
    apiKey: 'fixture-only-key',
    fetcher: async url => {
      assert.equal(String(url).split('/').pop(), loginId);
      return new Response(JSON.stringify({ subscriber: {
        original_app_user_id: '$RCAnonymousID:' + 'b'.repeat(32), subscriptions: {},
      } }));
    },
  });
  assert.equal(result.original_app_user_id, '$RCAnonymousID:' + 'b'.repeat(32));
  await assert.rejects(getRevenueCatSubscriber('$RCAnonymousID:' + 'b'.repeat(32), { apiKey: 'fixture-only-key' }), { status: 400 });
});
test('failed and malformed provider records cannot confirm native association or expose provider details', async () => {
  const loginId = 'roster_ios_' + 'a'.repeat(64);
  for (const response of [new Response('private provider response', { status: 401 }),
    new Response('{}'), new Response(JSON.stringify({ subscriber: { original_app_user_id: 'original', subscriptions: [] } }))]) {
    await assert.rejects(getRevenueCatSubscriber(loginId, { apiKey: 'fixture-only-key', fetcher: async () => response }),
      error => error instanceof Error && !error.message.includes('private provider') && (error as any).status === 503);
  }
});

test('Apple transaction identifiers retain precision; unsafe numeric IDs are not lookup hints', () => {
  const parse = (id: string | number) => getActiveAppleSubscriptions({
    subscriber: { subscriptions: { 'com.rosterapp.player_pro_monthly': {
      ...purchased, store_transaction_id: id,
    } } },
  }, Date.parse('2026-09-01T00:00:00Z'))[0];
  assert.equal(parse('100000000001').storeTransactionId, '100000000001');
  assert.equal(parse(100000000001).storeTransactionId, '100000000001');
  assert.equal(parse(Number.MAX_SAFE_INTEGER + 1).storeTransactionId, undefined);
});

test('subscriber lookup queries the selected customer and never exposes the API key', async () => {
  const result = await getRevenueCatAppleSubscriptions('anonymous:customer', {
    apiKey: 'test-key',
    fetcher: async (url, options) => {
      assert.equal(String(url), 'https://api.revenuecat.com/v1/subscribers/anonymous%3Acustomer');
      assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-key');
      return new Response(JSON.stringify({ subscriber: { subscriptions: {
        'com.rosterapp.player_pro_monthly': purchased,
      } } }), { status: 200 });
    },
  });
  assert.deepEqual(result, [{
    productId: 'com.rosterapp.player_pro_monthly',
    role: 'player_pro',
    expiresAt: '2026-10-26T14:48:13.000Z',
    originalPurchasedAt: '2026-08-26T14:48:13.000Z',
  }]);
});

test('only current, purchased, non-refunded Apple products are reported', () => {
  const now = Date.parse('2026-09-27');
  assert.deepEqual(getActiveAppleSubscriptions({ subscriber: { subscriptions: {
    'com.rosterapp.player_pro_monthly': purchased,
    'com.rosterapp.commissioner_yearly': { ...purchased, ownership_type: 'FAMILY_SHARED' },
    unknown: purchased,
  } } }, now).map(s => s.role), ['player_pro']);
  for (const override of [
    { expires_date: '2026-09-01T00:00:00Z' },
    { expires_date: null },
    { original_purchase_date: null },
    { store: 'play_store' },
    { refunded_at: '2026-09-20T00:00:00Z' },
    { ownership_type: null },
    { ownership_type: 'UNKNOWN' },
  ]) {
    assert.deepEqual(getActiveAppleSubscriptions({ subscriber: { subscriptions: {
      'com.rosterapp.player_pro_monthly': { ...purchased, ...override },
    } } }, now), []);
  }
  assert.throws(() => getActiveAppleSubscriptions({}), /invalid subscriber response/);
});

test('provider errors fail explicitly and do not treat a failed lookup as no subscription', async () => {
  await assert.rejects(getRevenueCatAppleSubscriptions('id', {
    apiKey: 'test-key',
    fetcher: async () => new Response('Unauthorized', { status: 401 }),
  }), /HTTP 401/);
  await assert.rejects(getRevenueCatAppleSubscriptions('', {
    apiKey: 'test-key',
    fetcher: async () => assert.fail('Invalid IDs must never reach RevenueCat'),
  }), /Invalid RevenueCat customer ID/);
});

test('cancelling renewal retains paid access until expiry', () => {
  const response = { subscriber: { subscriptions: {
    'com.rosterapp.player_pro_monthly': { ...purchased, unsubscribe_detected_at: '2026-09-27T00:00:00Z' },
  } } };
  assert.equal(getActiveAppleSubscriptions(response, Date.parse('2026-10-01')).length, 1);
  assert.equal(getActiveAppleSubscriptions(response, Date.parse('2026-10-27')).length, 0);
});

test('verified billing grace extends access but a refund still removes it', () => {
  const sub = { ...purchased, expires_date: '2026-09-01T00:00:00Z', grace_period_expires_date: '2026-09-05T00:00:00Z' };
  const response = { subscriber: { subscriptions: { 'com.rosterapp.player_pro_monthly': sub } } };
  assert.equal(getActiveAppleSubscriptions(response, Date.parse('2026-09-03'))[0].expiresAt, '2026-09-05T00:00:00.000Z');
  assert.equal(getActiveAppleSubscriptions(response, Date.parse('2026-09-06')).length, 0);
  assert.equal(getActiveAppleSubscriptions({ subscriber: { subscriptions: {
    'com.rosterapp.player_pro_monthly': { ...sub, refunded_at: '2026-09-02T00:00:00Z' },
  } } }, Date.parse('2026-09-03')).length, 0);
});

test('sandbox subscriptions cannot activate production access', () => {
  assert.deepEqual(getActiveAppleSubscriptions({ subscriber: { subscriptions: {
    'com.rosterapp.player_pro_monthly': { ...purchased, is_sandbox: true },
  } } }, Date.parse('2026-09-27')), []);
});