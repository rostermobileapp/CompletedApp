import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canPresentNativePaywall,
  hasCanonicalNativePurchaseIdentity,
  nativePaywallHasSuccessfulPurchase,
  wasNativePaywallPresented,
} from './nativePaywall';

const accountId = `roster_${'a'.repeat(64)}`;

test('paywall status requires server enablement, eligibility, unshown state, and opaque account ID', () => {
  const eligible = {
    enabled: true,
    eligible: true,
    shown: false,
    loginId: accountId,
  };
  assert.equal(canPresentNativePaywall(eligible), true);
  assert.equal(canPresentNativePaywall({ ...eligible, enabled: false }), false);
  assert.equal(canPresentNativePaywall({ ...eligible, eligible: false }), false);
  assert.equal(canPresentNativePaywall({ ...eligible, shown: true }), false);
  assert.equal(canPresentNativePaywall({ ...eligible, loginId: 'sequential-roster-user-id' }), false);
  assert.equal(canPresentNativePaywall({ ...eligible, loginId: undefined }), false);
  assert.equal(canPresentNativePaywall(null), false);
});

test('startup sync accepts only an already-canonical native customer and never migrates anonymous IDs', () => {
  assert.equal(hasCanonicalNativePurchaseIdentity(accountId, accountId), true);
  assert.equal(hasCanonicalNativePurchaseIdentity(accountId, '$RCAnonymousID:legacy'), false);
  assert.equal(hasCanonicalNativePurchaseIdentity(accountId, `roster_${'b'.repeat(64)}`), false);
  assert.equal(hasCanonicalNativePurchaseIdentity('sequential-user-id', 'sequential-user-id'), false);
});

test('purchase and restore callbacks confirm presentation and request server reconciliation', () => {
  for (const message of ['purchased', 'restored']) {
    const result = { status: 'SUCCESS', message };
    assert.equal(wasNativePaywallPresented(result), true);
    assert.equal(nativePaywallHasSuccessfulPurchase(result), true);
  }
});

test('cancelled/dismissed paywalls count as shown but never as purchases', () => {
  assert.equal(wasNativePaywallPresented({ status: 'FAILED', message: 'cancelled' }), true);
  assert.equal(nativePaywallHasSuccessfulPurchase({ status: 'FAILED', message: 'cancelled' }), false);
});

test('not-presented and error callbacks neither count as shown nor trigger sync', () => {
  for (const result of [
    { status: 'TIMEOUT', message: 'timeout' },
    { status: 'SUCCESS', message: 'not_presented' },
    { status: 'FAILED', message: 'error' },
    { status: 'SUCCESS', message: 'error' },
  ]) {
    assert.equal(wasNativePaywallPresented(result), false);
    assert.equal(nativePaywallHasSuccessfulPurchase(result), false);
  }
});