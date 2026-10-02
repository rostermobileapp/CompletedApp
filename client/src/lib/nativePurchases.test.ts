import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_COMMISSIONER,
  PRODUCT_PLAYER_PRO,
  PRODUCT_PLAYER_PRO_YEARLY,
  canPurchaseAndroidProduct,
  getAndroidProducts,
  isAndroidBillingSupported,
  purchaseProduct,
  restorePurchases,
  purchaseProductAndroid,
  associateNativePurchaseAccount,
} from './nativePurchases';
import { isNativelyAndroidApp } from '../hooks/useIosPlatform';

function mockAndroid(t: Parameters<typeof test>[1] extends (t: infer T) => void ? T : never) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldNatively = Object.getOwnPropertyDescriptor(globalThis, 'natively');
  const events = new EventTarget();
  const fakeWindow = {
    $agent: undefined as object | undefined,
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Natively/Android' } });
  t.after(() => {
    for (const [key, descriptor] of [['window', oldWindow], ['navigator', oldNavigator], ['natively', oldNatively]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return fakeWindow;
}

test('Android billing waits for a bridge injected after the page loads', async (t) => {
  const window = mockAndroid(t);
  const pending = isAndroidBillingSupported(100);
  window.$agent = {};
  window.dispatchEvent(new Event('nativelyReady'));
  assert.equal(await pending, true);
});

test('Android billing reports an unsupported bridge after waiting', async (t) => {
  const window = mockAndroid(t);
  assert.equal(await isAndroidBillingSupported(15), false);
  window.$agent = {};
  assert.equal(await isAndroidBillingSupported(15), true);
});

test('native Android variants are detected before bridge injection but a browser is not', (t) => {
  const window = mockAndroid(t);
  for (const ua of ['Natively/Android', 'NativelyAndroid', 'Natively Android']) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: ua } });
    assert.equal(isNativelyAndroidApp(), true);
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Linux; Android 15)' } });
  assert.equal(isNativelyAndroidApp(), false);
  window.$agent = {};
  assert.equal(isNativelyAndroidApp(), true);
});

test('product lookup publishes successful products independently of failed products', async (t) => {
  mockAndroid(t);
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: {
      trigger(_instance: unknown, _type: unknown, callback: (data: object) => void, action: string, params: { packageId: string }) {
        assert.equal(action, 'purchases_price');
        if (params.packageId === PRODUCT_PLAYER_PRO) {
          setTimeout(() => callback({ status: 'SUCCESS', priceString: '$4.99' }), 5);
        } else if (params.packageId === PRODUCT_PLAYER_PRO_YEARLY) {
          callback({ price: 49.99, currencyCode: 'USD' });
        } else if (params.packageId === 'commissioner_yearly') {
          callback({ price: 99.99 });
        } else {
          callback({ status: 'FAILED', error: 'item_unavailable' });
        }
      },
    },
  });
  const published: string[] = [];
  const pending = getAndroidProducts((product) => published.push(product.identifier));
  assert.deepEqual(published, []);
  await Promise.resolve();
  assert.deepEqual(published, [PRODUCT_PLAYER_PRO_YEARLY]);
  const products = await pending;
  assert.deepEqual(products.map((p) => p.identifier), [PRODUCT_PLAYER_PRO, PRODUCT_PLAYER_PRO_YEARLY]);
  assert.deepEqual(published, [PRODUCT_PLAYER_PRO_YEARLY, PRODUCT_PLAYER_PRO]);
  assert.equal(canPurchaseAndroidProduct(Object.fromEntries(products.map((p) => [p.identifier, p.priceString])), PRODUCT_COMMISSIONER, true, [PRODUCT_PLAYER_PRO]), false);
  assert.equal(canPurchaseAndroidProduct(Object.fromEntries(products.map((p) => [p.identifier, p.priceString])), PRODUCT_PLAYER_PRO, true, [PRODUCT_PLAYER_PRO]), true);
  assert.equal(canPurchaseAndroidProduct({ [PRODUCT_PLAYER_PRO]: '$4.99' }, PRODUCT_PLAYER_PRO, true, [PRODUCT_COMMISSIONER]), false);
  assert.equal(canPurchaseAndroidProduct({ [PRODUCT_PLAYER_PRO]: '$4.99' }, PRODUCT_PLAYER_PRO, false, [PRODUCT_PLAYER_PRO]), false);
  assert.equal(canPurchaseAndroidProduct({ [PRODUCT_PLAYER_PRO]: '$4.99' }, PRODUCT_PLAYER_PRO, undefined, undefined), false);
});

test('empty and failed product callbacks cannot enable checkout', async (t) => {
  mockAndroid(t);
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: { trigger(_instance: unknown, _type: unknown, callback: (data: object) => void) {
      callback({ status: 'FAILED', error: 'billing_unavailable' });
    } },
  });
  assert.deepEqual(await getAndroidProducts(), []);
  assert.equal(canPurchaseAndroidProduct({}, PRODUCT_PLAYER_PRO, true, [PRODUCT_PLAYER_PRO]), false);
});

test('documented iOS purchase and restore callbacks need not expose transaction fields', async (t) => {
  const window = mockAndroid(t);
  window.$agent = {};
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Natively/iOS' } });
  const actions: string[] = [];
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: { trigger(_instance: unknown, _type: unknown, callback: (data: object) => void, action: string) {
      actions.push(action);
      callback({ status: 'SUCCESS', customerId: 'test-anonymous' });
    } },
  });
  assert.equal((await purchaseProduct(PRODUCT_PLAYER_PRO)).productIdentifier, PRODUCT_PLAYER_PRO);
  assert.deepEqual(await restorePurchases(), []);
  assert.deepEqual(actions, ['purchases_package', 'purchases_restore']);
});

test('Android anonymous or original reporting identity neither authorizes nor blocks the store transaction', async t => {
  const window = mockAndroid(t);
  window.$agent = {};
  const original = '$RCAnonymousID:' + 'b'.repeat(32);
  const actions: string[] = [];
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: { trigger(_instance: unknown, _type: unknown, callback: (data: object) => void, action: string) {
      actions.push(action);
      assert.equal(action, 'purchases_package');
      callback({ status: 'SUCCESS', customerId: original, packageId: PRODUCT_PLAYER_PRO, purchaseToken: 'fixture-google-proof' });
    } },
  });
  assert.equal((await purchaseProductAndroid(PRODUCT_PLAYER_PRO)).purchaseToken, 'fixture-google-proof');
  assert.deepEqual(actions, ['purchases_package']);
});

test('Android proofless success has no token and cannot authorize activation', async t => {
  mockAndroid(t);
  Object.defineProperty(globalThis, 'natively', { configurable: true, value: {
    trigger(_instance: unknown, _type: unknown, callback: (data: object) => void) {
      callback({ status: 'SUCCESS', packageId: PRODUCT_PLAYER_PRO });
    },
  } });
  assert.deepEqual(await purchaseProductAndroid(PRODUCT_PLAYER_PRO), { productIdentifier: PRODUCT_PLAYER_PRO });
});

test('documented CANCELLED callback preserves cancellation code', async t => {
  mockAndroid(t);
  Object.defineProperty(globalThis, 'natively', { configurable: true, value: {
    trigger(_instance: unknown, _type: unknown, callback: (data: object) => void) { callback({ status: 'CANCELLED' }); },
  } });
  await assert.rejects(purchaseProductAndroid(PRODUCT_PLAYER_PRO), { code: 'PURCHASE_CANCELLED' });
  await assert.rejects(purchaseProduct(PRODUCT_PLAYER_PRO), { code: 'PURCHASE_CANCELLED' });
});

test('bridge login sends the server identity but preserves an original anonymous observation for server confirmation', async t => {
  mockAndroid(t);
  const loginId = 'roster_' + 'a'.repeat(64);
  const original = '$RCAnonymousID:' + 'b'.repeat(32);
  const actions: string[] = [];
  Object.defineProperty(globalThis, 'natively', { configurable: true, value: {
    trigger(_instance: unknown, _version: unknown, cb: (data: object) => void, action: string, params: any) {
      actions.push(action);
      if (action === 'purchases_login') assert.equal(params.login, loginId);
      cb({ status: 'SUCCESS', customerId: original });
    },
  } });
  assert.deepEqual(await associateNativePurchaseAccount(loginId), { loginReportedId: original, readBackId: original });
  assert.deepEqual(actions, ['purchases_login', 'purchases_customerid']);
});

for (const response of [{ status: 'FAILED' }, { status: 'SUCCESS' }, { status: 'SUCCESS', customerId: {} }, null]) {
  test('malformed or failed login never requests a purchase', async t => {
    mockAndroid(t);
    const actions: string[] = [];
    Object.defineProperty(globalThis, 'natively', { configurable: true, value: {
      trigger(_instance: unknown, _version: unknown, cb: (data: object | null) => void, action: string) {
        actions.push(action); cb(response);
      },
    } });
    await assert.rejects(associateNativePurchaseAccount('roster_' + 'a'.repeat(64)), /could not link/);
    assert.deepEqual(actions, ['purchases_login']);
  });
}

test('successful current-ID login gets bounded read-only retries for delayed native read-back', async t => {
  mockAndroid(t);
  const loginId = 'roster_' + 'a'.repeat(64);
  let reads = 0, logins = 0;
  const oldTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', ((cb: any, ms: number) => oldTimeout(cb, ms <= 450 ? 0 : ms)) as any);
  Object.defineProperty(globalThis, 'natively', { configurable: true, value: {
    trigger(_instance: unknown, _version: unknown, cb: (data: object) => void, action: string) {
      if (action === 'purchases_login') { logins++; cb({ status: 'SUCCESS', customerId: loginId }); }
      else cb({ status: 'SUCCESS', customerId: ++reads < 3 ? '$RCAnonymousID:' + 'b'.repeat(32) : loginId });
    },
  } });
  assert.equal((await associateNativePurchaseAccount(loginId)).readBackId, loginId);
  assert.equal(logins, 1); assert.equal(reads, 3);
});

test('a SUCCESS-shaped callback accompanied by a native error does not confirm login or expose the error payload', async t => {
  mockAndroid(t);
  const loginId = 'roster_' + 'a'.repeat(64);
  Object.defineProperty(globalThis, 'natively', { configurable: true, value: {
    trigger(_instance: unknown, _version: unknown, cb: (data: object, error?: object) => void) {
      cb({ status: 'SUCCESS', customerId: loginId }, { message: 'private provider payload' });
    },
  } });
  await assert.rejects(associateNativePurchaseAccount(loginId),
    error => error instanceof Error && /reported an error/.test(error.message) && !error.message.includes('private provider'));
});

test('malformed purchase callback with a token is not purchase completion', async t => {
  mockAndroid(t);
  Object.defineProperty(globalThis, 'natively', { configurable: true, value: {
    trigger(_instance: unknown, _type: unknown, callback: (data: object) => void) { callback({ purchaseToken: 'unverified-proof' }); },
  } });
  await assert.rejects(purchaseProductAndroid(PRODUCT_PLAYER_PRO), /did not confirm purchase completion/);
});

test('an unresponsive real JavaScript wrapper rejects on its bounded timeout', async t => {
  mockAndroid(t);
  Object.defineProperty(globalThis, 'natively', { configurable: true, value: { trigger() {} } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = purchaseProductAndroid(PRODUCT_PLAYER_PRO);
  const rejection = assert.rejects(pending, /NATIVELY_TIMEOUT/);
  t.mock.timers.tick(60_000);
  await rejection;
});
