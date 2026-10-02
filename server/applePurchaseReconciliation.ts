import { createHash } from 'node:crypto';
import { matchingApplePurchase, isLaterVerifiedPeriod } from './applePurchaseMatch';
import { resolveAppleLinkedRole } from './linkedPurchaseRole';
import type { VerifiedAppleSubscription } from './revenueCatApi';

export type ApplePurchaseLink = {
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

type QueryResult = { rows: any[]; rowCount: number | null };
type Queryable = { query: (sql: string, params?: any[]) => Promise<QueryResult> };
type Client = Queryable & { release: () => void };

/** Retained Apple links continue to reconcile after expiry/refund, so every
 * verified Stripe tier change must refresh their source-tagged baseline. */
export async function refreshAppleStripeBaseline(
  queryable: Queryable,
  userId: string,
  verifiedRole: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier',
): Promise<void> {
  await queryable.query(
    `UPDATE apple_purchase_links AS links
        SET stripe_role_before_apple = CASE
              WHEN NULLIF(account.stripe_subscription_id, '') IS NULL THEN NULL ELSE $2 END,
            stripe_subscription_id_before_apple = NULLIF(account.stripe_subscription_id, '')
       FROM users AS account
      WHERE links.user_id = $1 AND account.id = links.user_id`,
    [userId, verifiedRole],
  );
}

export type AppleReconciliationDependencies = {
  pool: Queryable & { connect: () => Promise<Client> };
  getSubscriptions: (customerId: string) => Promise<VerifiedAppleSubscription[]>;
  updateUserMetadata: (userId: string, role: string) => Promise<void>;
  now?: () => Date;
  log?: (message: string) => void;
};

export async function reconcileOne(
  link: ApplePurchaseLink,
  dependencies: AppleReconciliationDependencies,
): Promise<void> {
  const { pool } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  let subscriptions: VerifiedAppleSubscription[] | undefined;
  try {
    subscriptions = await dependencies.getSubscriptions(link.customer_id);
  } catch {
    dependencies.log?.('[Apple link] Provider verification unavailable.');
  }
  const candidate = subscriptions && matchingApplePurchase(subscriptions, link.original_purchased_at);
  const recovered = Boolean(link.revoked_by_apple &&
    ['REFUND', 'REVOKE', 'EXPIRED', 'GRACE_PERIOD_EXPIRED'].includes(link.apple_revocation_reason ?? '') &&
    isLaterVerifiedPeriod(candidate, link.revoked_period_expires_at));
  const active = (!link.revoked_by_apple || recovered) && candidate;
  const expiry = active ? new Date(active.expiresAt) : null;
  // A failed lookup cannot renew or create access. Previously verified access
  // ends at its last confirmed expiry, even if the provider is still down.
  if (!subscriptions && !link.revoked_by_apple &&
      (!link.expires_at || link.expires_at > now())) return;
  if (!expiry && !link.revoked_by_apple && link.expires_at && link.expires_at > now() &&
      link.last_apple_signed_at && (!link.last_checked_at ||
        link.last_apple_signed_at > link.last_checked_at) &&
      now().getTime() - link.last_apple_signed_at.getTime() < 15 * 60 * 1000) return;
  const client = await pool.connect();
  let changedRole: string | null = null;
  try {
    await client.query('BEGIN');
    const current = (await client.query(
      `SELECT original_transaction_id, revoked_by_apple, expires_at, role_before_apple,
              stripe_role_before_apple, stripe_subscription_id_before_apple,
              association_source,
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
    const appleRole = expiry && expiry > now() ? candidate?.role ?? null : null;
    const legacyAppleOwned = user.iap_original_transaction_id === link.original_transaction_id;
    const googleClaimForIapField = user.iap_original_transaction_id && !legacyAppleOwned
      ? (await client.query(
          `SELECT 1 FROM google_iap_claims
            WHERE token_hash = $1 AND user_id = $2 LIMIT 1`,
          [
            createHash('sha256').update(user.iap_original_transaction_id).digest('hex'),
            link.user_id,
          ],
        )).rows.length > 0
      : false;
    let stripeBaseline = current.stripe_subscription_id_before_apple &&
      current.stripe_subscription_id_before_apple === user.stripe_subscription_id
      ? current.stripe_role_before_apple : null;
    let stripeBaselineSubscriptionId = current.stripe_subscription_id_before_apple;
    let unmanagedBaseline = legacyAppleOwned
      ? 'free_tier'
      : current.role_before_apple ??
        (user.role === 'secondary_commissioner' ? 'secondary_commissioner' : 'free_tier');
    if (appleRole && current.role_before_apple == null &&
        current.stripe_subscription_id_before_apple == null &&
        current.association_source === 'automatic') {
      const canSnapshotStripeRole = !legacyAppleOwned && !googleClaimForIapField &&
        !googleRole && Boolean(user.stripe_subscription_id);
      stripeBaseline = canSnapshotStripeRole ? user.role : null;
      stripeBaselineSubscriptionId = canSnapshotStripeRole ? user.stripe_subscription_id : null;
      unmanagedBaseline = legacyAppleOwned ? 'free_tier'
        : user.role === 'secondary_commissioner' ? 'secondary_commissioner' : 'free_tier';
      await client.query(
        `UPDATE apple_purchase_links
            SET role_before_apple = $2,
                stripe_role_before_apple = $3,
                stripe_subscription_id_before_apple = $4
          WHERE user_id = $1`,
        [
          link.user_id,
          legacyAppleOwned ? 'free_tier'
            : user.role === 'secondary_commissioner' ? 'secondary_commissioner' : 'free_tier',
          canSnapshotStripeRole ? user.role : null,
          canSnapshotStripeRole ? user.stripe_subscription_id : null,
        ],
      );
    }
    const legacyOperatorPro = current.association_source === 'operator_attested' &&
      ['com.rosterapp.player_pro_monthly', 'com.rosterapp.player_pro_yearly'].includes(link.product_id) &&
      current.role_before_apple == null;
    if (subscriptions) {
      await client.query(
        `UPDATE apple_purchase_links
            SET expires_at = $2, last_checked_at = NOW(),
                product_id = COALESCE($4, product_id),
                revoked_by_apple = CASE WHEN $3 THEN FALSE ELSE revoked_by_apple END,
                apple_revocation_reason = CASE WHEN $3 THEN NULL ELSE apple_revocation_reason END,
                revoked_period_expires_at = CASE WHEN $3 THEN NULL ELSE revoked_period_expires_at END
          WHERE user_id = $1`,
        [link.user_id, expiry, recovered, candidate?.productId ?? null],
      );
    } else {
      await client.query(
        `UPDATE apple_purchase_links SET expires_at = NULL WHERE user_id = $1 AND expires_at <= NOW()`,
        [link.user_id],
      );
    }
    const ownsAppleClaim = !user.iap_original_transaction_id || legacyAppleOwned ||
      googleClaimForIapField;
    if (current.association_source === 'automatic' && user.stripe_subscription_id &&
        (!stripeBaseline || stripeBaselineSubscriptionId !== user.stripe_subscription_id)) {
      // With multiple paid sources the current effective role cannot tell us
      // Stripe's own tier. Wait for the existing Stripe sync/webhook to tag it
      // rather than erasing Stripe access or persisting Apple's upgraded tier.
      throw Object.assign(new Error('Sync your Stripe subscription before verifying this Apple purchase.'), { status: 409 });
    }
    if (appleRole && !(legacyOperatorPro && user.role === 'commissioner') &&
        ownsAppleClaim &&
        ['free_tier', 'player_pro', 'commissioner'].includes(user.role)) {
      const effectiveRole = resolveAppleLinkedRole({
        appleRole, googleRole, unmanagedRole: unmanagedBaseline,
        stripeRole: stripeBaseline,
        stripeSubscriptionIdBeforeApple: stripeBaselineSubscriptionId,
        currentStripeSubscriptionId: user.stripe_subscription_id,
        legacyAppleOwned,
      });
      const matchedStripeBaseline = Boolean(stripeBaseline &&
        stripeBaselineSubscriptionId === user.stripe_subscription_id);
      const result = await client.query(
        `UPDATE users SET role = $3,
                iap_original_transaction_id = CASE
                  WHEN iap_original_transaction_id IS NULL OR iap_original_transaction_id = $2
                    THEN $2 ELSE iap_original_transaction_id END,
                last_updated = NOW(), updated_at = NOW()
           WHERE id = $1 AND role IN ('free_tier', 'player_pro', 'commissioner')
             AND ($4 = TRUE OR NULLIF(stripe_subscription_id, '') IS NULL)
             AND (iap_original_transaction_id IS NULL OR iap_original_transaction_id = $2 OR $5 = TRUE)`,
        [link.user_id, link.original_transaction_id, effectiveRole,
          effectiveRole === 'commissioner' || matchedStripeBaseline, googleClaimForIapField],
      );
      if (!result.rowCount) {
        throw Object.assign(
          new Error('Apple purchase was verified, but the account role changed before access could be saved. Refresh and retry, or contact support.'),
          { status: 409 },
        );
      }
      if (user.role !== effectiveRole) changedRole = effectiveRole;
    } else if (!appleRole && ownsAppleClaim &&
               !(legacyOperatorPro && user.role !== 'player_pro') &&
               ['player_pro', 'commissioner'].includes(user.role)) {
      const effectiveRole = resolveAppleLinkedRole({
        googleRole, unmanagedRole: unmanagedBaseline,
        stripeRole: stripeBaseline,
        stripeSubscriptionIdBeforeApple: stripeBaselineSubscriptionId,
        currentStripeSubscriptionId: user.stripe_subscription_id,
        legacyAppleOwned,
      });
      const result = await client.query(
        `UPDATE users SET role = $3,
                iap_original_transaction_id = CASE
                  WHEN iap_original_transaction_id = $2 THEN NULL ELSE iap_original_transaction_id END,
                last_updated = NOW(), updated_at = NOW()
             WHERE id = $1 AND role IN ('player_pro', 'commissioner')
               AND (NULLIF(stripe_subscription_id, '') IS NULL OR $4 = TRUE)
               AND (iap_original_transaction_id IS NULL OR iap_original_transaction_id = $2 OR $5 = TRUE)`,
        [link.user_id, link.original_transaction_id, effectiveRole,
          Boolean(current.role_before_apple ||
            (stripeBaseline && stripeBaselineSubscriptionId === user.stripe_subscription_id)),
          googleClaimForIapField],
      );
      if (!result.rowCount) {
        throw Object.assign(
          new Error('Apple access expired, but the account role could not be safely restored. Refresh and retry, or contact support.'),
          { status: 409 },
        );
      }
      if (user.role !== effectiveRole) changedRole = effectiveRole;
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
      await dependencies.updateUserMetadata(link.user_id, changedRole);
    } catch {
      dependencies.log?.('[Apple link] Metadata sync failed.');
    }
    dependencies.log?.(`[Apple link] Reconciled Apple access: ${changedRole}`);
  }
}

export async function reconcileApplePurchaseLinkForUser(
  userId: string,
  dependencies: AppleReconciliationDependencies,
): Promise<{
  role: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier';
  productId: string;
  active: boolean;
} | null> {
  const { pool } = dependencies;
  const row = (await pool.query(
    `SELECT user_id, customer_id, original_transaction_id, product_id,
            original_purchased_at, expires_at, revoked_by_apple,
            last_apple_signed_at, last_checked_at, apple_revocation_reason,
            revoked_period_expires_at
       FROM apple_purchase_links WHERE user_id = $1`, [userId],
  )).rows[0] as ApplePurchaseLink | undefined;
  if (!row) return null;
  await reconcileOne(row, dependencies);
  const user = (await pool.query('SELECT role FROM users WHERE id = $1', [userId])).rows[0];
  const refreshed = (await pool.query(
    `SELECT product_id, expires_at, revoked_by_apple FROM apple_purchase_links WHERE user_id = $1`,
    [userId],
  )).rows[0];
  return user ? {
    role: user.role,
    productId: refreshed.product_id,
    active: Boolean(refreshed && !refreshed.revoked_by_apple &&
      refreshed.expires_at && new Date(refreshed.expires_at) > (dependencies.now?.() ?? new Date())),
  } : null;
}