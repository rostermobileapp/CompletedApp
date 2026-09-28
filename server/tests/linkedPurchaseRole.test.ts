import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLinkedPurchaseRole } from '../linkedPurchaseRole';

test('verified Google Play Commissioner is not lowered by a Stripe Player Pro refresh', () => {
  assert.equal(resolveLinkedPurchaseRole('player_pro', { googleCommissioner: true }), 'commissioner');
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