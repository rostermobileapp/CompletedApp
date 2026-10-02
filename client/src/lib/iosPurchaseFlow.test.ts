import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateIosPurchase, type IosPurchaseFlow } from './iosPurchaseFlow';

function fixture() {
  let user: string | undefined = 'test-account-a';
  let customer = 'test-anonymous';
  const events: string[] = [];
  const loginId = 'roster_ios_' + 'a'.repeat(64);
  const flow: IosPurchaseFlow = {
    currentUserId: () => user,
    account: async () => { events.push('account'); return { loginId, userId: user! }; },
    login: async (id) => { events.push('login'); customer = id; },
    customerId: async () => customer,
    purchase: async (productId) => { events.push(`purchase:${productId}`); return { status: 'SUCCESS', packageId: productId }; },
    restore: async () => { events.push('restore'); return { status: 'SUCCESS', customerId: customer }; },
    verify: async (payload) => {
      events.push('verify');
      assert.equal(payload.loginId, loginId);
      if (payload.expectedProductId) assert.match(payload.expectedProductId, /^com\.rosterapp\./);
      return { verified: true, role: 'player_pro' };
    },
    refresh: async () => { events.push('refresh'); },
  };
  return { flow, events, switchUser: (id?: string) => { user = id; }, loginId };
}

for (const product of ['player_pro_monthly', 'player_pro_yearly', 'commissioner_monthly', 'commissioner_yearly']) {
  test(`${product}: associate before checkout; callback is not proof; refresh after verification`, async () => {
    const { flow, events } = fixture();
    await activateIosPurchase(flow, product);
    assert.deepEqual(events, ['account', 'login', `purchase:${product}`, 'verify', 'refresh']);
  });
}

test('restore with documented customer-only callback verifies and refreshes immediately', async () => {
  const { flow, events } = fixture();
  await activateIosPurchase(flow);
  assert.deepEqual(events, ['account', 'login', 'restore', 'verify', 'refresh']);
});

test('provider setup outage prevents checkout', async () => {
  const { flow, events } = fixture();
  flow.account = async () => { throw new Error('Apple verification unavailable'); };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /unavailable/);
  assert.deepEqual(events, []);
});

for (const message of ['Already linked to another account', 'Provider unavailable', 'Subscription expired', 'Subscription refunded']) {
  test(`${message}: no success or refresh; actionable no-repurchase error`, async () => {
    const { flow, events } = fixture();
    flow.verify = async () => { throw new Error(message); };
    await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /Do not purchase again.*Restore purchases/);
    assert.equal(events.includes('refresh'), false);
  });
}

test('Free response is not activation even when bridge callback succeeds', async () => {
  const { flow, events } = fixture();
  flow.verify = async () => ({ verified: true, role: 'free_tier' });
  await assert.rejects(activateIosPurchase(flow), /No active App Store subscription/);
  assert.equal(events.includes('refresh'), false);
});

test('account switch during login stops before checkout', async () => {
  const { flow, events, switchUser } = fixture();
  flow.login = async () => { switchUser('test-account-b'); };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /account changed/);
  assert.deepEqual(events, ['account']);
});

test('server login identity for a different account stops before login', async () => {
  const { flow, events, loginId } = fixture();
  flow.account = async () => ({ loginId, userId: 'test-account-b' });
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /account changed/);
  assert.deepEqual(events, []);
});

test('account switch during purchase never verifies or refreshes the new user', async () => {
  const { flow, events, switchUser } = fixture();
  flow.purchase = async () => { switchUser('test-account-b'); };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /purchasing account/);
  assert.deepEqual(events, ['account', 'login']);
});

test('native identity mismatch prevents checkout', async () => {
  const { flow, events } = fixture();
  flow.customerId = async () => 'test-other-customer';
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), /could not be linked/);
  assert.deepEqual(events, ['account', 'login']);
});

test('cancelled purchase does not verify and releases the operation lock', async () => {
  const { flow, events } = fixture();
  flow.purchase = async () => { throw Object.assign(new Error('Purchase cancelled'), { code: 'PURCHASE_CANCELLED' }); };
  await assert.rejects(activateIosPurchase(flow, 'player_pro_monthly'), { code: 'PURCHASE_CANCELLED' });
  assert.equal(events.includes('verify'), false);
  await activateIosPurchase(flow);
});

test('concurrent operations cannot overwrite the native identity', async () => {
  const { flow } = fixture();
  let release!: () => void;
  flow.restore = () => new Promise<void>((resolve) => { release = resolve; });
  const first = activateIosPurchase(flow);
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(activateIosPurchase(fixture().flow), /operation is in progress/);
  release();
  await first;
});

test('a failed account refresh is exposed instead of reporting activation', async () => {
  const { flow } = fixture();
  flow.refresh = async () => { throw new Error('Could not refresh your account'); };
  await assert.rejects(activateIosPurchase(flow), /Purchase needs verification.*refresh your account/);
});