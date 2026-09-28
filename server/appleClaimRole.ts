import { db } from './db';
import { sql } from 'drizzle-orm';

/** Preserve an independently verified Apple Player Pro purchase when another
 * payment source changes the account role. Higher commissioner roles win. */
export async function preserveLinkedAppleRole(
  userId: string,
  requested: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier',
): Promise<typeof requested> {
  const result = await db.execute(sql`
    SELECT
      EXISTS(SELECT 1 FROM apple_purchase_links
        WHERE user_id = ${userId} AND expires_at > NOW()
          AND revoked_by_apple = FALSE) AS apple_active,
      EXISTS(SELECT 1 FROM google_iap_claims
        WHERE user_id = ${userId} AND expires_at > NOW()
          AND product_id IN ('commissioner_monthly', 'commissioner_yearly')) AS google_commissioner,
      EXISTS(SELECT 1 FROM google_iap_claims
        WHERE user_id = ${userId} AND expires_at > NOW()
          AND product_id IN ('player_pro_monthly', 'player_pro_yearly')) AS google_pro
  `);
  const entitlements = result.rows[0];
  if (entitlements?.google_commissioner && (requested === 'free_tier' || requested === 'player_pro')) {
    return 'commissioner';
  }
  if ((entitlements?.apple_active || entitlements?.google_pro) && requested === 'free_tier') {
    return 'player_pro';
  }
  return requested;
}