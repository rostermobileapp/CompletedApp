import { db, pool } from './db';
import { sql } from 'drizzle-orm';
import { resolveLinkedPurchaseRole } from './linkedPurchaseRole';
import { refreshAppleStripeBaseline } from './applePurchaseReconciliation';

/** Preserve an independently verified Apple Player Pro purchase when another
 * payment source changes the account role. Higher commissioner roles win. */
export async function preserveLinkedAppleRole(
  userId: string,
  requested: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier',
  stripeVerified = false,
): Promise<typeof requested> {
  const result = await db.execute(sql`
    SELECT
      EXISTS(SELECT 1 FROM apple_purchase_links
        WHERE user_id = ${userId} AND expires_at > NOW()
          AND revoked_by_apple = FALSE) AS apple_active,
      EXISTS(SELECT 1 FROM apple_purchase_links
        WHERE user_id = ${userId} AND expires_at > NOW()
          AND revoked_by_apple = FALSE
          AND product_id IN ('com.rosterapp.commissioner_monthly', 'com.rosterapp.commissioner_yearly')) AS apple_commissioner,
      EXISTS(SELECT 1 FROM google_iap_claims
        WHERE user_id = ${userId} AND expires_at > NOW()
          AND product_id IN ('commissioner_monthly', 'commissioner_yearly')) AS google_commissioner,
      EXISTS(SELECT 1 FROM google_iap_claims
        WHERE user_id = ${userId} AND expires_at > NOW()
          AND product_id IN ('player_pro_monthly', 'player_pro_yearly')) AS google_pro
  `);
  const entitlements = result.rows[0];
  // Keep only a source-tagged Stripe baseline. It is valid only as long as
  // the same Stripe subscription ID remains attached to the account.
  if (stripeVerified) await refreshAppleStripeBaseline(pool, userId, requested);
  return resolveLinkedPurchaseRole(requested, {
    appleActive: entitlements?.apple_active === true,
    appleCommissioner: entitlements?.apple_commissioner === true,
    googleCommissioner: entitlements?.google_commissioner === true,
    googlePro: entitlements?.google_pro === true,
  });
}