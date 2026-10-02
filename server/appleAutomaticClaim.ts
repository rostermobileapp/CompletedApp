import { createHash } from 'node:crypto';

export interface AppleClaimQueryClient {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export type AutomaticAppleClaimInput = {
  userId: string;
  customerId: string;
  originalTransactionId: string;
  productId: string;
  originalPurchasedAt: string;
  expiresAt: string;
};

function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409 });
}

/** Transactional claim logic separated from pool ownership for deterministic mocked-SQL tests. */
export async function claimAutomaticApplePurchaseWithClient(
  client: AppleClaimQueryClient,
  input: AutomaticAppleClaimInput,
  now = Date.now(),
): Promise<void> {
  const purchasedAt = new Date(input.originalPurchasedAt);
  const expiresAt = new Date(input.expiresAt);
  if (!/^roster_ios_[a-f0-9]{64}$/.test(input.customerId) ||
      !/^\d{10,20}$/.test(input.originalTransactionId) ||
      !['com.rosterapp.player_pro_monthly', 'com.rosterapp.player_pro_yearly',
        'com.rosterapp.commissioner_monthly', 'com.rosterapp.commissioner_yearly'].includes(input.productId) ||
      !Number.isFinite(purchasedAt.getTime()) || !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= now) {
    throw Object.assign(new Error('Apple purchase could not be safely linked.'), { status: 402 });
  }

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.originalTransactionId]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.userId]);
    const user = (await client.query(
      `SELECT id, role, stripe_subscription_id, iap_original_transaction_id
         FROM users WHERE id = $1 FOR UPDATE`, [input.userId],
    )).rows[0];
    if (!user) throw conflict('Roster account was not found.');
    const legacyOwners = (await client.query(
      `SELECT id FROM users WHERE iap_original_transaction_id = $1 FOR UPDATE`,
      [input.originalTransactionId],
    )).rows;
    if (legacyOwners.some(owner => owner.id !== input.userId)) {
      throw conflict('This Apple subscription is already linked to another account.');
    }
    if (user.iap_original_transaction_id &&
        user.iap_original_transaction_id !== input.originalTransactionId) {
      const googleTokenHash = createHash('sha256')
        .update(user.iap_original_transaction_id)
        .digest('hex');
      const googleOwner = (await client.query(
        `SELECT user_id FROM google_iap_claims
          WHERE token_hash = $1 AND user_id = $2 FOR UPDATE`,
        [googleTokenHash, input.userId],
      )).rows[0];
      if (!googleOwner) {
        throw conflict('This Roster account already has a different Apple subscription claim. Contact support.');
      }
    }
    const existing = (await client.query(
      `SELECT user_id, customer_id, original_transaction_id, product_id,
              original_purchased_at, association_source
         FROM apple_purchase_links
        WHERE user_id = $1 OR customer_id = $2 OR original_transaction_id = $3
        FOR UPDATE`,
      [input.userId, input.customerId, input.originalTransactionId],
    )).rows;
    if (existing.length) {
      const link = existing[0];
      if (existing.length !== 1 || link.user_id !== input.userId ||
          link.customer_id !== input.customerId ||
          link.original_transaction_id !== input.originalTransactionId ||
          link.product_id !== input.productId ||
          +new Date(link.original_purchased_at) !== +purchasedAt) {
        throw conflict('This Apple subscription is already linked to another account. Contact support.');
      }
      if (link.association_source === 'operator_attested') {
        await client.query('COMMIT');
        return;
      }
    } else {
      await client.query(
        `INSERT INTO apple_purchase_links
          (user_id, customer_id, original_transaction_id, product_id,
           original_purchased_at, expires_at, association_source)
         VALUES ($1, $2, $3, $4, $5, $6, 'automatic')`,
        [input.userId, input.customerId, input.originalTransactionId,
          input.productId, purchasedAt, expiresAt],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}