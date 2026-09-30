import { pool } from './db';
import { supabase } from './supabaseAuth';
import { getRevenueCatAppleSubscriptions, type VerifiedAppleSubscription } from './revenueCatApi';
import { matchingApplePurchase, isLaterVerifiedPeriod } from './applePurchaseMatch';

type Link = {
  user_id: string;
  customer_id: string;
  original_transaction_id: string;
  product_id: string;
  original_purchased_at: Date;
  expires_at: Date | null;
  revoked_by_apple: boolean;
  apple_revocation_reason: string | null;
  revoked_period_expires_at: Date | null;
  last_apple_signed_at: Date | null;
  last_checked_at: Date | null;
};

export async function initApplePurchaseLinks(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apple_purchase_links (
      user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      customer_id VARCHAR NOT NULL UNIQUE,
      original_transaction_id VARCHAR NOT NULL UNIQUE,
      product_id VARCHAR NOT NULL,
      original_purchased_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ,
      revoked_by_apple BOOLEAN NOT NULL DEFAULT FALSE,
      apple_revocation_reason VARCHAR,
      revoked_period_expires_at TIMESTAMPTZ,
      last_apple_signed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE apple_purchase_links ADD COLUMN IF NOT EXISTS
    revoked_by_apple BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE apple_purchase_links ADD COLUMN IF NOT EXISTS
    apple_revocation_reason VARCHAR`);
  await pool.query(`ALTER TABLE apple_purchase_links ADD COLUMN IF NOT EXISTS
    revoked_period_expires_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE apple_purchase_links ADD COLUMN IF NOT EXISTS
    last_apple_signed_at TIMESTAMPTZ`);
  const duplicates = await pool.query(`
    SELECT 1 FROM users WHERE iap_original_transaction_id IS NOT NULL
    GROUP BY iap_original_transaction_id HAVING COUNT(*) > 1 LIMIT 1
  `);
  if (duplicates.rowCount) throw new Error('Duplicate legacy IAP claims require manual review before startup');
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_iap_original_transaction_unique
    ON users (iap_original_transaction_id) WHERE iap_original_transaction_id IS NOT NULL`);
}

/**
 * This is called only by an operator who has checked the customer's v2
 * transaction history and received the owner's account attribution.
 * Staging itself never grants access.
 */
export async function stageApplePurchaseLink(
  displayId: string, customerId: string, originalTransactionId: string,
  productId: string, originalPurchasedAt: string,
): Promise<void> {
  const purchasedAt = new Date(originalPurchasedAt);
  if (!/^U\d{5}$/.test(displayId) || !/^\$RCAnonymousID:[\w-]+$/.test(customerId) ||
      !/^\d{10,20}$/.test(originalTransactionId) ||
      !['com.rosterapp.player_pro_monthly', 'com.rosterapp.player_pro_yearly'].includes(productId) ||
      !Number.isFinite(purchasedAt.getTime()) || purchasedAt.getTime() > Date.now()) {
    throw new Error('Invalid operator-attested purchase');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [originalTransactionId]);
    const user = (await client.query(
      `SELECT id, role, stripe_subscription_id, iap_original_transaction_id
         FROM users WHERE display_id = $1 FOR UPDATE`,
      [displayId],
    )).rows[0];
    if (!user || user.role !== 'free_tier' || user.stripe_subscription_id || user.iap_original_transaction_id) {
      throw new Error('Roster account is missing or already has a linked subscription');
    }
    const owner = (await client.query(
      'SELECT id FROM users WHERE iap_original_transaction_id = $1 LIMIT 1',
      [originalTransactionId],
    )).rows[0];
    if (owner) throw new Error('Original transaction is already owned');
    const existing = (await client.query(
      `SELECT user_id, customer_id, original_transaction_id, product_id, original_purchased_at
         FROM apple_purchase_links
        WHERE user_id = $1 OR customer_id = $2 OR original_transaction_id = $3`,
      [user.id, customerId, originalTransactionId],
    )).rows;
    if (existing.length) {
      if (existing.length !== 1 || existing[0].user_id !== user.id ||
          existing[0].customer_id !== customerId ||
          existing[0].original_transaction_id !== originalTransactionId ||
          existing[0].product_id !== productId ||
          +new Date(existing[0].original_purchased_at) !== +purchasedAt) {
        throw new Error('Purchase, customer, or user is already claimed');
      }
    } else {
      await client.query(
        `INSERT INTO apple_purchase_links
          (user_id, customer_id, original_transaction_id, product_id, original_purchased_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, customerId, originalTransactionId, productId, purchasedAt],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function reconcileOne(link: Link): Promise<void> {
  let subscriptions: VerifiedAppleSubscription[] | undefined;
  try {
    subscriptions = await getRevenueCatAppleSubscriptions(link.customer_id);
  } catch (error) {
    console.warn('[Apple link] Provider verification unavailable:',
      error instanceof Error ? error.message : 'unknown');
  }
  const candidate = subscriptions && matchingApplePurchase(subscriptions, link.original_purchased_at);
  const recovered = Boolean(link.revoked_by_apple &&
    ['REFUND', 'REVOKE', 'EXPIRED', 'GRACE_PERIOD_EXPIRED'].includes(link.apple_revocation_reason ?? '') &&
    isLaterVerifiedPeriod(candidate, link.revoked_period_expires_at));
  const active = (!link.revoked_by_apple || recovered) && candidate;
  const expiry = active ? new Date(active.expiresAt) : null;
  // A failed lookup cannot renew or create access. Previously verified access
  // ends at its last confirmed expiry, even if the provider is still down.
  if (!subscriptions && (!link.expires_at || link.expires_at > new Date())) return;
  if (!expiry && !link.revoked_by_apple && link.expires_at && link.expires_at > new Date() &&
      link.last_apple_signed_at && (!link.last_checked_at ||
        link.last_apple_signed_at > link.last_checked_at) &&
      Date.now() - link.last_apple_signed_at.getTime() < 15 * 60 * 1000) return;
  const client = await pool.connect();
  let changedRole: string | null = null;
  try {
    await client.query('BEGIN');
    const current = (await client.query(
      `SELECT original_transaction_id, revoked_by_apple, expires_at,
              last_apple_signed_at, last_checked_at, apple_revocation_reason,
              revoked_period_expires_at
         FROM apple_purchase_links WHERE user_id = $1 FOR UPDATE`,
      [link.user_id],
    )).rows[0];
    if (!current || current.original_transaction_id !== link.original_transaction_id) {
      throw new Error('Apple link changed during reconciliation');
    }
    // The lookup happened outside this transaction. Never apply a provider
    // snapshot that predates a signed Apple event or a concurrent check.
    if (current.revoked_by_apple !== link.revoked_by_apple ||
        current.apple_revocation_reason !== link.apple_revocation_reason ||
        +new Date(current.revoked_period_expires_at ?? 0) !== +new Date(link.revoked_period_expires_at ?? 0) ||
        +new Date(current.last_apple_signed_at ?? 0) !== +new Date(link.last_apple_signed_at ?? 0) ||
        +new Date(current.last_checked_at ?? 0) !== +new Date(link.last_checked_at ?? 0) ||
        +new Date(current.expires_at ?? 0) !== +new Date(link.expires_at ?? 0)) {
      await client.query('ROLLBACK');
      return;
    }
    const user = (await client.query(
      `SELECT role, stripe_subscription_id, iap_original_transaction_id
         FROM users WHERE id = $1 FOR UPDATE`, [link.user_id],
    )).rows[0];
    if (!user) throw new Error('Roster account no longer exists');
    const google = (await client.query(
      `SELECT product_id FROM google_iap_claims
        WHERE user_id = $1 AND expires_at > NOW()
        ORDER BY CASE WHEN product_id IN ('commissioner_monthly', 'commissioner_yearly')
          THEN 0 ELSE 1 END LIMIT 1`, [link.user_id],
    )).rows[0];
    const googleRole = google?.product_id?.startsWith('commissioner_')
      ? 'commissioner' : google ? 'player_pro' : null;
    if (subscriptions) {
      await client.query(
        `UPDATE apple_purchase_links
            SET expires_at = $2, last_checked_at = NOW(),
                revoked_by_apple = CASE WHEN $3 THEN FALSE ELSE revoked_by_apple END,
                apple_revocation_reason = CASE WHEN $3 THEN NULL ELSE apple_revocation_reason END,
                revoked_period_expires_at = CASE WHEN $3 THEN NULL ELSE revoked_period_expires_at END
          WHERE user_id = $1`,
        [link.user_id, expiry, recovered],
      );
    } else {
      await client.query(
        `UPDATE apple_purchase_links SET expires_at = NULL WHERE user_id = $1 AND expires_at <= NOW()`,
        [link.user_id],
      );
    }
    if (expiry && expiry > new Date() && !googleRole && !user.stripe_subscription_id &&
        (!user.iap_original_transaction_id || user.iap_original_transaction_id === link.original_transaction_id) &&
        (user.role === 'free_tier' || user.role === 'player_pro')) {
      const result = await client.query(
        `UPDATE users SET role = 'player_pro', iap_original_transaction_id = $2,
                last_updated = NOW(), updated_at = NOW()
           WHERE id = $1 AND role IN ('free_tier', 'player_pro') AND stripe_subscription_id IS NULL
             AND (iap_original_transaction_id IS NULL OR iap_original_transaction_id = $2)`,
        [link.user_id, link.original_transaction_id],
      );
      if (result.rowCount && user.role !== 'player_pro') changedRole = 'player_pro';
    } else if (!expiry && user.role === 'player_pro' && !googleRole && !user.stripe_subscription_id &&
               user.iap_original_transaction_id === link.original_transaction_id) {
      const result = await client.query(
        `UPDATE users SET role = 'free_tier', iap_original_transaction_id = NULL,
                last_updated = NOW(), updated_at = NOW()
           WHERE id = $1 AND role = 'player_pro' AND stripe_subscription_id IS NULL
             AND iap_original_transaction_id = $2`,
        [link.user_id, link.original_transaction_id],
      );
      if (result.rowCount) changedRole = 'free_tier';
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (changedRole) {
    try {
      const { error } = await supabase.auth.admin.updateUserById(link.user_id, {
        user_metadata: { subscription_tier: changedRole },
      });
      if (error) console.warn('[Apple link] Metadata sync failed:', error.message);
    } catch (error) {
      console.warn('[Apple link] Metadata sync failed:', error instanceof Error ? error.message : 'unknown');
    }
    console.info('[Apple link] Reconciled Apple access:', changedRole);
  }
}

let running = false;
export async function reconcileApplePurchaseLinks(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = (await pool.query(
      `SELECT user_id, customer_id, original_transaction_id, product_id,
              original_purchased_at, expires_at, revoked_by_apple,
              last_apple_signed_at, last_checked_at, apple_revocation_reason,
              revoked_period_expires_at FROM apple_purchase_links`,
    )).rows as Link[];
    for (const link of rows) {
      try {
        await reconcileOne(link);
      } catch (error) {
        console.error('[Apple link] Reconciliation failed:',
          error instanceof Error ? error.message : 'unknown');
      }
    }
  } finally {
    running = false;
  }
}

export function startApplePurchaseLinkJob(): void {
  setInterval(() => {
    reconcileApplePurchaseLinks().catch(error => console.error('[Apple link] Job failed:', error));
  }, 5 * 60 * 1000).unref();
}