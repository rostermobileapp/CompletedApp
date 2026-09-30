import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  compareRevenueCatOriginalAnonymousId,
  getActiveAppleSubscriptions,
  getRevenueCatAppleSubscriptions,
} from '../revenueCatApi';

const purchased = {
  store: 'app_store',
  expires_date: '2026-10-26T14:48:13Z',
  original_purchase_date: '2026-08-26T14:48:13Z',
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

test('diagnostic compares only hashed native identity with RevenueCat original ID', async () => {
  const canonical = `roster_${'f'.repeat(64)}`;
  const original = '$RCAnonymousID:private-original-identity';
  const hash = createHash('sha256').update(original).digest('hex');
  const fetcher = async (url: string | URL | Request) => {
    assert.equal(String(url), `https://api.revenuecat.com/v1/subscribers/${canonical}`);
    return new Response(JSON.stringify({ subscriber: { original_app_user_id: original } }), { status: 200 });
  };
  assert.equal(await compareRevenueCatOriginalAnonymousId(canonical, hash, {
    apiKey: 'test-key', fetcher: fetcher as typeof fetch,
  }), 'match');
  assert.equal(await compareRevenueCatOriginalAnonymousId(canonical, '0'.repeat(64), {
    apiKey: 'test-key', fetcher: fetcher as typeof fetch,
  }), 'different');
  assert.equal(await compareRevenueCatOriginalAnonymousId(canonical, hash, {
    apiKey: 'test-key',
    fetcher: async () => new Response(JSON.stringify({ subscriber: {
      original_app_user_id: canonical,
    } }), { status: 200 }),
  }), 'not-anonymous');
  await assert.rejects(compareRevenueCatOriginalAnonymousId(canonical, original, {
    apiKey: 'test-key', fetcher: async () => assert.fail('Unhashed IDs must not reach RevenueCat'),
  }), /Invalid purchase identity diagnostic/);
});