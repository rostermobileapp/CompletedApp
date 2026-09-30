/**
 * Unit tests for Apple App Store Server Notification role-mapping logic.
 *
 * Run with:
 *   npx tsx --test server/tests/appleIapNotifications.test.ts
 *
 * Uses Node.js built-in test runner (Node 18+) — no extra dependencies.
 *
 * Coverage:
 *   ✔ SUBSCRIBED        → grants correct role
 *   ✔ DID_RENEW         → grants correct role
 *   ✔ OFFER_REDEEMED    → grants correct role
 *   ✔ DID_CHANGE_RENEWAL_STATUS → grants correct role (renewal re-enabled)
 *   ✔ EXPIRED           → revokes (free_tier)
 *   ✔ REFUND            → revokes (free_tier)
 *   ✔ REVOKE            → revokes (free_tier)
 *   ✔ GRACE_PERIOD_EXPIRED → revokes (free_tier)
 *   ✔ SUBSCRIBED with already-expired expiresDate → ignored (not re-granted)
 *   ✔ SUBSCRIBED with future expiresDate          → granted
 *   ✔ SUBSCRIBED with no expiresDate              → granted (open-ended)
 *   ✔ SUBSCRIBED with unknown productId           → ignored
 *   ✔ Unknown/TEST_NOTIFICATION                   → ignored, no role change
 *   ✔ All known productIds map to the correct role
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveNotificationAction,
  IAP_PRODUCT_ROLES,
  GRANT_TYPES,
  REVOKE_TYPES,
} from '../appleNotificationHandler.js';

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const PAST = NOW - 1_000;

const COMMISSIONER_PRODUCT = 'com.rosterapp.commissioner_monthly';
const PLAYER_PRO_PRODUCT = 'com.rosterapp.player_pro_monthly';

describe('IAP_PRODUCT_ROLES mapping', () => {
  const cases: Array<[string, 'commissioner' | 'player_pro']> = [
    ['com.rosterapp.commissioner_monthly', 'commissioner'],
    ['com.rosterapp.commissioner_yearly', 'commissioner'],
    ['com.rosterapp.player_pro_monthly', 'player_pro'],
    ['com.rosterapp.player_pro_yearly', 'player_pro'],
  ];

  for (const [productId, expectedRole] of cases) {
    test(`${productId} → ${expectedRole}`, () => {
      assert.equal(IAP_PRODUCT_ROLES[productId], expectedRole);
    });
  }

  test('unknown productId is not in the map', () => {
    assert.equal(IAP_PRODUCT_ROLES['com.rosterapp.unknown_product'], undefined);
  });
});

describe('GRANT_TYPES set', () => {
  const grantTypes = ['SUBSCRIBED', 'DID_RENEW', 'OFFER_REDEEMED', 'DID_CHANGE_RENEWAL_STATUS'];
  for (const t of grantTypes) {
    test(`${t} is a grant type`, () => {
      assert.ok(GRANT_TYPES.has(t), `Expected GRANT_TYPES to contain "${t}"`);
    });
  }
});

describe('REVOKE_TYPES set', () => {
  const revokeTypes = ['EXPIRED', 'REFUND', 'REVOKE', 'GRACE_PERIOD_EXPIRED'];
  for (const t of revokeTypes) {
    test(`${t} is a revoke type`, () => {
      assert.ok(REVOKE_TYPES.has(t), `Expected REVOKE_TYPES to contain "${t}"`);
    });
  }
});

describe('resolveNotificationAction — grant types', () => {
  test('SUBSCRIBED → grants commissioner role for commissioner product', () => {
    const result = resolveNotificationAction('SUBSCRIBED', COMMISSIONER_PRODUCT, FUTURE, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'commissioner' });
  });

  test('SUBSCRIBED → grants player_pro role for player_pro product', () => {
    const result = resolveNotificationAction('SUBSCRIBED', PLAYER_PRO_PRODUCT, FUTURE, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'player_pro' });
  });

  test('DID_RENEW → grants commissioner role', () => {
    const result = resolveNotificationAction('DID_RENEW', COMMISSIONER_PRODUCT, FUTURE, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'commissioner' });
  });

  test('DID_RENEW → grants player_pro role', () => {
    const result = resolveNotificationAction('DID_RENEW', PLAYER_PRO_PRODUCT, FUTURE, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'player_pro' });
  });

  test('OFFER_REDEEMED → grants commissioner role', () => {
    const result = resolveNotificationAction('OFFER_REDEEMED', COMMISSIONER_PRODUCT, FUTURE, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'commissioner' });
  });

  test('DID_CHANGE_RENEWAL_STATUS → grants player_pro role', () => {
    const result = resolveNotificationAction('DID_CHANGE_RENEWAL_STATUS', PLAYER_PRO_PRODUCT, FUTURE, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'player_pro' });
  });

  test('SUBSCRIBED with no expiresDate → granted (open-ended subscription)', () => {
    const result = resolveNotificationAction('SUBSCRIBED', COMMISSIONER_PRODUCT, undefined, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'commissioner' });
  });

  test('SUBSCRIBED with future expiresDate → granted', () => {
    const result = resolveNotificationAction('SUBSCRIBED', COMMISSIONER_PRODUCT, FUTURE, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'commissioner' });
  });

  test('yearly commissioner product → commissioner role', () => {
    const result = resolveNotificationAction(
      'SUBSCRIBED',
      'com.rosterapp.commissioner_yearly',
      FUTURE,
      NOW,
    );
    assert.deepEqual(result, { action: 'grant', role: 'commissioner' });
  });

  test('yearly player_pro product → player_pro role', () => {
    const result = resolveNotificationAction(
      'DID_RENEW',
      'com.rosterapp.player_pro_yearly',
      FUTURE,
      NOW,
    );
    assert.deepEqual(result, { action: 'grant', role: 'player_pro' });
  });
});

describe('resolveNotificationAction — grant type with expired transaction', () => {
  test('SUBSCRIBED but expiresDate in the past → ignored (no role grant)', () => {
    const result = resolveNotificationAction('SUBSCRIBED', COMMISSIONER_PRODUCT, PAST, NOW);
    assert.equal(result.action, 'ignore');
  });

  test('DID_RENEW but expiresDate in the past → ignored', () => {
    const result = resolveNotificationAction('DID_RENEW', PLAYER_PRO_PRODUCT, PAST, NOW);
    assert.equal(result.action, 'ignore');
  });

  test('expiresDate === now (boundary) → granted (boundary is treated as still-active)', () => {
    // The guard uses strict < so "expires exactly now" is not yet considered past.
    // Apple's own expiresDate is a future timestamp; equal-to-now in practice means
    // the subscription renews right now and is still live.
    const result = resolveNotificationAction('SUBSCRIBED', COMMISSIONER_PRODUCT, NOW, NOW);
    assert.deepEqual(result, { action: 'grant', role: 'commissioner' });
  });
});

describe('resolveNotificationAction — grant type with unknown productId', () => {
  test('SUBSCRIBED with unrecognised productId → ignored', () => {
    const result = resolveNotificationAction('SUBSCRIBED', 'com.rosterapp.unknown', FUTURE, NOW);
    assert.equal(result.action, 'ignore');
  });

  test('DID_RENEW with empty productId → ignored', () => {
    const result = resolveNotificationAction('DID_RENEW', '', FUTURE, NOW);
    assert.equal(result.action, 'ignore');
  });
});

describe('resolveNotificationAction — revoke types', () => {
  test('EXPIRED → revoke action (downgrade to free_tier)', () => {
    const result = resolveNotificationAction('EXPIRED', COMMISSIONER_PRODUCT, PAST, NOW);
    assert.deepEqual(result, { action: 'revoke' });
  });

  test('REFUND → revoke action', () => {
    const result = resolveNotificationAction('REFUND', PLAYER_PRO_PRODUCT, undefined, NOW);
    assert.deepEqual(result, { action: 'revoke' });
  });

  test('REVOKE → revoke action', () => {
    const result = resolveNotificationAction('REVOKE', COMMISSIONER_PRODUCT, undefined, NOW);
    assert.deepEqual(result, { action: 'revoke' });
  });

  test('GRACE_PERIOD_EXPIRED → revoke action', () => {
    const result = resolveNotificationAction('GRACE_PERIOD_EXPIRED', PLAYER_PRO_PRODUCT, PAST, NOW);
    assert.deepEqual(result, { action: 'revoke' });
  });

  test('EXPIRED with no productId → still revokes (productId irrelevant for revoke)', () => {
    const result = resolveNotificationAction('EXPIRED', '', undefined, NOW);
    assert.deepEqual(result, { action: 'revoke' });
  });
});

describe('resolveNotificationAction — unhandled/unknown types', () => {
  const unknownTypes = [
    'TEST_NOTIFICATION',
    'CONSUMPTION_REQUEST',
    'PRICE_INCREASE',
    'RENEWAL_EXTENDED',
    'RENEWAL_EXTENSION',
    '',
    'totally_unknown_type',
  ];

  for (const notificationType of unknownTypes) {
    test(`"${notificationType}" → ignored, no role change`, () => {
      const result = resolveNotificationAction(notificationType, COMMISSIONER_PRODUCT, FUTURE, NOW);
      assert.equal(result.action, 'ignore');
    });
  }
});

describe('resolveNotificationAction — return type shape', () => {
  test('grant result has action and role', () => {
    const result = resolveNotificationAction('SUBSCRIBED', COMMISSIONER_PRODUCT, FUTURE, NOW);
    assert.ok('action' in result);
    assert.ok('role' in result);
    assert.equal(result.action, 'grant');
  });

  test('revoke result has only action', () => {
    const result = resolveNotificationAction('EXPIRED', COMMISSIONER_PRODUCT, PAST, NOW);
    assert.equal(result.action, 'revoke');
    assert.ok(!('role' in result));
  });

  test('ignore result has action and reason string', () => {
    const result = resolveNotificationAction('TEST_NOTIFICATION', COMMISSIONER_PRODUCT, FUTURE, NOW);
    assert.equal(result.action, 'ignore');
    assert.ok('reason' in result);
    assert.equal(typeof (result as { reason: string }).reason, 'string');
  });
});
