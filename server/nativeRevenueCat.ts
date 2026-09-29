import { createHash, randomBytes } from 'crypto';
import type { PoolClient } from '@neondatabase/serverless';
import type { Express, RequestHandler } from 'express';
import Stripe from 'stripe';
import { pool } from './db';
import {
  highestBillingRole,
  deriveRevenueCatAppUserId,
  isNativeRevenueCatPaywallEnabled,
  isPaywallClaimAvailable,
  resolveEffectiveBillingRole,
  getRevenueCatWebhookRetryDelaySeconds,
  isRecognizedRevenueCatLifecycleEvent,
  isRevenueCatWebhookEnvironmentAllowed,
  roleValue,
  revenueCatWebhookEnqueueOutcome,
  shouldRetryRevenueCatWebhookForLag,
  verifyRevenueCatWebhookSignature,
  type RevenueCatWebhookSigningKey,
  type BillingRole,
} from './nativeRevenueCatLogic';
import { getRevenueCatNativeSubscriptions, type VerifiedRevenueCatNativeSubscription } from './revenueCatApi';

export {
  highestBillingRole,
  isNativeRevenueCatPaywallEnabled,
  isPaywallClaimAvailable,
} from './nativeRevenueCatLogic';

type RoleSourceUpdate =
  | { source: 'stripe'; role: BillingRole; expiresAt: Date | string | null }
  | { source: 'manual'; role: BillingRole }
  | { source: 'store' | 'reconcile' };

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' })
  : null;

const STRIPE_PRICE_TO_ROLE: Record<string, BillingRole> = {
  [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
  [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
  [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
  [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
};

async function backfillUnattributedManualRoles(userId?: string): Promise<void> {
  const userFilter = userId ? 'AND a.user_id = $1' : '';
  await pool.query(
    `WITH candidates AS (
       SELECT a.user_id,
              CASE
                WHEN u.stripe_customer_id IS NOT NULL OR u.stripe_subscription_id IS NOT NULL
                  OR a.stripe_role IN ('player_pro', 'secondary_commissioner', 'commissioner')
                  OR a.stripe_expires_at IS NOT NULL
                  OR u.iap_original_transaction_id IS NOT NULL
                  OR EXISTS (SELECT 1 FROM apple_purchase_links p WHERE p.user_id = u.id)
                  OR EXISTS (SELECT 1 FROM apple_iap_claims p WHERE p.user_id = u.id)
                  OR EXISTS (SELECT 1 FROM google_iap_claims g WHERE g.user_id = u.id)
                  OR EXISTS (SELECT 1 FROM revenuecat_native_entitlements n WHERE n.user_id = u.id)
                THEN 'free_tier'
                WHEN u.role::text IN ('player_pro', 'secondary_commissioner', 'commissioner')
                  THEN u.role::text
                WHEN a.base_role IN ('player_pro', 'secondary_commissioner', 'commissioner')
                  THEN a.base_role
                ELSE 'free_tier'
              END AS inferred_manual_role
         FROM revenuecat_native_accounts a
         JOIN users u ON u.id = a.user_id
        WHERE (a.manual_role IS NULL OR a.manual_role = 'free_tier')
          ${userFilter}
     )
     UPDATE revenuecat_native_accounts a
        SET manual_role = c.inferred_manual_role
       FROM candidates c
      WHERE a.user_id = c.user_id AND c.inferred_manual_role <> 'free_tier'`,
    userId ? [userId] : [],
  );
}

export async function initNativeRevenueCatDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenuecat_native_accounts (
      user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      app_user_id VARCHAR(100) NOT NULL UNIQUE,
      base_role VARCHAR(32) NOT NULL DEFAULT 'free_tier',
      applied_role VARCHAR(32),
      manual_role VARCHAR(32),
      stripe_role VARCHAR(32),
      stripe_expires_at TIMESTAMPTZ,
      shown_at TIMESTAMPTZ,
      claim_token_hash CHAR(64),
      claim_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE revenuecat_native_accounts
    ADD COLUMN IF NOT EXISTS manual_role VARCHAR(32)`);
  await pool.query(`ALTER TABLE revenuecat_native_accounts
    ADD COLUMN IF NOT EXISTS stripe_role VARCHAR(32)`);
  await pool.query(`ALTER TABLE revenuecat_native_accounts
    ADD COLUMN IF NOT EXISTS stripe_expires_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenuecat_native_entitlements (
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id VARCHAR NOT NULL,
      store VARCHAR NOT NULL CHECK (store IN ('app_store', 'play_store')),
      role VARCHAR(32) NOT NULL CHECK (role IN ('player_pro', 'commissioner')),
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ NOT NULL,
        role_reconciled_at TIMESTAMPTZ,
      PRIMARY KEY (user_id, product_id, store)
    )
  `);
  await pool.query(`ALTER TABLE revenuecat_native_entitlements
    ADD COLUMN IF NOT EXISTS role_reconciled_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apple_iap_claims (
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_transaction_id VARCHAR NOT NULL UNIQUE,
      product_id VARCHAR NOT NULL,
      expires_at TIMESTAMPTZ,
      environment VARCHAR(16),
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, original_transaction_id)
    )
  `);
  await pool.query(`ALTER TABLE apple_iap_claims ADD COLUMN IF NOT EXISTS environment VARCHAR(16)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS apple_iap_claims_expiry_idx ON apple_iap_claims (expires_at)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS apple_purchase_links_expiry_idx ON apple_purchase_links (expires_at)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS google_iap_claims_expiry_user_idx
       ON google_iap_claims (expires_at, user_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS revenuecat_native_accounts_stripe_expiry_idx
       ON revenuecat_native_accounts (stripe_expires_at)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS revenuecat_native_entitlements_expiry_idx
       ON revenuecat_native_entitlements (expires_at)`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenuecat_native_webhook_events (
      event_id VARCHAR(200) PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenuecat_native_webhook_inbox (
      event_id VARCHAR(200) PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      app_user_id VARCHAR(100),
      payload JSONB NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_token VARCHAR(64),
      lease_until TIMESTAMPTZ,
      last_error TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS revenuecat_native_webhook_inbox_claim_idx
      ON revenuecat_native_webhook_inbox (status, available_at, lease_until, received_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS revenuecat_native_webhook_inbox_pending_idx
      ON revenuecat_native_webhook_inbox (available_at, received_at)
      WHERE status = 'pending'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS revenuecat_native_webhook_inbox_lease_idx
      ON revenuecat_native_webhook_inbox (lease_until, received_at)
      WHERE status = 'processing'
  `);

  // Freeze current Android IDs for existing accounts before SESSION_SECRET can
  // rotate. This is the same HMAC recipe previously used by the Android route.
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    let cursor = '';
    while (true) {
      const users = await pool.query(
        `SELECT id FROM users WHERE id > $1 ORDER BY id LIMIT 250`,
        [cursor],
      );
      if (!users.rows.length) break;
      const values: unknown[] = [];
      const tuples = users.rows.map((row: any, index: number) => {
        const userId = row.id as string;
        cursor = userId;
        const appUserId = deriveRevenueCatAppUserId(userId, secret);
        values.push(userId, appUserId);
        const offset = index * 2;
        return `($${offset + 1}, $${offset + 2})`;
      });
      await pool.query(
        `INSERT INTO revenuecat_native_accounts (user_id, app_user_id)
         VALUES ${tuples.join(', ')} ON CONFLICT (user_id) DO NOTHING`,
        values,
      );
    }
  }
  await backfillUnattributedManualRoles();
  await pool.query(
    `UPDATE revenuecat_native_accounts SET manual_role = 'free_tier' WHERE manual_role IS NULL`,
  );
  await pool.query(`ALTER TABLE revenuecat_native_accounts
    ALTER COLUMN manual_role SET DEFAULT 'free_tier'`);
  await pool.query(`ALTER TABLE revenuecat_native_accounts
    ALTER COLUMN manual_role SET NOT NULL`);
}

/**
 * Preserve the exact Android App User ID already issued to legacy purchasers.
 * Once a user has an assigned ID, a later SESSION_SECRET rotation cannot
 * silently rename their RevenueCat customer.
 */
export async function getOrCreateRevenueCatAppUserId(userId: string): Promise<string> {
  const existing = await pool.query(
    'SELECT app_user_id FROM revenuecat_native_accounts WHERE user_id = $1',
    [userId],
  );
  if (existing.rows[0]?.app_user_id) {
    await backfillUnattributedManualRoles(userId);
    return existing.rows[0].app_user_id as string;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw Object.assign(new Error('Account-linked RevenueCat identity is unavailable.'), { status: 503 });
  }
  const appUserId = deriveRevenueCatAppUserId(userId, secret);
  try {
    await pool.query(
      `INSERT INTO revenuecat_native_accounts (user_id, app_user_id)
       VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, appUserId],
    );
  } catch (error: any) {
    if (error?.code === '23505') {
      throw Object.assign(new Error('RevenueCat identity is already assigned to another account.'), { status: 409 });
    }
    throw error;
  }

  const assigned = await pool.query(
    'SELECT app_user_id FROM revenuecat_native_accounts WHERE user_id = $1',
    [userId],
  );
  const canonical = assigned.rows[0]?.app_user_id as string | undefined;
  if (!canonical) throw new Error('RevenueCat account identity could not be persisted.');
  await backfillUnattributedManualRoles(userId);
  return canonical;
}

async function applyRevenueCatSnapshot(
  client: PoolClient,
  userId: string,
  subscriptions: VerifiedRevenueCatNativeSubscription[],
  stripeSourceUpdate?: Extract<RoleSourceUpdate, { source: 'stripe' }>,
): Promise<{ role: BillingRole; active: boolean }> {
  await client.query(
    `UPDATE revenuecat_native_entitlements
        SET expires_at = LEAST(expires_at, NOW()), role_reconciled_at = NULL
      WHERE user_id = $1`,
    [userId],
  );
  for (const subscription of subscriptions) {
    await client.query(
      `INSERT INTO revenuecat_native_entitlements
        (user_id, product_id, store, role, expires_at, verified_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, product_id, store) DO UPDATE
         SET role = EXCLUDED.role, expires_at = EXCLUDED.expires_at,
              verified_at = EXCLUDED.verified_at, role_reconciled_at = NULL`,
      [userId, subscription.productId, subscription.store, subscription.role, subscription.expiresAt],
    );
  }
  const role = await reconcileStoredBillingRole(client, userId, stripeSourceUpdate);
  const active = subscriptions.some((subscription) =>
    Date.parse(subscription.expiresAt) > Date.now());
  return { role, active };
}

async function reconcileStoredBillingRole(
  client: PoolClient,
  userId: string,
  sourceUpdate?: RoleSourceUpdate,
): Promise<BillingRole> {
  const userResult = await client.query(
    `SELECT role FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  const user = userResult.rows[0];
  if (!user) throw Object.assign(new Error('Roster account not found.'), { status: 404 });

  const accountResult = await client.query(
    `SELECT manual_role, stripe_role, stripe_expires_at, applied_role
       FROM revenuecat_native_accounts WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const account = accountResult.rows[0];
  if (!account) {
    const fallbackRole = sourceUpdate?.source === 'stripe' || sourceUpdate?.source === 'manual'
      ? sourceUpdate.role
      : 'free_tier';
    if (roleValue(user.role) !== fallbackRole) {
      await client.query(
        `UPDATE users SET role = $2, last_updated = NOW(), updated_at = NOW() WHERE id = $1`,
        [userId, fallbackRole],
      );
    }
    return fallbackRole;
  }

  let manualRole = roleValue(account.manual_role);
  let stripeRole = roleValue(account.stripe_role);
  let stripeExpiresAt = account.stripe_expires_at as Date | string | null;
  if (sourceUpdate?.source === 'manual') {
    manualRole = sourceUpdate.role;
  } else if (sourceUpdate?.source === 'stripe') {
    if (sourceUpdate.role !== 'free_tier') stripeRole = sourceUpdate.role;
    stripeExpiresAt = sourceUpdate.expiresAt;
  }

  await client.query(
    `UPDATE apple_purchase_links SET expires_at = NULL
      WHERE user_id = $1 AND expires_at <= NOW()`,
    [userId],
  );
  await client.query(
    `UPDATE apple_iap_claims
        SET expires_at = NULL, revoked = TRUE
      WHERE user_id = $1 AND expires_at <= NOW()`,
    [userId],
  );
  await client.query(
    `UPDATE google_iap_claims SET expires_at = NULL
      WHERE user_id = $1 AND expires_at <= NOW()`,
    [userId],
  );
  if (stripeExpiresAt && new Date(stripeExpiresAt).getTime() <= Date.now()) {
    stripeExpiresAt = null;
  }

  const native = await client.query(
    `SELECT role, expires_at FROM revenuecat_native_entitlements
      WHERE user_id = $1 AND expires_at > NOW()`,
    [userId],
  );
  await client.query(
    `UPDATE revenuecat_native_entitlements
        SET role_reconciled_at = NOW()
      WHERE user_id = $1 AND expires_at <= NOW() AND role_reconciled_at IS NULL`,
    [userId],
  );
  const apple = await client.query(
    `SELECT product_id, expires_at FROM apple_purchase_links
      WHERE user_id = $1 AND expires_at > NOW() AND revoked_by_apple = FALSE
        AND (environment = 'Production' OR ($2 <> 'production' AND environment = 'Sandbox'))
        AND product_id IN ('com.rosterapp.player_pro_monthly', 'com.rosterapp.player_pro_yearly',
                           'com.rosterapp.commissioner_monthly', 'com.rosterapp.commissioner_yearly')`,
    [userId, process.env.NODE_ENV ?? ''],
  );
  const appleLegacy = await client.query(
    `SELECT product_id, expires_at FROM apple_iap_claims
      WHERE user_id = $1 AND expires_at > NOW() AND revoked = FALSE
        AND (environment = 'Production' OR ($2 <> 'production' AND environment = 'Sandbox'))
        AND product_id IN ('com.rosterapp.player_pro_monthly', 'com.rosterapp.player_pro_yearly',
                           'com.rosterapp.commissioner_monthly', 'com.rosterapp.commissioner_yearly')`,
    [userId, process.env.NODE_ENV ?? ''],
  );
  const google = await client.query(
    `SELECT product_id, expires_at FROM google_iap_claims
      WHERE user_id = $1 AND expires_at > NOW()
        AND product_id IN ('player_pro_monthly', 'player_pro_yearly',
                           'commissioner_monthly', 'commissioner_yearly')`,
    [userId],
  );

  const effectiveRole = resolveEffectiveBillingRole({
    manualRole,
    stripe: { role: stripeRole, expiresAt: stripeExpiresAt },
    apple: apple.rows.map((row: any) => ({
      role: row.product_id.includes('commissioner') ? 'commissioner' as const : 'player_pro' as const,
      expiresAt: row.expires_at,
    })).concat(appleLegacy.rows.map((row: any) => ({
      role: row.product_id.includes('commissioner') ? 'commissioner' as const : 'player_pro' as const,
      expiresAt: row.expires_at,
    }))),
    google: google.rows.map((row: any) => ({
      role: row.product_id.includes('commissioner') ? 'commissioner' : 'player_pro',
      expiresAt: row.expires_at,
    })),
    native: native.rows.map((row: any) => ({
      role: roleValue(row.role),
      expiresAt: row.expires_at,
    })),
  });

  await client.query(
    `UPDATE revenuecat_native_accounts
        SET manual_role = $2, stripe_role = $3, stripe_expires_at = $4,
            base_role = $2, applied_role = $5, updated_at = NOW()
      WHERE user_id = $1`,
    [userId, manualRole, stripeRole, stripeExpiresAt, effectiveRole],
  );
  if (roleValue(user.role) !== effectiveRole) {
    await client.query(
      `UPDATE users SET role = $2, last_updated = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId, effectiveRole],
    );
  }
  return effectiveRole;
}

async function refreshExpiredStripeRoleSource(userId: string): Promise<Extract<RoleSourceUpdate, { source: 'stripe' }> | undefined> {
  const result = await pool.query(
    `SELECT u.stripe_subscription_id, a.stripe_role, a.stripe_expires_at
       FROM users u
       LEFT JOIN revenuecat_native_accounts a ON a.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row?.stripe_subscription_id) return undefined;
  const expiresAt = row.stripe_expires_at ? new Date(row.stripe_expires_at).getTime() : 0;
  if (row.stripe_role && Number.isFinite(expiresAt) && expiresAt > Date.now()) return undefined;
  if (!stripe) {
    throw Object.assign(new Error('Stripe subscription status is unavailable.'), { status: 503 });
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id as string);
  } catch {
    throw Object.assign(new Error('Stripe subscription status is unavailable.'), { status: 503 });
  }
  const priceId = subscription.items.data[0]?.price?.id;
  const role = !subscription.cancel_at_period_end &&
    (subscription.status === 'active' || subscription.status === 'trialing') && priceId
    ? STRIPE_PRICE_TO_ROLE[priceId] ?? 'free_tier'
    : 'free_tier';
  const periodEnd = Number((subscription as any).current_period_end ??
    (subscription.items.data[0] as any)?.current_period_end);
  const sourceExpiry = role !== 'free_tier' && Number.isFinite(periodEnd) && periodEnd > 0
    ? new Date(periodEnd * 1000)
    : null;
  return { source: 'stripe', role, expiresAt: sourceExpiry };
}

export async function syncRevenueCatNativeEntitlements(
  userId: string,
  appUserId?: string,
): Promise<{ role: BillingRole; active: boolean }> {
  const canonicalId = appUserId ?? await getOrCreateRevenueCatAppUserId(userId);
  if (!/^roster_[a-f0-9]{64}$/.test(canonicalId)) {
    throw Object.assign(new Error('RevenueCat account identity is invalid.'), { status: 400 });
  }
  const mapping = await pool.query(
    'SELECT app_user_id FROM revenuecat_native_accounts WHERE user_id = $1',
    [userId],
  );
  if (mapping.rows[0]?.app_user_id !== canonicalId) {
    throw Object.assign(new Error('RevenueCat account identity does not match the signed-in account.'), { status: 403 });
  }
  const client = await pool.connect();
  let transactionStarted = false;
  let locked = false;
  try {
    // Serialize provider reads for this Roster account. A slower response from
    // an older webhook/request must never overwrite a newer subscriber fetch.
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [userId]);
    locked = true;
    const subscriptions = await getRevenueCatNativeSubscriptions(canonicalId);
    const stripeSource = await refreshExpiredStripeRoleSource(userId);
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await applyRevenueCatSnapshot(client, userId, subscriptions, stripeSource);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [userId]);
    client.release();
  }
}

/** Recalculate the cached role from independent, currently active sources. */
export async function applyStoredRevenueCatRole(
  userId: string,
  sourceUpdate?: RoleSourceUpdate,
): Promise<BillingRole | null> {
  await backfillUnattributedManualRoles(userId);
  const client = await pool.connect();
  let locked = false;
  let transactionStarted = false;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [userId]);
    locked = true;
    await client.query('BEGIN');
    transactionStarted = true;
    const user = await client.query(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (!user.rows[0]) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return null;
    }
    const effectiveRole = await reconcileStoredBillingRole(client, userId, sourceUpdate);
    await client.query('COMMIT');
    transactionStarted = false;
    return effectiveRole;
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [userId]);
    client.release();
  }
}

/** Persist an explicit operator-managed billing role independently of users.role. */
export async function setManualBillingRole(
  userId: string,
  role: BillingRole,
): Promise<BillingRole | null> {
  await getOrCreateRevenueCatAppUserId(userId);
  return applyStoredRevenueCatRole(userId, { source: 'manual', role });
}

export async function reconcileExpiredBillingRoleSources(): Promise<void> {
  const expired = await pool.query(
    `SELECT a.user_id
       FROM revenuecat_native_accounts a
      WHERE EXISTS (
              SELECT 1 FROM revenuecat_native_entitlements n
               WHERE n.user_id = a.user_id AND n.expires_at <= NOW()
            )
         OR EXISTS (
              SELECT 1 FROM apple_purchase_links p
               WHERE p.user_id = a.user_id AND p.expires_at <= NOW()
            )
         OR EXISTS (
              SELECT 1 FROM apple_iap_claims p
               WHERE p.user_id = a.user_id AND p.expires_at <= NOW()
            )
         OR EXISTS (
              SELECT 1 FROM google_iap_claims g
               WHERE g.user_id = a.user_id AND g.expires_at <= NOW()
            )
         OR a.stripe_expires_at <= NOW()
      ORDER BY a.user_id LIMIT 250`,
  );
  for (const row of expired.rows) {
    await applyStoredRevenueCatRole(row.user_id as string);
  }
}

export function startRevenueCatEntitlementExpiryJob(): void {
  const reconcile = () => reconcileExpiredBillingRoleSources().catch(() =>
    console.warn('[RevenueCat] Expired entitlement reconciliation failed'));
  void reconcile();
  setInterval(reconcile, 5 * 60 * 1000).unref();
}

async function processRevenueCatWebhookEvent(
  eventId: string,
  event: any,
): Promise<'processed' | 'duplicate' | 'unlinked' | 'ignored'> {
  const eventType = typeof event?.type === 'string' ? event.type : '';
  if (!isRecognizedRevenueCatLifecycleEvent(eventType)) return 'ignored';
  const appUserId = typeof event?.app_user_id === 'string' ? event.app_user_id : '';
  if (!/^roster_[a-f0-9]{64}$/.test(appUserId)) return 'unlinked';

  const owner = await pool.query(
    `SELECT user_id FROM revenuecat_native_accounts WHERE app_user_id = $1`,
    [appUserId],
  );
  const userId = owner.rows[0]?.user_id as string | undefined;
  // Anonymous, old custom, or unknown identities are deliberately not linked
  // automatically. They require the separate verified restore/ownership path.
  if (!userId) return 'unlinked';

  const client = await pool.connect();
  let eventLocked = false;
  let userLocked = false;
  let transactionStarted = false;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [eventId]);
    eventLocked = true;
    const existing = await client.query(
      'SELECT 1 FROM revenuecat_native_webhook_events WHERE event_id = $1',
      [eventId],
    );
    if (existing.rows.length) {
      return 'duplicate';
    }
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [userId]);
    userLocked = true;
    // Ignore the event's entitlement state and timestamps: fetch the current
    // subscriber only after per-account serialization.
    const subscriptions = await getRevenueCatNativeSubscriptions(appUserId);
    const eventProduct = typeof event.product_id === 'string' ? event.product_id : '';
    const eventExpiry = typeof event.expiration_at_ms === 'number'
      ? event.expiration_at_ms
      : Number.NaN;
    if (shouldRetryRevenueCatWebhookForLag(
      eventProduct,
      eventType,
      eventExpiry,
      subscriptions.map((subscription) => subscription.productId),
    )) {
      // A purchase webhook can arrive before subscriber state is visible via
      // REST. Do not grant from the event; ask RevenueCat to retry the
      // authenticated webhook after its subscriber endpoint catches up.
      throw Object.assign(new Error('RevenueCat subscriber state is not yet current.'), { status: 503 });
    }
    const stripeSource = await refreshExpiredStripeRoleSource(userId);
    await client.query('BEGIN');
    transactionStarted = true;
    await applyRevenueCatSnapshot(client, userId, subscriptions, stripeSource);
    await client.query(
      `INSERT INTO revenuecat_native_webhook_events (event_id, event_type)
       VALUES ($1, $2)`,
      [eventId, eventType],
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return 'processed';
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (userLocked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [userId]);
    if (eventLocked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [eventId]);
    client.release();
  }
}

interface RevenueCatWebhookInboxRow {
  event_id: string;
  event_type: string;
  payload: any;
  attempts: number;
  lease_token: string;
}

async function claimRevenueCatWebhookInboxRows(): Promise<RevenueCatWebhookInboxRow[]> {
  const leaseToken = randomBytes(24).toString('hex');
  const claimed = await pool.query(
    `WITH candidates AS (
       SELECT event_id
         FROM revenuecat_native_webhook_inbox
        WHERE (status = 'pending' AND available_at <= NOW())
           OR (status = 'processing' AND lease_until <= NOW())
        ORDER BY received_at
        LIMIT 10
        FOR UPDATE SKIP LOCKED
     )
     UPDATE revenuecat_native_webhook_inbox AS inbox
        SET status = 'processing', attempts = inbox.attempts + 1,
            lease_token = $1, lease_until = NOW() + INTERVAL '2 minutes'
       FROM candidates
      WHERE inbox.event_id = candidates.event_id
     RETURNING inbox.event_id, inbox.event_type, inbox.payload, inbox.attempts,
               inbox.lease_token`,
    [leaseToken],
  );
  return claimed.rows as RevenueCatWebhookInboxRow[];
}

async function markRevenueCatWebhookInboxCompleted(
  eventId: string,
  leaseToken: string,
): Promise<void> {
  await pool.query(
    `UPDATE revenuecat_native_webhook_inbox
        SET status = 'completed', processed_at = NOW(), lease_token = NULL,
            lease_until = NULL, last_error = NULL
      WHERE event_id = $1 AND status = 'processing' AND lease_token = $2`,
    [eventId, leaseToken],
  );
}

async function scheduleRevenueCatWebhookInboxRetry(
  row: RevenueCatWebhookInboxRow,
  error: unknown,
): Promise<void> {
  const delay = getRevenueCatWebhookRetryDelaySeconds(row.attempts);
  const message = error instanceof Error ? error.message : 'Unknown processing failure';
  await pool.query(
    `UPDATE revenuecat_native_webhook_inbox
        SET status = 'pending',
            available_at = NOW() + ($3 * INTERVAL '1 second'),
            lease_token = NULL, lease_until = NULL, last_error = $4
      WHERE event_id = $1 AND status = 'processing' AND lease_token = $2`,
    [row.event_id, row.lease_token, delay, message.slice(0, 1000)],
  );
}

let revenueCatWebhookWorkerRunning = false;

async function runRevenueCatWebhookInboxWorker(): Promise<void> {
  if (revenueCatWebhookWorkerRunning) return;
  revenueCatWebhookWorkerRunning = true;
  try {
    const rows = await claimRevenueCatWebhookInboxRows();
    for (const row of rows) {
      try {
        // The automatic Home prompt is a separate rollout switch. Signed,
        // recognized lifecycle events must still reconcile during sandbox
        // validation while that prompt is disabled. Provider outages retry.
        if (!isRecognizedRevenueCatLifecycleEvent(row.event_type)) {
          await markRevenueCatWebhookInboxCompleted(row.event_id, row.lease_token);
          continue;
        }
        await processRevenueCatWebhookEvent(row.event_id, row.payload);
        await markRevenueCatWebhookInboxCompleted(row.event_id, row.lease_token);
      } catch (error) {
        console.error('[RevenueCat] Webhook inbox processing failed:',
          error instanceof Error ? error.message : 'unknown');
        await scheduleRevenueCatWebhookInboxRetry(row, error);
      }
    }
  } catch (error) {
    console.error('[RevenueCat] Could not claim webhook inbox events:',
      error instanceof Error ? error.message : 'unknown');
  } finally {
    revenueCatWebhookWorkerRunning = false;
  }
}

export function startRevenueCatWebhookInboxWorker(): void {
  void runRevenueCatWebhookInboxWorker();
  setInterval(() => void runRevenueCatWebhookInboxWorker(), 1000).unref();
}

export function registerNativeRevenueCatRoutes(app: Express, isAuthenticated: RequestHandler): void {
  const rejectDemoPov = (req: any, res: any): boolean => {
    if (req.demoContext || (req.realActor && req.realActor.id !== req.user?.claims?.sub)) {
      res.status(403).json({ message: 'Native purchases are unavailable in Demo.' });
      return true;
    }
    return false;
  };
  const statusFromError = (error: any) =>
    [400, 403, 404, 409, 503].includes(error?.status) ? error.status : 502;

  app.get('/api/iap/native-paywall-status', isAuthenticated, async (req: any, res) => {
    res.set('Cache-Control', 'no-store');
    if (rejectDemoPov(req, res)) return;
    const userId = req.user.claims.sub as string;
    const enabled = isNativeRevenueCatPaywallEnabled();
    if (!process.env.REVENUECAT_API_KEY) {
      return res.json({ enabled: false, eligible: false, shown: false });
    }
    try {
      const loginId = await getOrCreateRevenueCatAppUserId(userId);
      const result = await syncRevenueCatNativeEntitlements(userId, loginId);
      const user = await pool.query(
        `SELECT role, first_name, last_name, onboarding_completed,
                special_permissions, fee_exempt, is_primary_commissioner
           FROM users WHERE id = $1`,
        [userId],
      );
      const account = await pool.query(
        `SELECT shown_at FROM revenuecat_native_accounts WHERE user_id = $1`,
        [userId],
      );
      const profile = user.rows[0];
      const paidOrPrivileged = !profile || roleValue(profile.role) !== 'free_tier' ||
        profile.fee_exempt || profile.is_primary_commissioner ||
        (Array.isArray(profile.special_permissions) && profile.special_permissions.includes('admin'));
      const profileComplete = Boolean(profile?.onboarding_completed &&
        profile.first_name?.trim() && profile.last_name?.trim());
      const shown = Boolean(account.rows[0]?.shown_at);
      return res.json({
        enabled,
        eligible: enabled && result.role === 'free_tier' && !paidOrPrivileged && profileComplete && !shown,
        shown,
        loginId,
      });
    } catch (error: any) {
      return res.status(statusFromError(error)).json({
        message: 'RevenueCat subscription status is temporarily unavailable.',
      });
    }
  });

  app.post('/api/iap/native-paywall-claim', isAuthenticated, async (req: any, res) => {
    res.set('Cache-Control', 'no-store');
    if (rejectDemoPov(req, res)) return;
    if (!isNativeRevenueCatPaywallEnabled()) {
      return res.status(409).json({ message: 'Native paywall is not enabled.' });
    }
    const userId = req.user.claims.sub as string;
    try {
      const appUserId = await getOrCreateRevenueCatAppUserId(userId);
      await syncRevenueCatNativeEntitlements(userId, appUserId);
      const eligibility = await pool.query(
        `SELECT u.role, u.first_name, u.last_name, u.onboarding_completed,
                u.special_permissions, u.fee_exempt, u.is_primary_commissioner,
                a.shown_at, a.claim_token_hash, a.claim_expires_at
           FROM users u
           JOIN revenuecat_native_accounts a ON a.user_id = u.id
          WHERE u.id = $1`,
        [userId],
      );
      const row = eligibility.rows[0];
      const privileged = row?.fee_exempt || row?.is_primary_commissioner ||
        (Array.isArray(row?.special_permissions) && row.special_permissions.includes('admin'));
      if (!row || roleValue(row.role) !== 'free_tier' || privileged ||
          !row.onboarding_completed || !row.first_name?.trim() || !row.last_name?.trim() ||
          !isPaywallClaimAvailable(row.shown_at, row.claim_expires_at)) {
        return res.status(409).json({ message: 'Native paywall is not currently available for this account.' });
      }
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const claim = await pool.query(
        `UPDATE revenuecat_native_accounts AS a
            SET claim_token_hash = $2, claim_expires_at = NOW() + INTERVAL '30 minutes',
                updated_at = NOW()
           FROM users AS u
          WHERE a.user_id = $1 AND u.id = a.user_id
            AND u.role = 'free_tier' AND u.onboarding_completed = TRUE
            AND NULLIF(BTRIM(u.first_name), '') IS NOT NULL
            AND NULLIF(BTRIM(u.last_name), '') IS NOT NULL
            AND u.fee_exempt = FALSE AND u.is_primary_commissioner = FALSE
            AND NOT (COALESCE(u.special_permissions::text[], ARRAY[]::text[]) @> ARRAY['admin']::text[])
            AND a.shown_at IS NULL
            AND (a.claim_expires_at IS NULL OR a.claim_expires_at <= NOW())
          RETURNING a.user_id`,
        [userId, tokenHash],
      );
      if (!claim.rows.length) {
        return res.status(409).json({ message: 'Native paywall is already reserved for this account.' });
      }
      return res.json({ claimToken: token });
    } catch (error: any) {
      return res.status(statusFromError(error)).json({
        message: 'Could not reserve the native paywall. Please try again later.',
      });
    }
  });

  app.post('/api/iap/native-paywall-result', isAuthenticated, async (req: any, res) => {
    res.set('Cache-Control', 'no-store');
    if (rejectDemoPov(req, res)) return;
    const userId = req.user.claims.sub as string;
    const token = req.body?.claimToken;
    const presented = req.body?.presented;
    if (typeof token !== 'string' || token.length !== 64 || typeof presented !== 'boolean') {
      return res.status(400).json({ message: 'Invalid native paywall result.' });
    }
    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const updated = await pool.query(
        `UPDATE revenuecat_native_accounts
            SET shown_at = CASE WHEN $3 THEN COALESCE(shown_at, NOW()) ELSE shown_at END,
                claim_token_hash = NULL, claim_expires_at = NULL, updated_at = NOW()
          WHERE user_id = $1 AND claim_token_hash = $2
            AND claim_expires_at > NOW()
          RETURNING shown_at`,
        [userId, tokenHash, presented],
      );
      if (!updated.rows.length) {
        return res.status(409).json({ message: 'The native paywall reservation has expired.' });
      }
      return res.json({ shown: Boolean(updated.rows[0].shown_at) });
    } catch {
      return res.status(502).json({ message: 'The native paywall result could not be saved.' });
    }
  });

  app.post('/api/iap/revenuecat-sync', isAuthenticated, async (req: any, res) => {
    res.set('Cache-Control', 'no-store');
    if (rejectDemoPov(req, res)) return;
    try {
      const result = await syncRevenueCatNativeEntitlements(req.user.claims.sub as string);
      return res.json(result);
    } catch (error: any) {
      return res.status(statusFromError(error)).json({
        message: 'RevenueCat could not verify the current subscription status.',
      });
    }
  });

  app.post('/api/webhooks/revenuecat-native', async (req, res) => {
    const productionSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    const sandboxSecret = process.env.REVENUECAT_WEBHOOK_SANDBOX_SECRET;
    if (!productionSecret || (sandboxSecret !== undefined && !productionSecret)) {
      return res.status(503).json({ message: 'RevenueCat webhook signing is unavailable.' });
    }
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ message: 'RevenueCat webhook requires a raw JSON body.' });
    }
    const rawBody = req.body as Buffer;
    const signature = req.header('X-RevenueCat-Webhook-Signature');
    const signingKey = verifyRevenueCatWebhookSignature(
      rawBody,
      signature,
      productionSecret,
      sandboxSecret,
    );
    if (!signingKey) {
      return res.status(401).json({ message: 'Invalid RevenueCat webhook signature.' });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ message: 'RevenueCat webhook body is not valid JSON.' });
    }
    const event = payload?.event;
    const eventId = typeof event?.id === 'string' ? event.id : '';
    const eventType = typeof event?.type === 'string' ? event.type : '';
    if (!eventId || eventId.length > 200 || !eventType || eventType.length > 80 ||
        !isRevenueCatWebhookEnvironmentAllowed(signingKey, event?.environment)) {
      return res.status(400).json({ message: 'Invalid RevenueCat webhook event or environment.' });
    }

    try {
      const inserted = await pool.query(
        `INSERT INTO revenuecat_native_webhook_inbox
          (event_id, event_type, app_user_id, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [
          eventId,
          eventType,
          typeof event.app_user_id === 'string' ? event.app_user_id : null,
          JSON.stringify(event),
        ],
      );
      const result = revenueCatWebhookEnqueueOutcome(inserted.rows.length > 0);
      return res.status(200).json({ received: true, result });
    } catch (error) {
      console.error('[RevenueCat] Failed to persist webhook event:',
        error instanceof Error ? error.message : 'unknown');
      return res.status(503).json({ message: 'RevenueCat webhook could not be durably queued.' });
    }
  });
}