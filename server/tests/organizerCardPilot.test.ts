import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canCollectOrganizerCardPayments, canUseOrganizerCardPilot, ORGANIZER_CARD_PILOT_DISPLAY_IDS } from '../organizerCardPilot';

test('only the founder receives a collection exception without a paid entitlement', () => {
  for (const role of ['free_tier', 'player_pro', 'commissioner']) {
    assert.equal(canCollectOrganizerCardPayments({ displayId: 'U00001', role, feeExempt: true }), true);
  }
  for (const displayId of ['U00002', 'U00003', null]) {
    assert.equal(canCollectOrganizerCardPayments({ displayId, role: 'free_tier', feeExempt: false }), false);
    assert.equal(canCollectOrganizerCardPayments({ displayId, role: 'commissioner', feeExempt: true }), false);
    assert.equal(canCollectOrganizerCardPayments({ displayId, role: 'player_pro', feeExempt: false }), true);
    assert.equal(canCollectOrganizerCardPayments({ displayId, role: 'commissioner', feeExempt: false }), true);
  }
});

test('live card pilot allows precisely the two owner-approved account IDs', () => {
  assert.deepEqual([...ORGANIZER_CARD_PILOT_DISPLAY_IDS], ['U00001', 'U00002']);
  for (const id of ORGANIZER_CARD_PILOT_DISPLAY_IDS) assert.equal(canUseOrganizerCardPilot(true, id), true);
  for (const id of [undefined, null, '', 'U00003', 'U00000', 'u00001', ' U00001', 'U00001 ', 'U000010', 'commissioner', 'admin']) {
    assert.equal(canUseOrganizerCardPilot(true, id), false);
  }
});

test('isolated development fixtures do not gain access to live mode through their display ID', () => {
  assert.equal(canUseOrganizerCardPilot(false, 'dev-player'), true);
  // Runtime and key validation remain separate from the rollout allowlist.
  const service = readFileSync(new URL('../organizerCardPaymentService.ts', import.meta.url), 'utf8');
  assert.match(service, /secretKey\?\.startsWith\("sk_live_"\)/);
  assert.match(service, /secretKey\?\.startsWith\("sk_test_"\)/);
  assert.match(service, /NONPRODUCTION_ISOLATED/);
});

test('server gates card reads, writes, and the actual invoice organizer', () => {
  const routes = readFileSync(new URL('../organizerCardPaymentRoutes.ts', import.meta.url), 'utf8');
  for (const path of [
    '/api/organizer-card-payments/checkout-session',
    '/api/organizer-card-payments/requests/:requestId',
    '/api/organizer-card-payments/scrimmages/:scrimmageId/settings',
    '/api/organizer-card-payments/:paymentId/refund',
  ]) {
    const start = routes.indexOf(`"${path}"`);
    assert.ok(start >= 0, path);
    const end = routes.indexOf('\n  app.', start);
    const handler = routes.slice(start, end < 0 ? undefined : end);
    assert.match(handler, /(?:assert|is)OrganizerCardPilotUser\(/, path);
  }
  const preparation = routes.slice(routes.indexOf('async function preparePaymentAttempt'), routes.indexOf('function matchesPaymentIntent'));
  const guard = preparation.indexOf('canUseOrganizerCardPilot(');
  assert.ok(guard >= 0);
  assert.ok(guard < preparation.indexOf('INSERT INTO public.organizer_card_payments'));
});

test('onboarding uses paid entitlement rather than the collection pilot allowlist', () => {
  const routes = readFileSync(new URL('../organizerCardPaymentRoutes.ts', import.meta.url), 'utf8');
  const start = routes.indexOf('app.post("/api/organizer-card-payments/connect/onboarding"');
  const handler = routes.slice(start, routes.indexOf('\n  app.', start + 1));
  assert.match(handler, /hasOrganizerCardCollectionEntitlement\(userId\)/);
  assert.match(handler, /assertDirectOnboardingEnabled\(\)/);
  assert.doesNotMatch(handler, /assertOrganizerCardPilotUser\(/);
});
