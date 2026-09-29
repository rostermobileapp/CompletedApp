import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import {
  getActiveAppleSubscriptions,
  getActiveRevenueCatNativeSubscriptions,
} from '../revenueCatApi';
import {
  getRevenueCatWebhookRetryDelaySeconds,
  highestBillingRole,
  isRecognizedRevenueCatLifecycleEvent,
  isNativeRevenueCatPaywallEnabled,
  isPaywallClaimAvailable,
  isRevenueCatWebhookEnvironmentAllowed,
  shouldProcessRevenueCatWebhookEnvironment,
  deriveRevenueCatAppUserId,
  revenueCatWebhookEnqueueOutcome,
  resolveManualRoleBackfill,
  resolveEffectiveBillingRole,
  shouldRetryRevenueCatWebhookForLag,
  verifyRevenueCatWebhookSignature,
} from '../nativeRevenueCatLogic';

test('legacy paid roles backfill only when no known billing source exists', () => {
  assert.equal(resolveManualRoleBackfill({
    currentRole: 'commissioner',
    legacyBaseRole: 'free_tier',
    hasKnownBillingSource: false,
  }), 'commissioner');
  assert.equal(resolveManualRoleBackfill({
    currentRole: 'free_tier',
    legacyBaseRole: 'player_pro',
    hasKnownBillingSource: false,
  }), 'player_pro');
  assert.equal(resolveManualRoleBackfill({
    currentRole: 'commissioner',
    legacyBaseRole: 'player_pro',
    hasKnownBillingSource: true,
  }), 'free_tier');
});

test('RevenueCat grants only recognized, purchased, unrefunded active products', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  const result = getActiveRevenueCatNativeSubscriptions({
    subscriber: {
      subscriptions: {
        'com.rosterapp.player_pro_monthly': {
          store: 'app_store',
          ownership_type: 'PURCHASED',
          expires_date: '2027-02-01T00:00:00.000Z',
        },
        commissioner_yearly: {
          store: 'play_store',
          ownership_type: 'PURCHASED',
          expires_date: '2027-12-01T00:00:00.000Z',
        },
        'com.rosterapp.commissioner_yearly': {
          store: 'app_store',
          ownership_type: 'FAMILY_SHARED',
          expires_date: '2027-12-01T00:00:00.000Z',
        },
        player_pro_yearly: {
          store: 'play_store',
          ownership_type: 'PURCHASED',
          expires_date: '2026-12-31T00:00:00.000Z',
        },
        'com.rosterapp.commissioner_monthly': {
          store: 'app_store',
          ownership_type: 'PURCHASED',
          refunded_at: '2026-12-30T00:00:00.000Z',
          expires_date: '2027-02-01T00:00:00.000Z',
        },
        unknown_subscription: {
          store: 'app_store',
          ownership_type: 'PURCHASED',
          expires_date: '2027-12-01T00:00:00.000Z',
        },
      },
    },
  }, now);

  assert.deepEqual(result.map(({ productId, role, store }) => ({ productId, role, store })), [
    { productId: 'com.rosterapp.player_pro_monthly', role: 'player_pro', store: 'app_store' },
    { productId: 'commissioner_yearly', role: 'commissioner', store: 'play_store' },
  ]);
});

test('RevenueCat Apple link snapshots exclude sandbox and unknown environments in production', () => {
  const response = {
    subscriber: {
      subscriptions: {
        'com.rosterapp.player_pro_monthly': {
          store: 'app_store',
          is_sandbox: true,
          ownership_type: 'PURCHASED',
          expires_date: '2027-02-01T00:00:00.000Z',
          original_purchase_date: '2026-12-01T00:00:00.000Z',
        },
        'com.rosterapp.commissioner_yearly': {
          store: 'app_store',
          ownership_type: 'PURCHASED',
          expires_date: '2027-12-01T00:00:00.000Z',
          original_purchase_date: '2026-12-01T00:00:00.000Z',
        },
      },
    },
  };
  assert.deepEqual(getActiveAppleSubscriptions(response, Date.now(), false), []);
  assert.equal(getActiveAppleSubscriptions(response, Date.now(), true).length, 2);
});

test('production access excludes sandbox and unknown-environment receipts', () => {
  const subscriptions = {
    subscriber: {
      subscriptions: {
        'com.rosterapp.player_pro_monthly': {
          store: 'app_store', ownership_type: 'PURCHASED',
          is_sandbox: true, expires_date: '2027-02-01T00:00:00.000Z',
        },
        commissioner_yearly: {
          store: 'play_store', ownership_type: 'PURCHASED',
          is_sandbox: false, expires_date: '2027-02-01T00:00:00.000Z',
        },
        player_pro_yearly: {
          store: 'play_store', ownership_type: 'PURCHASED',
          expires_date: '2027-02-01T00:00:00.000Z',
        },
      },
    },
  };
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  assert.deepEqual(
    getActiveRevenueCatNativeSubscriptions(subscriptions, now, false).map((item) => item.productId),
    ['commissioner_yearly'],
  );
  assert.equal(getActiveRevenueCatNativeSubscriptions(subscriptions, now, true).length, 3);
});

test('billing role precedence preserves independent commissioner access', () => {
  assert.equal(highestBillingRole('player_pro', 'commissioner'), 'commissioner');
  assert.equal(highestBillingRole('free_tier', 'player_pro'), 'player_pro');
  assert.equal(highestBillingRole('secondary_commissioner', 'player_pro'), 'secondary_commissioner');
});

test('active Stripe Player Pro never overwrites a higher native Commissioner role', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  assert.equal(resolveEffectiveBillingRole({
    manualRole: 'free_tier',
    stripe: { role: 'player_pro', expiresAt: '2027-02-01T00:00:00.000Z' },
    apple: [],
    google: [],
    native: [{ role: 'commissioner', expiresAt: '2027-03-01T00:00:00.000Z' }],
  }, now), 'commissioner');
});

test('expired Apple, Google, Stripe, and native grants do not survive role reconciliation', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  assert.equal(resolveEffectiveBillingRole({
    manualRole: 'free_tier',
    stripe: { role: 'player_pro', expiresAt: '2026-12-31T23:59:59.000Z' },
    apple: [{ role: 'commissioner', expiresAt: '2026-12-31T00:00:00.000Z' }],
    google: [{ role: 'player_pro', expiresAt: '2026-12-30T00:00:00.000Z' }],
    native: [{ role: 'commissioner', expiresAt: '2026-12-29T00:00:00.000Z' }],
  }, now), 'free_tier');
});

test('explicit manual role remains independent of expired subscription sources', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  assert.equal(resolveEffectiveBillingRole({
    manualRole: 'commissioner',
    stripe: { role: 'player_pro', expiresAt: '2026-12-31T23:59:59.000Z' },
    apple: [],
    google: [],
    native: [],
  }, now), 'commissioner');
});

test('purchase webhooks retry when RevenueCat REST has not caught up', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  assert.equal(shouldRetryRevenueCatWebhookForLag(
    'commissioner_yearly', 'INITIAL_PURCHASE', now + 60_000, [], now,
  ), true);
  assert.equal(shouldRetryRevenueCatWebhookForLag(
    'commissioner_yearly', 'INITIAL_PURCHASE', now + 60_000, ['commissioner_yearly'], now,
  ), false);
  assert.equal(shouldRetryRevenueCatWebhookForLag(
    'commissioner_yearly', 'INITIAL_PURCHASE', now - 60_000, [], now,
  ), false);
});

test('RevenueCat webhook HMAC verifies exact raw bytes and rejects tampering or stale timestamps', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  const timestamp = Math.floor(now / 1000);
  const secret = 'provider-generated-production-secret';
  const rawBody = Buffer.from('{"event": { "id": "evt-1" }}', 'utf8');
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest('hex');
  const header = `t=${timestamp},v1=${digest}`;

  assert.equal(verifyRevenueCatWebhookSignature(rawBody, header, secret, now), true);
  assert.equal(
    verifyRevenueCatWebhookSignature(Buffer.from('{"event":{"id":"evt-1"}}'), header, secret, now),
    false,
  );
  assert.equal(verifyRevenueCatWebhookSignature(rawBody, header, secret, now + 301_000), false);
});

test('one signed webhook accepts both environments but production processes only live events', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  const timestamp = Math.floor(now / 1000);
  const secret = 'provider-generated-single-integration-secret';
  for (const environment of ['PRODUCTION', 'SANDBOX']) {
    const body = Buffer.from(JSON.stringify({ event: { id: `evt-${environment}`, environment } }));
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.`, 'utf8').update(body).digest('hex');
    assert.equal(verifyRevenueCatWebhookSignature(
      body, `t=${timestamp},v1=${signature}`, secret, now,
    ), true);
    assert.equal(isRevenueCatWebhookEnvironmentAllowed(environment, 'INITIAL_PURCHASE'), true);
  }
  assert.equal(isRevenueCatWebhookEnvironmentAllowed(undefined, 'TEST'), true);
  assert.equal(isRevenueCatWebhookEnvironmentAllowed(undefined, 'INITIAL_PURCHASE'), false);
  assert.equal(isRevenueCatWebhookEnvironmentAllowed('UNKNOWN', 'INITIAL_PURCHASE'), false);
  assert.equal(shouldProcessRevenueCatWebhookEnvironment('SANDBOX', 'production'), false);
  assert.equal(shouldProcessRevenueCatWebhookEnvironment('SANDBOX', 'development'), true);
  assert.equal(shouldProcessRevenueCatWebhookEnvironment('PRODUCTION', 'production'), true);
  assert.equal(shouldProcessRevenueCatWebhookEnvironment(123, 'production'), false);
});

test('TEST and unknown RevenueCat event types are acknowledged without lifecycle processing', () => {
  assert.equal(isRecognizedRevenueCatLifecycleEvent('TEST'), false);
  assert.equal(isRecognizedRevenueCatLifecycleEvent('FUTURE_EVENT'), false);
  assert.equal(isRecognizedRevenueCatLifecycleEvent('INITIAL_PURCHASE'), true);
});

test('durable RevenueCat inbox treats duplicate IDs idempotently and backs off retries', () => {
  assert.equal(revenueCatWebhookEnqueueOutcome(true), 'queued');
  assert.equal(revenueCatWebhookEnqueueOutcome(false), 'duplicate');
  assert.equal(getRevenueCatWebhookRetryDelaySeconds(1), 5);
  assert.equal(getRevenueCatWebhookRetryDelaySeconds(3), 20);
  assert.equal(getRevenueCatWebhookRetryDelaySeconds(20), 3600);
});

test('canonical identity preserves the existing Android HMAC recipe', () => {
  assert.equal(
    deriveRevenueCatAppUserId('user-123', 'stable-secret'),
    'roster_e26467c96f8b0a1ae7c155f127137bfe815e07ef3fbf95e4ed6e1b1054954d6a',
  );
  assert.equal(
    deriveRevenueCatAppUserId('user-123', 'stable-secret'),
    deriveRevenueCatAppUserId('user-123', 'stable-secret'),
  );
});

test('paywall requires the API key, one webhook signing secret, and explicit flag', () => {
  assert.equal(isNativeRevenueCatPaywallEnabled({}), false);
  assert.equal(isNativeRevenueCatPaywallEnabled({
    NATIVE_PAYWALL_ENABLED: 'true',
    REVENUECAT_API_KEY: 'api-key',
  } as NodeJS.ProcessEnv), false);
  assert.equal(isNativeRevenueCatPaywallEnabled({
    NATIVE_PAYWALL_ENABLED: 'true',
    REVENUECAT_API_KEY: 'api-key',
    REVENUECAT_WEBHOOK_SECRET: 'webhook-key',
  } as NodeJS.ProcessEnv), true);
  assert.equal(isNativeRevenueCatPaywallEnabled({
    NATIVE_PAYWALL_ENABLED: 'true',
    REVENUECAT_API_KEY: 'api-key',
    REVENUECAT_WEBHOOK_SANDBOX_SECRET: 'sandbox-signing-key',
  } as NodeJS.ProcessEnv), false);
});

test('only one live claim per account can reserve the paywall at a time', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  assert.equal(isPaywallClaimAvailable(null, null, now), true);
  assert.equal(isPaywallClaimAvailable(null, '2027-01-01T00:30:00.000Z', now), false);
  assert.equal(isPaywallClaimAvailable(null, '2026-12-31T23:59:59.000Z', now), true);
  assert.equal(isPaywallClaimAvailable('2026-12-31T23:59:59.000Z', null, now), false);
});