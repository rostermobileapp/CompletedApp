import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativePurchaseLoginId, confirmReportedNativeIdentity } from '../nativePurchaseAccount';
const id = nativePurchaseLoginId('account-a', 'android', 'test-only-key');
const original = '$RCAnonymousID:' + 'b'.repeat(32);
test('identities are account- and platform-bound with the existing server namespaces', () => {
  assert.notEqual(id, nativePurchaseLoginId('account-b', 'android', 'test-only-key'));
  assert.notEqual(id, nativePurchaseLoginId('account-a', 'ios', 'test-only-key'));
  assert.match(id, /^roster_[a-f0-9]{64}$/);
});
test('exact current identity is confirmed', () => {
  assert.equal(confirmReportedNativeIdentity(id, original, [id, id]), 'current');
});
test('original anonymous read-back is accepted only when OUR provider record confirms it', () => {
  assert.equal(confirmReportedNativeIdentity(id, original, [original, original]), 'provider-confirmed-original');
  assert.equal(confirmReportedNativeIdentity(id, original, [id, original]), 'provider-confirmed-original');
});
test('permanently anonymous read-back without that relationship fails closed', () => {
  assert.throws(() => confirmReportedNativeIdentity(id, id, [original, original]), { status: 409 });
  assert.throws(() => confirmReportedNativeIdentity(id, '$RCAnonymousID:' + 'c'.repeat(32), [id, original]), { status: 409 });
});
test('a different registered original account is never accepted as a reporting exception', () => {
  const other = nativePurchaseLoginId('account-b', 'android', 'test-only-key');
  assert.throws(() => confirmReportedNativeIdentity(id, other, [other, other]), { status: 409 });
});
for (const malformed of [undefined, null, '', {}, [], 'anonymous', 'x'.repeat(1501)]) {
  test('malformed identity observations are rejected', () => {
    assert.throws(() => confirmReportedNativeIdentity(id, malformed, [id, malformed]), { status: 409 });
  });
}