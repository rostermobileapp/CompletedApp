import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateIosPurchase, type IosPurchaseFlow } from './iosPurchaseFlow';
function fixture() {
  let user = 'account-a';
  let version = 0;
  const events: string[] = [];
  const flow: IosPurchaseFlow = {
    associate: async loginId => ({ loginReportedId: loginId, readBackId: loginId }),
    confirmAssociation: async () => ({ confirmed: true }),
    nativeIdentity: async () => 'test-login',
    currentUserId: () => user, accountVersion: () => version,
    account: async () => { events.push('account'); return { userId: 'account-a', loginId: 'test-login', available: true }; },
    purchase: async product => { events.push('purchase'); return { productIdentifier: product, transactionId: 'apple-transaction' }; },
    restore: async () => { events.push('restore'); return [{ productIdentifier: 'player_pro_monthly', jwsRepresentation: 'signed-apple-proof' }]; },
    verify: async payload => { events.push('verify'); assert.equal(payload.expectedUserId, 'account-a'); assert.equal(payload.loginId, 'test-login'); return { role: 'player_pro' }; },
    refresh: async (id, role) => { events.push('refresh'); assert.equal(id, 'account-a'); assert.equal(role, 'player_pro'); },
  };
  return { flow, events, switchUser() { user = 'account-b'; version++; } };
}
for (const product of ['player_pro_monthly', 'player_pro_yearly', 'commissioner_monthly', 'commissioner_yearly']) {
  test(`${product}: account-associated Apple verification precedes tier refresh`, async () => {
    const { flow, events } = fixture();
    const verify = flow.verify;
    flow.verify = async payload => { assert.equal(payload.expectedProductId, 'com.rosterapp.' + product); return verify(payload); };
    await activateIosPurchase(flow, product);
    assert.deepEqual(events, ['account', 'purchase', 'verify', 'refresh']);
  });
}
test('restore uses the server-derived account for Apple verification', async () => {
  const { flow, events } = fixture();
  await activateIosPurchase(flow);
  assert.deepEqual(events, ['account', 'restore', 'verify', 'refresh']);
});
test('documented proofless purchase callback still requires server verification', async () => {
  const { flow, events } = fixture();
  flow.purchase = async () => ({ productIdentifier: 'player_pro_monthly' });
  await activateIosPurchase(flow, 'player_pro_monthly');
  assert.deepEqual(events, ['account', 'verify', 'refresh']);
});
test('proofless restore cannot report success without verified server tier', async () => {
  const { flow } = fixture();
  flow.restore = async () => [];
  flow.verify = async () => ({ role: 'free_tier' });
  await assert.rejects(activateIosPurchase(flow), /No active/);
});
test('unavailable Apple verifier prevents payment', async () => {
  const { flow, events } = fixture();
  flow.account = async () => ({ userId: 'account-a', available: false });
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /Apple verification is unavailable/);
  assert.deepEqual(events, []);
});
test('unconfirmed native association prevents Apple payment', async () => {
  const { flow, events } = fixture();
  let paymentCalls = 0;
  flow.confirmAssociation = async () => ({ confirmed: false });
  flow.purchase = async product => { paymentCalls++; return { productIdentifier: product }; };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /Checkout was not opened/);
  assert.equal(paymentCalls, 0);
  assert.deepEqual(events, ['account']);
});
test('verified existing-lineage restore does not require callback transaction proof', async () => {
  const { flow, events } = fixture();
  await activateIosPurchase(flow);
  assert.deepEqual(events, ['account', 'restore', 'verify', 'refresh']);
});
for (const stage of ['account', 'purchase', 'verify', 'refresh'] as const) {
  test(`iOS account race at ${stage} prevents subsequent work and success`, async () => {
    const f = fixture();
    const original = f.flow[stage] as (...args: any[]) => Promise<any>;
    (f.flow as any)[stage] = async (...args: any[]) => { const value = await original(...args); f.switchUser(); return value; };
    await assert.rejects(activateIosPurchase(f.flow, 'player_pro_monthly'), /account changed/);
    assert.equal(f.events.length, ['account', 'purchase', 'verify', 'refresh'].indexOf(stage) + 1);
  });
}
for (const error of ['Already linked to another account', 'Apple verification unavailable', 'Subscription refunded']) {
  test(`${error} does not refresh or charge again`, async () => {
    const { flow, events } = fixture();
    flow.verify = async () => { throw new Error(error); };
    await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /Do not purchase again/);
    assert.deepEqual(events, ['account', 'purchase']);
  });
}
test('Free tier is not successful activation', async () => {
  const { flow } = fixture();
  flow.verify = async () => ({ role: 'free_tier' });
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /No active/);
});
test('failed account refresh does not report success', async () => {
  const { flow } = fixture();
  flow.refresh = async () => { throw new Error('Tier refresh failed'); };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /Tier refresh failed/);
});
test('cancellation is preserved and releases the shared lock', async () => {
  const { flow } = fixture();
  flow.purchase = async () => { throw Object.assign(new Error('Cancelled'), { code: 'PURCHASE_CANCELLED' }); };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), { code: 'PURCHASE_CANCELLED' });
  await activateIosPurchase(fixture().flow, 'player_pro_monthly');
});
test('iOS timeout is ambiguous, not an invitation to pay again', async () => {
  const { flow } = fixture();
  flow.purchase = async () => { throw new Error('NATIVELY_TIMEOUT'); };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /Do not purchase again/);
});