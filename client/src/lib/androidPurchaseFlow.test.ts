import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateAndroidPurchase, type AndroidPurchaseFlow } from './androidPurchaseFlow';
import { activateIosPurchase, type IosPurchaseFlow } from './iosPurchaseFlow';
function fixture() {
  let user: string | undefined = 'account-a';
  let version = 0;
  const events: string[] = [];
  const products = ['player_pro_monthly', 'player_pro_yearly', 'commissioner_monthly', 'commissioner_yearly'];
  const flow: AndroidPurchaseFlow = {
    associate: async loginId => ({ loginReportedId: loginId, readBackId: loginId }),
    confirmAssociation: async () => ({ confirmed: true }),
    nativeIdentity: async () => 'test-login',
    currentUserId: () => user, accountVersion: () => version,
    account: async () => { events.push('account'); return { userId: 'account-a', loginId: 'test-login', available: true, productIds: products }; },
    purchase: async product => { events.push('purchase'); return { productIdentifier: product, purchaseToken: 'store-proof' }; },
    verify: async payload => { events.push('verify'); assert.equal(payload.expectedUserId, 'account-a'); assert.equal(payload.purchaseToken, 'store-proof'); return { role: payload.productId.startsWith('commissioner') ? 'commissioner' : 'player_pro' }; },
    refresh: async id => { events.push('refresh'); assert.equal(id, 'account-a'); },
  };
  return { flow, events, switchUser(id: string) { user = id; version++; } };
}
for (const product of ['player_pro_monthly', 'player_pro_yearly', 'commissioner_monthly', 'commissioner_yearly']) {
  test(`${product}: Google token verification precedes account tier refresh`, async () => {
    const { flow, events } = fixture();
    assert.equal(await activateAndroidPurchase(flow, product), 'active');
    assert.deepEqual(events, ['account', 'purchase', 'verify', 'refresh']);
  });
}
test('unavailable store verification prevents payment', async () => {
  const { flow, events } = fixture();
  flow.account = async () => ({ userId: 'account-a', available: false, productIds: [] });
  await assert.rejects(activateAndroidPurchase(flow, 'player_pro_monthly'), /Checkout was not opened/);
  assert.deepEqual(events, []);
});
test('wrong server account prevents payment', async () => {
  const { flow, events } = fixture();
  flow.account = async () => ({ userId: 'account-b', available: true, productIds: ['player_pro_monthly'] });
  await assert.rejects(activateAndroidPurchase(flow, 'player_pro_monthly'), /account changed/);
  assert.deepEqual(events, []);
});
for (const stage of ['account', 'purchase', 'verify', 'refresh'] as const) {
  test(`account race during ${stage} stops the next step`, async () => {
    const f = fixture();
    const original = f.flow[stage] as (...args: any[]) => Promise<any>;
    (f.flow as any)[stage] = async (...args: any[]) => { const result = await original(...args); f.switchUser('account-b'); return result; };
    await assert.rejects(activateAndroidPurchase(f.flow, 'player_pro_monthly'), /account changed/);
    assert.equal(f.events.length, ['account', 'purchase', 'verify', 'refresh'].indexOf(stage) + 1);
  });
}
test('switching away and back still aborts payment', async () => {
  const f = fixture();
  const account = f.flow.account;
  f.flow.account = async () => { const value = await account(); f.switchUser('account-b'); f.switchUser('account-a'); return value; };
  await assert.rejects(activateAndroidPurchase(f.flow, 'player_pro_monthly'), /account changed/);
  assert.equal(f.events.includes('purchase'), false);
});
test('documented proofless callback uses server account recovery, not callback entitlement', async () => {
  const { flow, events } = fixture();
  flow.purchase = async () => ({ productIdentifier: 'player_pro_monthly' });
  flow.verify = async payload => { assert.equal(payload.purchaseToken, undefined); assert.equal(payload.loginId, 'test-login'); return { role: 'player_pro' }; };
  assert.equal(await activateAndroidPurchase(flow, 'player_pro_monthly'), 'active');
  assert.deepEqual(events, ['account', 'refresh']);
});
test('Google pending state never shows active or refreshes tier', async () => {
  const { flow, events } = fixture();
  flow.verify = async () => ({ pending: true });
  assert.equal(await activateAndroidPurchase(flow, 'player_pro_monthly'), 'pending');
  assert.equal(events.includes('refresh'), false);
});
for (const role of [undefined, 'free_tier']) {
  test('missing or Free store result cannot report activation', async () => {
    const { flow } = fixture();
    flow.verify = async () => ({ role });
    await assert.rejects(activateAndroidPurchase(flow, 'player_pro_monthly'), /did not activate/);
  });
}
test('ownership conflict does not refresh or retry payment', async () => {
  const { flow, events } = fixture();
  flow.verify = async () => { throw Object.assign(new Error('Purchase belongs to another account'), { status: 409 }); };
  await assert.rejects(activateAndroidPurchase(flow, 'player_pro_monthly'), /another account.*Do not purchase again/);
  assert.deepEqual(events, ['account', 'purchase']);
});
test('refresh failure does not report subscription success', async () => {
  const { flow } = fixture();
  flow.refresh = async () => { throw new Error('Tier did not refresh'); };
  await assert.rejects(activateAndroidPurchase(flow, 'player_pro_monthly'), /Tier did not refresh.*Do not purchase again/);
});
test('simultaneous iOS/Android operations share the same lock', async () => {
  const { flow } = fixture();
  let release!: () => void;
  flow.purchase = async () => { await new Promise<void>(resolve => { release = resolve; }); return { productIdentifier: 'player_pro_monthly', purchaseToken: 'store-proof' }; };
  const first = activateAndroidPurchase(flow, 'player_pro_monthly');
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(activateAndroidPurchase(fixture().flow, 'player_pro_monthly'), /operation is in progress/);
  await assert.rejects(activateIosPurchase({} as IosPurchaseFlow), /operation is in progress/);
  release(); await first;
});
test('cancelled payment retains its code and permits restore', async () => {
  const { flow } = fixture();
  flow.purchase = async () => { throw Object.assign(new Error('Cancelled'), { code: 'PURCHASE_CANCELLED' }); };
  await assert.rejects(activateAndroidPurchase(flow, 'player_pro_monthly'), { code: 'PURCHASE_CANCELLED' });
  await activateAndroidPurchase(fixture().flow, 'player_pro_monthly');
});
test('uncancelled timeout quarantines future operations instead of risking another payment', async () => {
  const { flow } = fixture();
  flow.purchase = async () => { throw new Error('NATIVELY_TIMEOUT'); };
  await assert.rejects(activateAndroidPurchase(flow, 'player_pro_monthly'), /Do not purchase again/);
  await assert.rejects(activateAndroidPurchase(fixture().flow, 'player_pro_monthly'), /Fully close and reopen/);
});