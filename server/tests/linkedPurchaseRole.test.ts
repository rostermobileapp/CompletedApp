import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAppleLinkedRole,
  resolveLinkedPurchaseRole,
  resolveStoreLinkedRole,
} from '../linkedPurchaseRole';
import { IAP_PRODUCT_ROLES } from '../appleNotificationHandler';

test('verified Google Play Commissioner is not lowered by a Stripe Player Pro refresh', () => {
  assert.equal(resolveLinkedPurchaseRole('player_pro', { googleCommissioner: true }), 'commissioner');
  // Restoring a second, lower-tier Play token must not erase the first claim.
  assert.equal(resolveLinkedPurchaseRole('player_pro', { googleCommissioner: true, googlePro: true }), 'commissioner');
});

test('verified Google Play Player Pro remains after Stripe billing ends', () => {
  assert.equal(resolveLinkedPurchaseRole('free_tier', { googlePro: true }), 'player_pro');
});

test('a Stripe Commissioner plan still outranks a verified Google Play Player Pro plan', () => {
  assert.equal(resolveLinkedPurchaseRole('commissioner', { googlePro: true }), 'commissioner');
});

test('without active verified store claims the Stripe or Free tier wins', () => {
  assert.equal(resolveLinkedPurchaseRole('free_tier', {}), 'free_tier');
  assert.equal(resolveLinkedPurchaseRole('player_pro', { googleCommissioner: false }), 'player_pro');
});

test('Apple Commissioner monthly/yearly role outranks Player Pro while active', () => {
  for (const productId of [
    'com.rosterapp.commissioner_monthly',
    'com.rosterapp.commissioner_yearly',
  ]) {
    const role = IAP_PRODUCT_ROLES[productId];
    assert.equal(role, 'commissioner');
    assert.equal(resolveStoreLinkedRole('free_tier', {
      appleRole: role,
      googleRole: 'player_pro',
    }), 'commissioner');
  }
});

test('expired Apple Commissioner downgrades to the remaining Google Player Pro claim', () => {
  assert.equal(resolveStoreLinkedRole('free_tier', { googleRole: 'player_pro' }), 'player_pro');
});

test('expired Apple Commissioner downgrades to Free when no independent store claim remains', () => {
  assert.equal(resolveStoreLinkedRole('free_tier', {}), 'free_tier');
});

test('expired Apple Commissioner restores an independently refreshed Stripe Player Pro role', () => {
  assert.equal(resolveStoreLinkedRole('player_pro', {}), 'player_pro');
});

test('Stripe Commissioner and secondary commissioner are not lowered by store Player Pro', () => {
  assert.equal(resolveStoreLinkedRole('commissioner', { appleRole: 'player_pro' }), 'commissioner');
  assert.equal(resolveStoreLinkedRole('secondary_commissioner', { appleRole: 'player_pro' }), 'secondary_commissioner');
});

test('Google Commissioner remains higher than Apple Player Pro', () => {
  assert.equal(resolveStoreLinkedRole('free_tier', {
    appleRole: 'player_pro',
    googleRole: 'commissioner',
  }), 'commissioner');
});

test('Apple expiry after Stripe and Google sources have ended resolves to Free', () => {
  assert.equal(resolveAppleLinkedRole({
    legacyAppleOwned: true,
    unmanagedRole: 'commissioner',
    stripeRole: 'player_pro',
    stripeSubscriptionIdBeforeApple: 'old-subscription',
    currentStripeSubscriptionId: null,
    googleRole: null,
  }), 'free_tier');
});

test('an untagged paid role is not reused as an unmanaged baseline', () => {
  assert.equal(resolveAppleLinkedRole({ unmanagedRole: 'commissioner' }), 'free_tier');
  assert.equal(resolveAppleLinkedRole({ unmanagedRole: 'player_pro' }), 'free_tier');
});

test('an unmanaged secondary commissioner role remains after Apple expiry', () => {
  assert.equal(resolveAppleLinkedRole({
    unmanagedRole: 'secondary_commissioner',
  }), 'secondary_commissioner');
});

test('Apple expiry while the same Stripe Player Pro subscription remains resolves to Player Pro', () => {
  assert.equal(resolveAppleLinkedRole({
    legacyAppleOwned: true,
    stripeRole: 'player_pro',
    stripeSubscriptionIdBeforeApple: 'active-subscription',
    currentStripeSubscriptionId: 'active-subscription',
  }), 'player_pro');
});

test('Apple Commissioner over Stripe Player Pro does not snapshot current upgraded Commissioner as Stripe baseline', () => {
  const beforeApple = resolveAppleLinkedRole({
    appleRole: 'commissioner',
    stripeRole: 'player_pro',
    stripeSubscriptionIdBeforeApple: 'stripe-pro-sub',
    currentStripeSubscriptionId: 'stripe-pro-sub',
  });
  const afterAppleExpires = resolveAppleLinkedRole({
    stripeRole: 'player_pro',
    stripeSubscriptionIdBeforeApple: 'stripe-pro-sub',
    currentStripeSubscriptionId: 'stripe-pro-sub',
  });
  assert.equal(beforeApple, 'commissioner');
  assert.equal(afterAppleExpires, 'player_pro');
});

test('Google baseline is always live and disappears as soon as its verified claim ends', () => {
  assert.equal(resolveAppleLinkedRole({
    legacyAppleOwned: true,
    unmanagedRole: 'commissioner',
    googleRole: 'player_pro',
  }), 'player_pro');
  assert.equal(resolveAppleLinkedRole({
    legacyAppleOwned: true,
    unmanagedRole: 'commissioner',
    googleRole: null,
  }), 'free_tier');
});