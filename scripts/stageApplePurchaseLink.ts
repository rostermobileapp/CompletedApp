/**
 * Operator-only, non-granting purchase binding. The operator must first verify
 * RevenueCat v2 transaction history (earliest Apple transaction + purchase time)
 * and independently confirm which Roster account the project owner authorizes.
 *
 * npx tsx scripts/stageApplePurchaseLink.ts U00096 '<customer>' '<original transaction>' \
 *   com.rosterapp.player_pro_monthly '<first purchase ISO date>' --attested
 *
 * No real customer or transaction identifiers belong in source control.
 */
async function main() {
  const [displayId, customerId, originalId, productId, purchasedAt, attested] = process.argv.slice(2);
  if (attested !== '--attested' || !displayId || !customerId || !originalId || !productId || !purchasedAt) {
    throw new Error('Usage: <Roster ID> <RevenueCat customer> <original Apple transaction> <product> <first purchase ISO date> --attested');
  }
  const { initApplePurchaseLinks, stageApplePurchaseLink } = await import('../server/applePurchaseLinks');
  const { pool } = await import('../server/db');
  try {
    await initApplePurchaseLinks();
    await stageApplePurchaseLink(displayId, customerId, originalId, productId, purchasedAt);
    console.log('Apple purchase link staged. No role changed; the running server must verify it.');
  } finally {
    await pool.end();
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Could not stage purchase');
  process.exitCode = 1;
});