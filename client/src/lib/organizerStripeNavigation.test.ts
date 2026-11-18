import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openOrganizerStripeUrl } from './organizerStripeNavigation';

const setupUrl = 'https://connect.stripe.com/setup/s/acct_fixture/one-use-fixture?flow=fixture';
const settingsUrl = 'https://dashboard.stripe.com/settings';

function fixture(userAgent: string, bridge = false) {
  const nativeCalls: [string, boolean][] = [];
  const navigations: string[] = [];
  return {
    nativeCalls, navigations,
    browser: {
      navigator: { userAgent },
      location: { assign: (url: string) => { navigations.push(url); } },
      ...(bridge ? { $agent: {} } : {}),
      natively: {
        openExternalURL: (url: string, external: boolean) => { nativeCalls.push([url, external]); },
      },
    },
  };
}

test('Android and iOS shells open the exact single-use URL once in the system browser', () => {
  for (const ua of ['Mozilla Android Natively/Android', 'Natively/iOS', 'Natively/iPadOS', 'NativelyAndroid']) {
    const { browser, nativeCalls, navigations } = fixture(ua);
    openOrganizerStripeUrl(setupUrl, browser);
    assert.deepEqual(nativeCalls, [[setupUrl, true]]);
    assert.deepEqual(navigations, []);
  }
});

test('native bridge detection covers desktop-mode iPad and nonstandard Android user agents', () => {
  for (const ua of ['Mozilla Macintosh Safari', 'Mozilla Android']) {
    const { browser, nativeCalls, navigations } = fixture(ua, true);
    openOrganizerStripeUrl(settingsUrl, browser);
    assert.deepEqual(nativeCalls, [[settingsUrl, true]]);
    assert.deepEqual(navigations, []);
  }
});

test('web browsers keep normal navigation even when the Natively web SDK is loaded', () => {
  const { browser, nativeCalls, navigations } = fixture('Mozilla Chrome Android');
  openOrganizerStripeUrl(setupUrl, browser);
  assert.deepEqual(nativeCalls, []);
  assert.deepEqual(navigations, [setupUrl]);
});

test('a missing or failed native bridge never falls back to the broken in-app browser', () => {
  const { browser, navigations } = fixture('Natively/Android');
  browser.natively = undefined as any;
  assert.throws(() => openOrganizerStripeUrl(setupUrl, browser), /external browser is not ready/);
  browser.natively = { openExternalURL() { throw new Error(`Sensitive link: ${setupUrl}`); } };
  assert.throws(() => openOrganizerStripeUrl(setupUrl, browser), (error: any) => {
    assert.match(error.message, /Could not open your external browser/);
    assert.ok(!error.message.includes(setupUrl));
    return true;
  });
  assert.deepEqual(navigations, []);
});

test('only trusted Stripe HTTPS destinations can be handed to the browser', () => {
  const { browser, nativeCalls, navigations } = fixture('Natively/iOS');
  for (const url of [
    'not a URL', 'javascript:alert(1)', 'http://connect.stripe.com/setup',
    'https://connect.stripe.com.evil.invalid/setup', 'https://evil.invalid/setup',
    'https://connect.stripe.com@evil.invalid/setup',
    'https://username@connect.stripe.com/setup', 'https://connect.stripe.com:8443/setup',
  ]) assert.throws(() => openOrganizerStripeUrl(url, browser), /invalid page address/);
  assert.deepEqual(nativeCalls, []);
  assert.deepEqual(navigations, []);
});

test('Payments uses the browser handoff for both fresh onboarding and account settings', () => {
  const page = readFileSync(new URL('../pages/PaymentRequests.tsx', import.meta.url), 'utf8');
  assert.match(page, /openOrganizerStripeUrl\(data\.url\)/);
  assert.match(page, /openOrganizerStripeUrl\('https:\/\/dashboard\.stripe\.com\/settings'\)/);
  assert.doesNotMatch(page, /window\.location\.assign/);
  assert.match(page, /usePaymentReturnRefresh\(\(\) => refetchCardSetup\(\)/);
});
