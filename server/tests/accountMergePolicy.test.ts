import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAccountMergeDirection, verifyHistoricalFreeBilling } from '../accountMergePolicy';

test('every tier pairing is independent of account selection order', () => {
  for (const a of ['free_tier', 'player_pro', 'commissioner', 'secondary_commissioner']) {
    for (const b of ['free_tier', 'player_pro', 'commissioner', 'secondary_commissioner']) {
      const result = selectAccountMergeDirection({ id: 'a', role: a }, { id: 'b', role: b });
      assert.equal(result.policy.kind, a !== 'free_tier' && b !== 'free_tier' ? 'billing_duplicate' :
        a !== 'free_tier' || b !== 'free_tier' ? 'keep_paid' : 'free_free');
      assert.equal(result.survivorId, a !== 'free_tier' && b === 'free_tier' ? 'a' : 'b');
    }
  }
  assert.equal(selectAccountMergeDirection({ id: 'a', role: 'free_tier', is_primary_commissioner: true },
    { id: 'b', role: 'free_tier' }).survivorId, 'a');
});

test('historical Stripe identifiers do not constitute an active paid tier', async () => {
  const states = [{ id: 'canceled-sub', status: 'canceled', customer: 'fixture-customer' }];
  const factory = () => ({ subscriptions: {
    list: () => ({ async *[Symbol.asyncIterator]() { yield* states; } }),
    retrieve: async () => states[0],
  } }) as any;
  const free = { id: 'free', role: 'free_tier', stripe_customer_id: 'fixture-customer', stripe_subscription_id: 'canceled-sub' };
  assert.equal((await verifyHistoricalFreeBilling(free, false, { stripeFactory: factory })).active, false);
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
    states[0].status = status;
    assert.equal((await verifyHistoricalFreeBilling(free, false, { stripeFactory: factory })).active, true);
  }
  states[0].customer = 'other-customer';
  await assert.rejects(verifyHistoricalFreeBilling(free, false, { stripeFactory: factory }), /ownership/);
});

test('native verification checks canonical ownership, active expiry, and malformed/unavailable responses', async () => {
  const free = { id: 'free-identity', role: 'free_tier', iap_original_transaction_id: 'fixture-original' };
  let expiry: string | null = '2000-01-01T00:00:00Z';
  const urls: string[] = [];
  const fetcher = (async (input: string) => {
    urls.push(input);
    return new Response(JSON.stringify({ subscriber: {
      subscriptions: { fixture: { expires_date: expiry } }, entitlements: {},
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  assert.equal((await verifyHistoricalFreeBilling(free, ['canonical-fixture-customer'], { fetcher })).active, false);
  assert.ok(urls.some(url => url.endsWith('/canonical-fixture-customer')));
  expiry = '2100-01-01T00:00:00Z';
  assert.equal((await verifyHistoricalFreeBilling(free, true, { fetcher })).active, true);
  expiry = null;
  assert.equal((await verifyHistoricalFreeBilling(free, true, { fetcher })).active, true);
  const unavailable = (async () => new Response('{}', { status: 503 })) as typeof fetch;
  await assert.rejects(verifyHistoricalFreeBilling(free, true, { fetcher: unavailable }), /temporarily unavailable/);
  const invalid = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  await assert.rejects(verifyHistoricalFreeBilling(free, true, { fetcher: invalid }), /Invalid native/);
});
