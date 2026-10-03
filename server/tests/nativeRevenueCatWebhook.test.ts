import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeRevenueCatWebhook } from '../nativeRevenueCatWebhook';

const customerId = `roster_ios_${'a'.repeat(64)}`;
const event = {
  type: 'INITIAL_PURCHASE', app_user_id: customerId,
  product_id: 'com.rosterapp.commissioner_monthly',
  store: 'APP_STORE', environment: 'PRODUCTION',
};

function fixture() {
  const calls: unknown[][] = [];
  return {
    calls,
    dependencies: {
      findAppleUser: async (id: string): Promise<string | undefined> => { calls.push(['find', id]); return 'account-a'; },
      syncApple: async (...args: [string, string, unknown?]) => { calls.push(['sync', ...args]); },
    },
  };
}

for (const authorization of ['webhook-secret', 'Bearer webhook-secret']) {
  test(`authorized webhook independently verifies the account (${authorization.startsWith('Bearer') ? 'bearer' : 'raw'})`, async () => {
    const f = fixture();
    const result = await handleNativeRevenueCatWebhook({
      authorization, secret: 'webhook-secret', body: { event },
    }, f.dependencies);
    assert.deepEqual(result, { status: 200, body: { processed: true } });
    assert.deepEqual(f.calls, [['find', customerId], ['sync', 'account-a', customerId, undefined]]);
  });
}

test('a secret already prefixed with Bearer must match exactly', async () => {
  const f = fixture();
  assert.equal((await handleNativeRevenueCatWebhook({
    authorization: 'Bearer webhook-secret', secret: 'Bearer webhook-secret', body: { event },
  }, f.dependencies)).status, 200);
});

for (const authorization of [undefined, '', 'wrong-secret']) {
  test(`unauthorized webhook cannot look up accounts (${String(authorization)})`, async () => {
    const f = fixture();
    const result = await handleNativeRevenueCatWebhook({
      authorization, secret: 'webhook-secret', body: { event },
    }, f.dependencies);
    assert.equal(result.status, 401);
    assert.deepEqual(f.calls, []);
  });
}

test('missing webhook configuration fails closed', async () => {
  const f = fixture();
  assert.equal((await handleNativeRevenueCatWebhook({ authorization: undefined, body: { event } }, f.dependencies)).status, 503);
  assert.deepEqual(f.calls, []);
});

for (const change of [
  { app_user_id: '$RCAnonymousID:anonymous', aliases: [customerId] },
  { app_user_id: 'account-a' },
  { store: 'PLAY_STORE' },
  { environment: 'SANDBOX' },
  { type: 'TEST' },
  { type: 'TRANSFER' },
]) {
  test(`unsupported event never grants (${JSON.stringify(change)})`, async () => {
    const f = fixture();
    const result = await handleNativeRevenueCatWebhook({
      authorization: 'webhook-secret', secret: 'webhook-secret', body: { event: { ...event, ...change } },
    }, f.dependencies);
    assert.equal(result.body.processed, false);
    assert.deepEqual(f.calls, []);
  });
}

test('deleted or unknown account never activates', async () => {
  const f = fixture();
  f.dependencies.findAppleUser = async () => undefined;
  const result = await handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret', body: { event },
  }, f.dependencies);
  assert.equal(result.body.reason, 'account_not_found');
});

for (const status of [402, 409, 503]) {
  test(`verification failure remains a failure (${status})`, async () => {
    const f = fixture();
    f.dependencies.syncApple = async () => { throw Object.assign(new Error('Not verified'), { status }); };
    await assert.rejects(handleNativeRevenueCatWebhook({
      authorization: 'webhook-secret', secret: 'webhook-secret', body: { event },
    }, f.dependencies), { status });
  });
}

test('malformed authorized request is rejected', async () => {
  const f = fixture();
  assert.equal((await handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret', body: {},
  }, f.dependencies)).status, 400);
});

test('a product change syncs current status without selecting a scheduled future plan', async () => {
  const f = fixture();
  await handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret',
    body: { event: { ...event, type: 'PRODUCT_CHANGE',
      product_id: 'com.rosterapp.player_pro_monthly', new_product_id: event.product_id } },
  }, f.dependencies);
  assert.deepEqual(f.calls[1], ['sync', 'account-a', customerId, undefined]);
});

for (const type of ['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']) {
  test(`${type} refreshes current status instead of granting or blindly revoking`, async () => {
    const f = fixture();
    const result = await handleNativeRevenueCatWebhook({
      authorization: 'webhook-secret', secret: 'webhook-secret', body: { event: { ...event, type } },
    }, f.dependencies);
    assert.equal(result.status, 200);
    assert.deepEqual(f.calls, [['find', customerId], ['sync', 'account-a', customerId, undefined]]);
  });
}

test('an authenticated notification passes canonical lineage separately from client fields', async () => {
  const f = fixture();
  await handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret',
    body: { event: { ...event, original_transaction_id: '100000000001', transaction_id: '200000000002' } },
  }, f.dependencies);
  assert.deepEqual(f.calls[1], ['sync', 'account-a', customerId,
    { originalTransactionId: '100000000001', transactionId: '200000000002' }]);
});

test('provider failure during cancellation must remain retryable', async () => {
  const f = fixture();
  f.dependencies.syncApple = async () => { throw Object.assign(new Error('Unavailable'), { status: 503 }); };
  await assert.rejects(handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret', body: { event: { ...event, type: 'CANCELLATION' } },
  }, f.dependencies), { status: 503 });
});

for (const type of ['RENEWAL', 'REFUND_REVERSED', 'SUBSCRIPTION_EXTENDED', 'FUTURE_PROVIDER_EVENT']) {
  test(`${type} syncs current subscriber rather than inferring access from event type`, async () => {
    const f = fixture();
    const result = await handleNativeRevenueCatWebhook({
      authorization: 'webhook-secret', secret: 'webhook-secret',
      body: { event: { ...event, type, entitlement_ids: ['commissioner'], expiration_at_ms: 0 } },
    }, f.dependencies);
    assert.equal(result.body.processed, true);
    assert.deepEqual(f.calls[1], ['sync', 'account-a', customerId, undefined]);
  });
}

test('event product and expiry hints are not required for a current subscriber sync', async () => {
  const f = fixture();
  await handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret',
    body: { event: { type: 'RENEWAL', app_user_id: customerId, store: 'APP_STORE', environment: 'PRODUCTION' } },
  }, f.dependencies);
  assert.deepEqual(f.calls[1], ['sync', 'account-a', customerId, undefined]);
});

test('TRANSFER refreshes named sources and destinations without requiring purchase fields or trusting aliases', async () => {
  const f = fixture();
  const destination = `roster_ios_${'b'.repeat(64)}`;
  await handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret',
    body: { event: { type: 'TRANSFER',
      transferred_from: ['$RCAnonymousID:ignored', customerId],
      transferred_to: [destination, customerId],
      aliases: [`roster_ios_${'c'.repeat(64)}`],
      original_transaction_id: '100000000001', transaction_id: '200000000002' } },
  }, f.dependencies);
  assert.deepEqual(f.calls, [
    ['find', customerId], ['sync', 'account-a', customerId, undefined],
    ['find', destination], ['sync', 'account-a', destination, undefined],
  ]);
});

for (const change of [
  { transferred_from: null }, { transferred_to: [123] },
  { transferred_to: Array(201).fill(customerId) },
]) {
  test(`malformed transfer is rejected (${Object.keys(change).join()})`, async () => {
    const f = fixture();
    const result = await handleNativeRevenueCatWebhook({
      authorization: 'webhook-secret', secret: 'webhook-secret',
      body: { event: { type: 'TRANSFER', transferred_from: [], transferred_to: [customerId], ...change } },
    }, f.dependencies);
    assert.equal(result.status, 400);
    assert.deepEqual(f.calls, []);
  });
}

test('TRANSFER verification failure remains retryable, not acknowledged as a processed grant', async () => {
  const f = fixture();
  f.dependencies.syncApple = async () => { throw Object.assign(new Error('Ownership proof missing'), { status: 202 }); };
  await assert.rejects(handleNativeRevenueCatWebhook({
    authorization: 'webhook-secret', secret: 'webhook-secret',
    body: { event: { type: 'TRANSFER', transferred_from: [], transferred_to: [customerId] } },
  }, f.dependencies), { status: 202 });
});