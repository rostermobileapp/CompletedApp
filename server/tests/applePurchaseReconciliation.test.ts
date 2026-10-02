import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileApplePurchaseLinkForUser,
  reconcileOne,
  refreshAppleStripeBaseline,
  type ApplePurchaseLink,
  type AppleReconciliationDependencies,
} from '../applePurchaseReconciliation';
import type { VerifiedAppleSubscription } from '../revenueCatApi';

const USER_ID = 'user-1';
const ORIGINAL = '100000000001';
const PURCHASED = new Date('2025-02-01T00:00:00.000Z');
const NOW = new Date('2026-03-01T00:00:00.000Z');
const FUTURE_EXPIRY = new Date('2026-04-01T00:00:00.000Z');

function makeLink(overrides: Partial<ApplePurchaseLink> = {}): ApplePurchaseLink {
  return {
    user_id: USER_ID,
    customer_id: 'customer-1',
    original_transaction_id: ORIGINAL,
    product_id: 'com.rosterapp.player_pro_monthly',
    original_purchased_at: PURCHASED,
    expires_at: FUTURE_EXPIRY,
    revoked_by_apple: false,
    apple_revocation_reason: null,
    revoked_period_expires_at: null,
    last_apple_signed_at: null,
    last_checked_at: null,
    ...overrides,
  };
}

function subscription(productId: string, expiry = FUTURE_EXPIRY): VerifiedAppleSubscription {
  return {
    productId,
    role: productId.includes('commissioner') ? 'commissioner' : 'player_pro',
    expiresAt: expiry.toISOString(),
    originalPurchasedAt: PURCHASED.toISOString(),
    storeTransactionId: '200000000002',
  };
}

function makeDatabase(options: {
  link?: ApplePurchaseLink;
  role?: string;
  stripeId?: string | null;
  stripeBaselineId?: string | null;
  stripeBaselineRole?: string | null;
  roleBeforeApple?: string | null;
  skipRoleUpdate?: boolean;
} = {}) {
  const link: any = {
    ...makeLink(options.link),
    association_source: 'automatic',
    role_before_apple: options.roleBeforeApple ?? null,
    stripe_role_before_apple: options.stripeBaselineRole ?? null,
    stripe_subscription_id_before_apple: options.stripeBaselineId ?? null,
  };
  const user: any = {
    role: options.role ?? 'free_tier',
    stripe_subscription_id: options.stripeId ?? null,
    iap_original_transaction_id: null,
  };
  const statements: Array<{ sql: string; params: any[] }> = [];
  const client = {
    async query(sql: string, params: any[] = []) {
      statements.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM apple_purchase_links WHERE user_id = $1 FOR UPDATE')) {
        return { rows: [{ ...link }], rowCount: 1 };
      }
      if (sql.includes('FROM users WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ ...user }], rowCount: 1 };
      }
      if (sql.includes('FROM google_iap_claims')) return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE apple_purchase_links AS links')) {
        assert.ok(!sql.includes('expires_at'), 'Stripe updates must refresh expired links too');
        assert.ok(!sql.includes('revoked_by_apple'), 'Stripe updates must refresh refunded links too');
        assert.equal(params[0], USER_ID);
        link.stripe_role_before_apple = user.stripe_subscription_id ? params[1] : null;
        link.stripe_subscription_id_before_apple = user.stripe_subscription_id || null;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE apple_purchase_links') &&
          sql.includes('role_before_apple = $2')) {
        link.role_before_apple = params[1];
        link.stripe_role_before_apple = params[2];
        link.stripe_subscription_id_before_apple = params[3];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE apple_purchase_links') && sql.includes('SET expires_at = $2')) {
        link.expires_at = params[1];
        link.product_id = params[3] ?? link.product_id;
        if (params[2]) {
          link.revoked_by_apple = false;
          link.apple_revocation_reason = null;
          link.revoked_period_expires_at = null;
        }
        link.last_checked_at = NOW;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE apple_purchase_links SET expires_at = NULL')) {
        if (new Date(link.expires_at) <= NOW) link.expires_at = null;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE users SET role = $3')) {
        if (options.skipRoleUpdate) return { rows: [], rowCount: 0 };
        const activeRolePredicate = sql.includes("role IN ('free_tier', 'player_pro', 'commissioner')");
        const expiryRolePredicate = sql.includes("role IN ('player_pro', 'commissioner')");
        const eligibleRole = activeRolePredicate
          ? ['free_tier', 'player_pro', 'commissioner'].includes(user.role)
          : expiryRolePredicate && ['player_pro', 'commissioner'].includes(user.role);
        const stripePredicatePasses = sql.includes('NULLIF(stripe_subscription_id, \'\') IS NULL')
          ? params[3] === true || user.stripe_subscription_id == null || user.stripe_subscription_id === ''
          : params[3] === true || user.stripe_subscription_id == null;
        const iapPredicatePasses = user.iap_original_transaction_id == null ||
          user.iap_original_transaction_id === params[1] || params[4] === true;
        if (!eligibleRole || !stripePredicatePasses || !iapPredicatePasses) {
          return { rows: [], rowCount: 0 };
        }
        user.role = params[2];
        if (sql.includes('THEN $2 ELSE iap_original_transaction_id')) {
          user.iap_original_transaction_id = params[1];
        } else if (user.iap_original_transaction_id === params[1]) {
          user.iap_original_transaction_id = null;
        }
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in test double: ${sql}`);
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async query(sql: string, params: any[] = []) {
      if (sql.includes('UPDATE apple_purchase_links AS links')) return client.query(sql, params);
      statements.push({ sql, params });
      if (sql.includes('FROM apple_purchase_links WHERE user_id = $1')) {
        if (sql.includes('SELECT product_id, expires_at, revoked_by_apple')) {
          return { rows: [{ product_id: link.product_id, expires_at: link.expires_at,
            revoked_by_apple: link.revoked_by_apple }], rowCount: 1 };
        }
        return { rows: [{ ...link }], rowCount: 1 };
      }
      if (sql.includes('SELECT role FROM users')) {
        return { rows: [{ role: user.role }], rowCount: 1 };
      }
      throw new Error(`Unexpected pool SQL in test double: ${sql}`);
    },
  };
  return { link, user, statements, pool };
}

function dependencies(
  database: ReturnType<typeof makeDatabase>,
  options: {
    subscriptions?: VerifiedAppleSubscription[];
    providerFailure?: boolean;
    metadata?: (userId: string, role: string) => Promise<void>;
  } = {},
): AppleReconciliationDependencies {
  return {
    pool: database.pool,
    getSubscriptions: async () => {
      if (options.providerFailure) throw new Error('provider details must not escape');
      return options.subscriptions ?? [subscription('com.rosterapp.player_pro_monthly')];
    },
    updateUserMetadata: options.metadata ?? (async () => {}),
    now: () => NOW,
  };
}

test('active Apple Player Pro reconciles down from Commissioner to the tagged Stripe Player Pro baseline', async () => {
  const db = makeDatabase({
    role: 'commissioner',
    stripeId: 'sub_verified',
    stripeBaselineId: 'sub_verified',
    stripeBaselineRole: 'player_pro',
    roleBeforeApple: 'free_tier',
  });
  await reconcileOne(makeLink(), dependencies(db));
  assert.equal(db.user.role, 'player_pro');
  const roleUpdate = db.statements.find(call => call.sql.includes('UPDATE users SET role = $3'))!;
  assert.match(roleUpdate.sql, /NULLIF\(stripe_subscription_id, ''\) IS NULL/);
  assert.equal(roleUpdate.params[2], 'player_pro');
  assert.equal(roleUpdate.params[3], true, 'matched Stripe baseline explicitly permits the lower effective tier');
  assert.ok(db.statements.some(call => call.sql === 'COMMIT'));
});

test('empty Stripe subscription ID permits Player Pro activation and public endpoint returns stored role', async () => {
  const db = makeDatabase({ role: 'free_tier', stripeId: '' });
  const result = await reconcileApplePurchaseLinkForUser(
    USER_ID,
    dependencies(db, { subscriptions: [subscription('com.rosterapp.player_pro_monthly')] }),
  );
  assert.equal(db.user.role, 'player_pro');
  assert.deepEqual(result, {
    role: 'player_pro',
    productId: 'com.rosterapp.player_pro_monthly',
    active: true,
  });
  const roleUpdate = db.statements.find(call => call.sql.includes('UPDATE users SET role = $3'))!;
  assert.match(roleUpdate.sql, /NULLIF\(stripe_subscription_id, ''\) IS NULL/);
  assert.equal(roleUpdate.params[3], false);
});

test('verified purchase whose guarded role UPDATE affects no rows is a 409 and rolls back', async () => {
  const db = makeDatabase({ skipRoleUpdate: true });
  await assert.rejects(
    reconcileOne(makeLink(), dependencies(db)),
    {
      status: 409,
      message: 'Apple purchase was verified, but the account role changed before access could be saved. Refresh and retry, or contact support.',
    },
  );
  assert.ok(db.statements.some(call => call.sql === 'ROLLBACK'));
  assert.ok(!db.statements.some(call => call.sql === 'COMMIT'));
});

test('Apple expiry restores a valid Stripe Player Pro baseline with normalized empty-ID predicate', async () => {
  const expired = new Date('2026-02-01T00:00:00.000Z');
  const db = makeDatabase({
    link: makeLink({ expires_at: expired }),
    role: 'commissioner',
    stripeId: 'sub_verified',
    stripeBaselineId: 'sub_verified',
    stripeBaselineRole: 'player_pro',
    roleBeforeApple: 'free_tier',
  });
  await reconcileOne(makeLink({ expires_at: expired }), dependencies(db, { subscriptions: [] }));
  assert.equal(db.user.role, 'player_pro');
  const roleUpdate = db.statements.find(call => call.sql.includes('UPDATE users SET role = $3'))!;
  assert.match(roleUpdate.sql, /NULLIF\(stripe_subscription_id, ''\) IS NULL/);
  assert.equal(roleUpdate.params[2], 'player_pro');
  assert.ok(db.statements.some(call => call.sql === 'COMMIT'));
});

test('signed Apple refund remains inactive when provider verification is unavailable', async () => {
  const db = makeDatabase({
    link: makeLink({
      revoked_by_apple: true,
      apple_revocation_reason: 'REFUND',
    }),
    role: 'player_pro',
    roleBeforeApple: 'free_tier',
  });
  const result = await reconcileApplePurchaseLinkForUser(
    USER_ID,
    dependencies(db, { providerFailure: true }),
  );
  assert.equal(db.user.role, 'free_tier');
  assert.equal(result?.active, false);
  assert.ok(db.statements.some(call => call.sql === 'COMMIT'));
});

for (const state of ['expired', 'refunded'] as const) {
  for (const tier of ['commissioner', 'player_pro'] as const) {
    test(`same-ID Stripe change to ${tier} after Apple ${state} survives repeated reconciliation`, async () => {
      const db = makeDatabase({
        link: makeLink({
          product_id: 'com.rosterapp.commissioner_monthly',
          expires_at: new Date('2026-02-01T00:00:00Z'),
          revoked_by_apple: state === 'refunded',
          apple_revocation_reason: state === 'refunded' ? 'REFUND' : null,
        }),
        role: tier === 'commissioner' ? 'player_pro' : 'commissioner',
        stripeId: 'sub_verified',
        stripeBaselineId: 'sub_verified',
        stripeBaselineRole: tier === 'commissioner' ? 'player_pro' : 'commissioner',
        roleBeforeApple: 'free_tier',
      });
      const deps = dependencies(db, { subscriptions: [] });
      // Establish the ended Apple period before the later Stripe tier change.
      await reconcileApplePurchaseLinkForUser(USER_ID, deps);
      await refreshAppleStripeBaseline(deps.pool, USER_ID, tier);
      db.user.role = tier; // The verified Stripe webhook's effective role write.
      for (let run = 0; run < 3; run++) {
        const result = await reconcileApplePurchaseLinkForUser(USER_ID, deps);
        assert.equal(db.user.role, tier);
        assert.equal(result?.role, tier);
        assert.equal(result?.active, false);
        assert.equal(db.link.stripe_role_before_apple, tier);
        assert.equal(db.link.stripe_subscription_id_before_apple, 'sub_verified');
      }
    });
  }
}

test('Stripe cancellation invalidates a retained Apple baseline for both NULL and empty IDs', async () => {
  for (const cleared of [null, '']) {
    const db = makeDatabase({
      stripeId: cleared,
      stripeBaselineId: 'sub_verified',
      stripeBaselineRole: 'commissioner',
    });
    await refreshAppleStripeBaseline(dependencies(db).pool, USER_ID, 'free_tier');
    assert.equal(db.link.stripe_role_before_apple, null);
    assert.equal(db.link.stripe_subscription_id_before_apple, null);
  }
});