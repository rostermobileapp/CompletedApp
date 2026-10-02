import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_COMMISSIONER,
  PRODUCT_PLAYER_PRO,
  PRODUCT_PLAYER_PRO_YEARLY,
  canPurchaseAndroidProduct,
  getAndroidProducts,
  isAndroidBillingSupported,
  loginIosPurchaseAccount,
  getIosPurchaseCustomerId,
  purchaseProduct,
  restorePurchases,
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

test('iOS uses supported login and customer identity APIs and accepts proofless callbacks', async (t) => {
  const window = mockAndroid(t);
  window.$agent = {};
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Natively/iOS' } });
  let customerId = 'test-anonymous';
  const actions: string[] = [];
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: { trigger(_instance: unknown, _type: unknown, callback: (data: object) => void, action: string, params: { login?: string }) {
      actions.push(action);
      if (action === 'purchases_login') customerId = params.login!;
      if (action === 'purchases_package') callback({ status: 'SUCCESS', packageId: PRODUCT_PLAYER_PRO });
      else callback({ status: 'SUCCESS', customerId });
    } },
  });
  const loginId = 'roster_ios_' + 'a'.repeat(64);
  await loginIosPurchaseAccount(loginId);
  assert.equal(await getIosPurchaseCustomerId(), loginId);
  assert.equal((await purchaseProduct(PRODUCT_PLAYER_PRO)).transactionId, undefined);
  assert.deepEqual(await restorePurchases(), []);
  assert.ok(actions.includes('purchases_login'));
});
