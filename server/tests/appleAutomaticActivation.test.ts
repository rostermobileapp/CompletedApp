import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  activateAppleAutomatically,
  appleRevenueCatLoginId,
  type AutomaticAppleDependencies,
} from '../appleAutomaticActivation';
import type { VerifiedAppleSubscription } from '../revenueCatApi';

const NOW = Date.parse('2026-03-01T00:00:00.000Z');
const ORIGINAL = '100000000001';
const RENEWAL = '200000000002';
const PURCHASED = Date.parse('2025-02-01T00:00:00.000Z');
const EXPIRY = Date.parse('2026-04-01T00:00:00.000Z');
const USER = 'authenticated-user';
const SECRET = 'unit-test-secret';

function subscription(productId: string, expires = EXPIRY): VerifiedAppleSubscription {
  return {
    productId,
    role: productId.includes('commissioner') ? 'commissioner' : 'player_pro',
    expiresAt: new Date(expires).toISOString(),
    originalPurchasedAt: new Date(PURCHASED).toISOString(),
    storeTransactionId: RENEWAL,
  };
}

function dependencies(overrides: Partial<AutomaticAppleDependencies> = {}) {
  const calls: { customer?: string; transaction?: string; claim?: unknown; reconciled?: string } = {};
  const defaults: AutomaticAppleDependencies = {
    getSubscriptions: async customerId => {
      calls.customer = customerId;
      return [subscription('com.rosterapp.player_pro_monthly')];
    },
    lookupTransactionById: async transactionId => {
      calls.transaction = transactionId;
      return {
        payload: {
          bundleId: 'com.rosterapp',
          productId: 'com.rosterapp.player_pro_monthly',
          transactionId: RENEWAL,
          originalTransactionId: ORIGINAL,
          purchaseDate: NOW - 1000,
          originalPurchaseDate: PURCHASED,
          expiresDate: EXPIRY,
          environment: 'Production',
          type: 'Auto-Renewable Subscription',
        },
      };
    },
    claim: async input => { calls.claim = input; },
    reconcileUser: async userId => {
      calls.reconciled = userId;
      return 'player_pro';
    },
  };
  return { calls, deps: { ...defaults, ...overrides } };
}

async function activate(
  deps: AutomaticAppleDependencies,
  productId?: string,
  loginId = appleRevenueCatLoginId(USER, SECRET),
) {
  return activateAppleAutomatically({
    userId: USER,
    loginId,
    expectedProductId: productId,
    secret: SECRET,
    now: NOW,
    dependencies: deps,
  });
}

test('Apple login identity is an opaque, platform-specific HMAC', () => {
  const appleId = appleRevenueCatLoginId(USER, SECRET);
  assert.match(appleId, /^roster_ios_[a-f0-9]{64}$/);
  assert.notEqual(appleId, appleRevenueCatLoginId(USER, `${SECRET}-rotated`));
  assert.notEqual(appleId, `roster_${createHmac('sha256', SECRET)
    .update(`revenuecat-android:${USER}`).digest('hex')}`);
});

for (const productId of [
  'com.rosterapp.player_pro_monthly',
  'com.rosterapp.player_pro_yearly',
  'com.rosterapp.commissioner_monthly',
  'com.rosterapp.commissioner_yearly',
]) {
  test(`verifies active ${productId} via the latest transaction and claims the stable original lineage`, async () => {
    const role = productId.includes('commissioner') ? 'commissioner' : 'player_pro';
    const { calls, deps } = dependencies({
      getSubscriptions: async customerId => {
        calls.customer = customerId;
        return [subscription(productId)];
      },
      lookupTransactionById: async transactionId => {
        calls.transaction = transactionId;
        return {
          payload: {
            bundleId: 'com.rosterapp',
            productId,
            transactionId: RENEWAL,
            originalTransactionId: ORIGINAL,
            purchaseDate: NOW - 1000,
            originalPurchaseDate: PURCHASED,
            expiresDate: EXPIRY,
            environment: 'Production',
            type: 'Auto-Renewable Subscription',
          },
        };
      },
      reconcileUser: async userId => {
        calls.reconciled = userId;
        return role;
      },
    });
    assert.deepEqual(await activate(deps, productId), { role, verified: true });
    assert.equal(calls.transaction, RENEWAL);
    assert.equal(calls.customer, appleRevenueCatLoginId(USER, SECRET));
    assert.equal((calls.claim as any).originalTransactionId, ORIGINAL);
    assert.equal((calls.claim as any).productId, productId);
    assert.equal(calls.reconciled, USER);
  });
}

test('restore without an expected product verifies and selects the active purchase', async () => {
  const { deps } = dependencies();
  assert.deepEqual(await activate(deps), { role: 'player_pro', verified: true });
});

test('uses the original Apple transaction lookup when the latest transaction omits its original purchase date', async () => {
  const lookups: string[] = [];
  const { deps } = dependencies({
    lookupTransactionById: async transactionId => {
      lookups.push(transactionId);
      if (transactionId === RENEWAL) {
        return {
          payload: {
            bundleId: 'com.rosterapp',
            productId: 'com.rosterapp.player_pro_monthly',
            transactionId: RENEWAL,
            originalTransactionId: ORIGINAL,
            purchaseDate: NOW - 1000,
            expiresDate: EXPIRY,
            environment: 'Production',
            type: 'Auto-Renewable Subscription',
          },
        };
      }
      return {
        payload: {
          bundleId: 'com.rosterapp',
          productId: 'com.rosterapp.player_pro_monthly',
          transactionId: ORIGINAL,
          originalTransactionId: ORIGINAL,
          purchaseDate: PURCHASED,
          environment: 'Production',
          type: 'Auto-Renewable Subscription',
        },
      };
    },
  });
  assert.deepEqual(await activate(deps), { role: 'player_pro', verified: true });
  assert.deepEqual(lookups, [RENEWAL, ORIGINAL]);
});

test('a verified Apple Player Pro purchase succeeds when another source already provides Commissioner', async () => {
  const { deps } = dependencies({ reconcileUser: async () => 'commissioner' });
  assert.deepEqual(await activate(deps, 'com.rosterapp.player_pro_monthly'), {
    role: 'commissioner',
    verified: true,
  });
});

test('account switch between login and verification is rejected before any provider lookup', async () => {
  let lookedUp = false;
  const { deps } = dependencies({
    getSubscriptions: async () => { lookedUp = true; return []; },
  });
  await assert.rejects(activate(deps, undefined, 'a-different-login'), { status: 409 });
  assert.equal(lookedUp, false);
});

test('duplicate lineage claim is a safe conflict and never reconciles', async () => {
  let reconciled = false;
  const { deps } = dependencies({
    claim: async () => { throw Object.assign(new Error('claimed'), { status: 409 }); },
    reconcileUser: async () => { reconciled = true; return 'player_pro'; },
  });
  await assert.rejects(activate(deps), { status: 409 });
  assert.equal(reconciled, false);
});

test('an Apple app-account token bound to a different Roster account is rejected', async () => {
  let claimed = false;
  const { deps } = dependencies({
    lookupTransactionById: async () => ({
      payload: {
        bundleId: 'com.rosterapp',
        productId: 'com.rosterapp.player_pro_monthly',
        transactionId: RENEWAL,
        originalTransactionId: ORIGINAL,
        purchaseDate: NOW - 1000,
        originalPurchaseDate: PURCHASED,
        expiresDate: EXPIRY,
        appAccountToken: 'different-account-token',
        environment: 'Production',
        type: 'Auto-Renewable Subscription',
      },
    }),
    claim: async () => { claimed = true; },
  });
  await assert.rejects(activate(deps), { status: 409 });
  assert.equal(claimed, false);
});

test('RevenueCat and Apple lookup outages fail closed with actionable temporary errors', async () => {
  const revenueCat = dependencies({
    getSubscriptions: async () => { throw new Error('private provider details'); },
  });
  await assert.rejects(activate(revenueCat.deps), {
    status: 503,
    message: 'Apple purchase verification is temporarily unavailable. Please try again later.',
  });
  const apple = dependencies({
    lookupTransactionById: async () => { throw new Error('private provider details'); },
  });
  await assert.rejects(activate(apple.deps), {
    status: 503,
    message: 'Apple could not verify this purchase right now. Please try again later.',
  });
});

test('expired, refunded, or mismatched Apple transaction cannot be claimed', async t => {
  for (const [label, mutate] of [
    ['expired', (payload: any) => { payload.expiresDate = NOW - 1; }],
    ['refunded', (payload: any) => { payload.revocationDate = NOW - 1; }],
    ['original purchase date mismatch', (payload: any) => { payload.originalPurchaseDate = PURCHASED + 10_000; }],
  ] as const) {
    await t.test(label, async () => {
      let claimed = false;
      const { deps } = dependencies({
        lookupTransactionById: async () => {
          const payload: any = {
            bundleId: 'com.rosterapp',
            productId: 'com.rosterapp.player_pro_monthly',
            transactionId: RENEWAL,
            originalTransactionId: ORIGINAL,
            purchaseDate: NOW - 1000,
            originalPurchaseDate: PURCHASED,
            expiresDate: EXPIRY,
            environment: 'Production',
            type: 'Auto-Renewable Subscription',
          };
          mutate(payload);
          return { payload };
        },
        claim: async () => { claimed = true; },
      });
      await assert.rejects(activate(deps), { status: 402 });
      assert.equal(claimed, false);
    });
  }
});

test('missing active RevenueCat subscription does not reach Apple or claim', async () => {
  let lookedUp = false;
  const { deps } = dependencies({
    getSubscriptions: async () => [subscription('com.rosterapp.player_pro_monthly', NOW - 1)],
    lookupTransactionById: async () => {
      lookedUp = true;
      throw new Error('must not call');
    },
  });
  await assert.rejects(activate(deps), { status: 402 });
  assert.equal(lookedUp, false);
});