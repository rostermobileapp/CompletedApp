import { test } from 'node:test';
import assert from 'node:assert/strict';
import { associateBillingAccount, type NativeAssociationFlow } from './nativeAccountAssociation';
const id = 'fixture-server-id';
const original = '$RCAnonymousID:' + 'b'.repeat(32);
function fixture() {
  let current = original;
  const flow: NativeAssociationFlow = {
    associate: async () => ({ loginReportedId: original, readBackId: original }),
    confirmAssociation: async payload => {
      assert.equal(payload.loginId, id); assert.equal(payload.expectedUserId, 'account-a');
      assert.equal(payload.readBackId, original); return { confirmed: true };
    },
    nativeIdentity: async () => current,
  };
  return { flow, changeNative(value: string) { current = value; } };
}
test('original-vs-current observations require backend confirmation, not client equality', async () => {
  const { flow } = fixture();
  const check = await associateBillingAccount(flow, id, 'account-a', () => {});
  await check();
});
test('unconfirmed anonymous identity blocks before checkout', async () => {
  const { flow } = fixture(); flow.confirmAssociation = async () => ({ confirmed: false });
  await assert.rejects(associateBillingAccount(flow, id, 'account-a', () => {}), /Checkout was not opened/);
});
test('provider outage does not authorize the anonymous observation', async () => {
  const { flow } = fixture(); flow.confirmAssociation = async () => { throw new Error('Provider unavailable'); };
  await assert.rejects(associateBillingAccount(flow, id, 'account-a', () => {}), /Provider unavailable/);
});
test('changed native identity fails across later operation stages', async () => {
  const f = fixture(); const check = await associateBillingAccount(f.flow, id, 'account-a', () => {});
  f.changeNative('$RCAnonymousID:' + 'c'.repeat(32));
  await assert.rejects(check(), /native purchase account changed/);
});
test('account switches while login and confirmation are pending are checked', async () => {
  for (const stage of ['associate', 'confirmAssociation'] as const) {
    const f = fixture(); let changed = false; const original = f.flow[stage];
    (f.flow as any)[stage] = async (...args: any[]) => { const result = await (original as any)(...args); changed = true; return result; };
    await assert.rejects(associateBillingAccount(f.flow, id, 'account-a', () => {
      if (changed) throw new Error('Account changed');
    }), /Account changed/);
  }
});
test('known active store plans block another checkout, but not restore', async () => {
  const { flow } = fixture();
  flow.confirmAssociation = async () => ({ confirmed: true, activeProductIds: ['player_pro_monthly'] });
  await assert.rejects(associateBillingAccount(flow, id, 'account-a', () => {}, 'commissioner_monthly'), { code: 'PURCHASE_ALREADY_OWNED' });
  const restoreCheck = await associateBillingAccount(flow, id, 'account-a', () => {});
  await restoreCheck();
});