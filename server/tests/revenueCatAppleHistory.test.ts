import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRevenueCatAppleHistoricalTransaction, revenueCatAppleCustomerExists } from '../revenueCatAppleHistory';

const customerId = `roster_ios_${'a'.repeat(64)}`;
const current = '200000000002';
const original = '100000000001';
const subscription = {
  productId: 'com.rosterapp.player_pro_monthly', role: 'player_pro' as const,
  originalPurchasedAt: '2026-09-01T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z',
  storeTransactionId: current,
};
const options = { apiKey: 'fixture-v2-key', projectId: 'proj_fixture' };
const event = (overrides: Record<string, unknown> = {}) => ({
  object: 'customer.event', type: 'PURCHASES_CANCELLATION', body: {
    // The event predates login/webhook setup: querying our named customer, NOT
    // accepting its anonymous alias, is what selects the provider context.
    app_user_id: '$RCAnonymousID:old-context', aliases: ['$RCAnonymousID:old-context'],
    store: 'APP_STORE', environment: 'PRODUCTION', product_id: subscription.productId,
    transaction_id: current, original_transaction_id: original,
    expiration_at_ms: 0, entitlement_ids: ['commissioner'], ...overrides,
  },
});
const list = (items: unknown[], next_page: string | null = null) =>
  new Response(JSON.stringify({ object: 'list', items, next_page }));

test('server-read historical cancellation recovers real original lineage without a webhook or named event author', async () => {
  const result = await getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
    ...options, fetcher: async (url, init) => {
      assert.equal(String(url), `https://api.revenuecat.com/v2/projects/proj_fixture/customers/${customerId}/events?environment=production&limit=100`);
      assert.equal((init?.headers as any).Authorization, 'Bearer fixture-v2-key');
      assert.equal(init?.redirect, 'error');
      return list([event()]);
    },
  });
  assert.deepEqual(result, { originalTransactionId: original, transactionId: current });
});

test('sandbox, other stores/products, family sharing and stale transaction events cannot prove lineage', async () => {
  for (const changes of [
    { environment: 'SANDBOX' }, { store: 'PLAY_STORE' }, { is_family_share: true },
    { product_id: 'com.rosterapp.commissioner_yearly' }, { transaction_id: '300000000003' },
    { original_transaction_id: undefined }, { original_transaction_id: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.equal(await getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
      ...options, fetcher: async () => list([event(changes)]),
    }), undefined);
  }
});

test('latest transaction alone never substitutes for original transaction proof', async () => {
  assert.equal(await getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
    ...options, fetcher: async () => list([event({ original_transaction_id: undefined })]),
  }), undefined);
});

test('pagination finds history on a later page and preserves exact transaction strings', async () => {
  let calls = 0;
  const next = `/v2/projects/proj_fixture/customers/${customerId}/events?starting_after=older`;
  assert.deepEqual(await getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
    ...options, fetcher: async url => {
      calls++;
      if (calls === 1) return list([event({ transaction_id: '300000000003' })], next);
      assert.equal(String(url), `https://api.revenuecat.com${next}`);
      return list([event()]);
    },
  }), { originalTransactionId: original, transactionId: current });
  assert.equal(calls, 2);
});

test('bounded history scan fails closed when pagination is not exhausted', async () => {
  let calls = 0;
  await assert.rejects(getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
    ...options, fetcher: async () => {
      calls++;
      return list([event()], `/v2/projects/proj_fixture/customers/${customerId}/events?starting_after=${calls}`);
    },
  }), { status: 503 });
  assert.equal(calls, 20);
});

test('contradictory originals fail closed instead of choosing an event', async () => {
  await assert.rejects(getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
    ...options, fetcher: async () => list([event(), event({ original_transaction_id: '300000000003' })]),
  }), { status: 409 });
});

test('pagination cannot leak keys across hosts, customers, projects or repeated cursors', async () => {
  for (const next of [
    'https://attacker.example/steal', '/v2/projects/other/customers/other/events',
    `/v2/projects/proj_fixture/customers/other/events`,
    `/v2/projects/proj_fixture/customers/${customerId}/events?environment=production&limit=100`,
  ]) {
    let calls = 0;
    await assert.rejects(getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
      ...options, fetcher: async () => { calls++; return list([event()], next); },
    }), { status: 503 });
    assert.equal(calls, 1);
  }
});

test('provider errors and malformed lists remain failures, not inactive subscriptions or usable proof', async () => {
  for (const response of [new Response('private provider body', { status: 401 }),
    new Response('not JSON'), new Response('{}'), new Response('{"object":"list","items":{}}')]) {
    await assert.rejects(getRevenueCatAppleHistoricalTransaction(customerId, subscription, {
      ...options, fetcher: async () => response,
    }), error => (error as any).status === 503 && !(error as Error).message.includes('private'));
  }
});

test('provider existence probe does not use get-or-create or accept caller-selected anonymous identities', async () => {
  let calls = 0;
  assert.equal(await revenueCatAppleCustomerExists(customerId, {
    ...options, fetcher: async url => {
      calls++; assert.ok(String(url).includes('/v2/')); return new Response('{}', { status: 404 });
    },
  }), false);
  await assert.rejects(revenueCatAppleCustomerExists('$RCAnonymousID:old-context', {
    ...options, fetcher: async () => { assert.fail('must not fetch'); },
  }), { status: 400 });
  assert.equal(calls, 1);
});
