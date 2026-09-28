import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingApplePurchase, isOlderPeriodRevocation, isLaterVerifiedPeriod } from '../applePurchaseMatch';
import type { VerifiedAppleSubscription } from '../revenueCatApi';

const first = new Date('2026-08-26T14:48:13Z');
const monthly: VerifiedAppleSubscription = {
  productId: 'com.rosterapp.player_pro_monthly',
  role: 'player_pro',
  originalPurchasedAt: first.toISOString(),
  expiresAt: '2026-10-26T14:48:13.000Z',
};

test('renewal or a switch to yearly within the original lineage stays linked', () => {
  assert.equal(matchingApplePurchase([monthly], first), monthly);
  const yearly = { ...monthly, productId: 'com.rosterapp.player_pro_yearly' };
  assert.equal(matchingApplePurchase([yearly], first), yearly);
});

test('a new purchase of the same product and other roles cannot borrow this claim', () => {
  assert.equal(matchingApplePurchase(
    [{ ...monthly, originalPurchasedAt: '2026-09-26T14:48:13.000Z' }], first), undefined);
  assert.equal(matchingApplePurchase(
    [{ ...monthly, role: 'commissioner' }], first), undefined);
  assert.equal(matchingApplePurchase([], first), undefined);
});

test('refund of an older billing period cannot cancel a verified renewal', () => {
  const olderEnd = Date.parse('2026-09-26T14:48:13Z');
  const currentEnd = new Date(monthly.expiresAt);
  assert.equal(isOlderPeriodRevocation(olderEnd, currentEnd), true);
  assert.equal(isOlderPeriodRevocation(currentEnd.getTime(), currentEnd), false);
  assert.equal(isOlderPeriodRevocation(undefined, currentEnd), false);
  assert.equal(isLaterVerifiedPeriod(monthly, new Date(olderEnd)), true);
  assert.equal(isLaterVerifiedPeriod(monthly, currentEnd), false);
  assert.equal(isLaterVerifiedPeriod(undefined, new Date(olderEnd)), false);
});