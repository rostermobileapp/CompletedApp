/**
 * Operator-only. Use the deployment's DB, SESSION_SECRET and RevenueCat keys.
 * Default: read-only preview. Never accepts a supplied customer/transaction ID.
 *
 * npx tsx scripts/backfillRevenueCatApple.ts --user U#####       (dry run)
 * npx tsx scripts/backfillRevenueCatApple.ts --user U##### --apply
 * npx tsx scripts/backfillRevenueCatApple.ts --all               (dry run)
 */
import { parseAppleBackfillArgs, backfillAppleAccounts } from '../server/revenueCatAppleBackfill';
import { isRevenueCatAppleHistoryConfigured, revenueCatAppleCustomerExists } from '../server/revenueCatAppleHistory';

async function main() {
  const args = parseAppleBackfillArgs(process.argv.slice(2));
  if (!isRevenueCatAppleHistoryConfigured() || !process.env.REVENUECAT_API_KEY || !process.env.SESSION_SECRET) {
    throw new Error('Configure REVENUECAT_API_KEY, REVENUECAT_V2_API_KEY, REVENUECAT_PROJECT_ID and SESSION_SECRET in the intended environment first.');
  }
  const { pool } = await import('../server/db');
  try {
    const { nativePurchaseLoginId } = await import('../server/nativePurchaseAccount');
    const { refreshRevenueCatAppleAccount } = await import('../server/revenueCatAppleAccount');
    const accounts = (await pool.query<{ id: string; displayId: string; hasAppleLink: boolean }>(
      `SELECT u.id, u.display_id AS "displayId",
              EXISTS(SELECT 1 FROM apple_purchase_links p WHERE p.user_id = u.id) AS "hasAppleLink"
         FROM users u WHERE ($1::text IS NULL OR u.display_id = $1) ORDER BY u.id`,
      [args.user ?? null],
    )).rows;
    if (args.user && !accounts.length) throw new Error('Roster user not found.');
    console.log(args.apply ? 'APPLY: re-verifying and claiming eligible purchases.' : 'DRY RUN: no Roster changes. Candidates are re-verified with ownership checks when applied.');
    const result = await backfillAppleAccounts(accounts, args.apply, {
      loginId: id => nativePurchaseLoginId(id, 'ios'),
      customerExists: async id => {
        // Keep the operator scan below the provider's customer-info rate limit.
        await new Promise(resolve => setTimeout(resolve, 300));
        return revenueCatAppleCustomerExists(id);
      },
      refresh: refreshRevenueCatAppleAccount,
      report: result => console.log(JSON.stringify(result)),
    });
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } finally { await pool.end(); }
}
main().catch(() => {
  // No raw provider errors, credentials, connection strings or customer events.
  console.error('Backfill failed. Check scope/configuration and use dry run before --apply.');
  process.exitCode = 1;
});
