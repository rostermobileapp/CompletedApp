import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateAndroidRestore, type AndroidRestoreFlow } from './androidRestoreFlow';
function fixture() {
  let user = 'account-a';
  let version = 0;
  const events: string[] = [];
  const flow: AndroidRestoreFlow = {
    associate: async loginId => ({ loginReportedId: loginId, readBackId: loginId }),
    confirmAssociation: async () => ({ confirmed: true }),
    nativeIdentity: async () => 'test-login',
    recover: async () => ({ role: 'free_tier', activeProductIds: [] }),
    currentUserId: () => user, accountVersion: () => version,
    account: async () => ({ userId: 'account-a', loginId: 'test-login', available: true }),
    restore: async () => { events.push('restore'); return { purchases: [{ productIdentifier: 'player_pro_monthly', purchaseToken: 'proof' }], activeProductIds: ['player_pro_monthly'] }; },
    verify: async (token, product, id) => { events.push('verify'); assert.equal(token, 'proof'); assert.equal(product, 'player_pro_monthly'); assert.equal(id, 'account-a'); return { role: 'player_pro' }; },
    refresh: async () => { events.push('refresh'); },
  };
  return { flow, events, switchUser() { user = 'account-b'; version++; } };
}
test('restore associates the account and verifies available Google tokens', async () => {
  const { flow, events } = fixture();
  assert.equal((await activateAndroidRestore(flow)).active, true);
  assert.deepEqual(events, ['restore', 'verify', 'refresh']);
});
test('proofless restore succeeds only after authenticated server recovery', async () => {
  const { flow, events } = fixture();
  flow.restore = async () => ({ purchases: [], activeProductIds: ['player_pro_monthly'] });
  flow.recover = async (loginId, userId) => {
    assert.equal(loginId, 'test-login'); assert.equal(userId, 'account-a');
    return { role: 'player_pro', activeProductIds: ['player_pro_monthly'] };
  };
  assert.equal((await activateAndroidRestore(flow)).active, true);
  assert.deepEqual(events, ['refresh']);
});
test('no subscriptions reports inactive, not a successful restore', async () => {
  const { flow } = fixture();
  flow.restore = async () => ({ purchases: [], activeProductIds: [] });
  assert.equal((await activateAndroidRestore(flow)).active, false);
});
test('ownership conflict never falls back to identity or transfers access', async () => {
  const { flow, events } = fixture();
  flow.verify = async () => { throw Object.assign(new Error('Linked to another account'), { status: 409 }); };
  await assert.rejects(activateAndroidRestore(flow), { status: 409 });
  assert.deepEqual(events, ['restore']);
});
for (const stage of ['restore', 'verify', 'refresh'] as const) {
  test(`account change during ${stage} prevents verified success`, async () => {
    const f = fixture();
    const original = f.flow[stage] as (...args: any[]) => Promise<any>;
    (f.flow as any)[stage] = async (...args: any[]) => { const value = await original(...args); f.switchUser(); return value; };
    await assert.rejects(activateAndroidRestore(f.flow), /account changed/);
  });
}