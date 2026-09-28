import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getActiveAppleSubscriptions, getRevenueCatAppleSubscriptions } from '../revenueCatApi';

const purchased = {
  store: 'app_store',
  expires_date: '2026-10-26T14:48:13Z',
  refunded_at: null,
  ownership_type: 'PURCHASED',
};

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