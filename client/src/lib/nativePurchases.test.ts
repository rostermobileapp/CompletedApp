import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { NativelyPurchases } from 'natively';
import {
  PRODUCT_COMMISSIONER,
  PRODUCT_PLAYER_PRO,
  PRODUCT_PLAYER_PRO_YEARLY,
  canPurchaseAndroidProduct,
  getAndroidProducts,
  isAndroidBillingSupported,
  loginNativePurchaseAccount,
  getCurrentNativePurchaseAppUserId,
  ensureCurrentNativePurchaseAccount,
  NativePurchaseLinkError,
  showNativeRevenueCatPaywall,
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

test('native paywall timeout resolves as unconfirmed when an older bridge never calls back', async (t) => {
  mockAndroid(t);
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: { trigger() { /* Older native bridge never returns a paywall callback. */ } },
  });
  const result = await showNativeRevenueCatPaywall(5);
  assert.deepEqual(result, { status: 'TIMEOUT', message: 'timeout' });
});

test('native account diagnostics classify anonymous responses without exposing either ID', async (t) => {
  const window = mockAndroid(t);
  window.$agent = {};
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  t.after(() => {
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
  });
  const loginId = `roster_${'a'.repeat(64)}`;
  const anonymousId = '$RCAnonymousID:private-device-identity-123';
  const actions: string[] = [];
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: {
      trigger(_instance: unknown, _type: unknown, callback: (data: object) => void, action: string) {
        actions.push(action);
        callback({ status: 'SUCCESS', customerId: anonymousId });
      },
    },
  });
  await assert.rejects(loginNativePurchaseAccount(loginId), (error: unknown) => {
    assert.ok(error instanceof NativePurchaseLinkError);
    assert.equal(error.diagnostics.length, 8);
    assert.match(error.diagnostics[3], /Login callback: success, customer anonymous/);
    assert.ok(error.diagnostics.slice(4).every(line => /Read-back: success, customer anonymous/.test(line)));
    assert.ok(!JSON.stringify(error.diagnostics).includes(loginId));
    assert.ok(!JSON.stringify(error.diagnostics).includes(anonymousId));
    assert.equal(error.anonymousCustomerHash, createHash('sha256').update(anonymousId).digest('hex'));
    return true;
  });
  assert.deepEqual(actions, [
    'purchases_login', 'purchases_customerid', 'purchases_customerid',
    'purchases_customerid', 'purchases_customerid',
  ]);
});

test('matching native read-back remains required before account linking succeeds', async (t) => {
  const window = mockAndroid(t);
  window.$agent = {};
  const loginId = `roster_${'b'.repeat(64)}`;
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: {
      trigger(_instance: unknown, _type: unknown, callback: (data: object) => void, action: string) {
        callback({
          status: 'SUCCESS',
          customerId: action === 'purchases_customerid' ? loginId : '$RCAnonymousID:old',
        });
      },
    },
  });
  await loginNativePurchaseAccount(loginId);
});

test('checkout identity fails closed when the bridge only exposes ambiguous customerId', async (t) => {
  const window = mockAndroid(t);
  window.$agent = {};
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: { trigger() { assert.fail('No ambiguous identity method may authorize checkout'); } },
  });
  await assert.rejects(getCurrentNativePurchaseAppUserId(), /cannot verify the current store account/);
});

test('checkout identity requires current appUserID, retries anonymous login once, and rejects mismatches', async (t) => {
  const window = mockAndroid(t);
  window.$agent = {};
  const account = `roster_${'a'.repeat(64)}`;
  const other = `roster_${'b'.repeat(64)}`;
  const proto = NativelyPurchases.prototype as NativelyPurchases & {
    currentAppUserId?: (cb: (data: object) => void) => void;
  };
  const original = proto.currentAppUserId;
  t.after(() => { if (original) proto.currentAppUserId = original; else delete proto.currentAppUserId; });
  let current = '$RCAnonymousID:existing-purchaser';
  let logins = 0;
  proto.currentAppUserId = (cb) => cb({ status: 'SUCCESS', appUserID: current, hasPurchaseHistory: false });
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: {
      trigger(_instance: unknown, _type: unknown, callback: (data: object) => void, action: string) {
        assert.equal(action, 'purchases_login');
        logins++;
        current = account;
        callback({ status: 'SUCCESS', customerId: '$RCAnonymousID:original-not-current' });
      },
    },
  });
  await ensureCurrentNativePurchaseAccount(account);
  assert.equal(logins, 1);
  await ensureCurrentNativePurchaseAccount(account);
  assert.equal(logins, 1);
  current = other;
  await assert.rejects(ensureCurrentNativePurchaseAccount(account), /different purchase account/);
  assert.equal(logins, 1);
  current = '$RCAnonymousID:existing-purchaser';
  proto.currentAppUserId = (cb) => cb({ status: 'SUCCESS', appUserID: current });
  await assert.rejects(ensureCurrentNativePurchaseAccount(account), /may have purchases/);
  assert.equal(logins, 1);
  proto.currentAppUserId = (cb) => cb({ status: 'SUCCESS', appUserID: current, hasPurchaseHistory: false });
  Object.defineProperty(globalThis, 'natively', {
    configurable: true,
    value: { trigger(_instance: unknown, _type: unknown, callback: (data: object) => void) {
      logins++;
      callback({ status: 'SUCCESS', customerId: account });
    } },
  });
  await assert.rejects(ensureCurrentNativePurchaseAccount(account), /did not confirm/);
  assert.equal(logins, 2);
});
