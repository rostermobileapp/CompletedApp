/**
 * Explicit, additive migration for this project's external Supabase production
 * database, NOT Replit-managed PostgreSQL. Never run from a build/start hook.
 *
 * NODE_ENV=production npx tsx scripts/apply-production-card-payments.ts --apply-live-pilot-schema
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';

let client: pg.Client | undefined;
try {
  if (process.env.NODE_ENV !== 'production' || !process.argv.includes('--apply-live-pilot-schema')) {
    throw new Error('EXPLICIT_PRODUCTION_MIGRATION_CONFIRMATION_REQUIRED');
  }
  const connection = process.env.DATABASE_URL;
  const devConnection = process.env.DEV_DATABASE_URL;
  const productionApi = process.env.SUPABASE_URL;
  const developmentApi = process.env.DEV_SUPABASE_URL;
  if (!connection || !devConnection || !productionApi || !developmentApi || connection === devConnection) {
    throw new Error('DISTINCT_EXTERNAL_PRODUCTION_TARGET_REQUIRED');
  }
  const db = new URL(connection);
  const productionProject = new URL(productionApi).hostname.split('.')[0];
  const developmentProject = new URL(developmentApi).hostname.split('.')[0];
  if (productionProject === developmentProject ||
      !['postgres:', 'postgresql:'].includes(db.protocol) ||
      !(db.hostname === `db.${productionProject}.supabase.co` ||
        decodeURIComponent(db.username).endsWith(`.${productionProject}`))) {
    throw new Error('PRODUCTION_TARGET_MISMATCH');
  }
  const migrations = await Promise.all([
    '0053_organizer_card_payments.sql',
    '0054_organizer_refund_amount.sql',
    '0055_organizer_report_ledger.sql',
  ].map(name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')));
  client = new pg.Client({
    connectionString: connection, connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true, ca: await readFile(new URL('../server/certs/supabase-ca.pem', import.meta.url), 'utf8') },
  });
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='60s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('roster:organizer-card-live-pilot-schema'))");
  const accounts = await client.query(
    'SELECT display_id FROM public.users WHERE display_id=ANY($1) AND deleted_at IS NULL',
    [['U00001', 'U00002']],
  );
  if (accounts.rows.length !== 2) throw new Error('PILOT_ACCOUNTS_NOT_FOUND');
  const existing = await client.query("SELECT to_regclass('public.organizer_card_payments') IS NOT NULL AS present");
  if (existing.rows[0].present) {
    const records = await client.query('SELECT COUNT(*)::int AS count FROM public.organizer_card_payments');
    if (records.rows[0].count !== 0) {
      throw new Error('EXISTING_PRODUCTION_CARD_PAYMENTS_REQUIRE_SEPARATE_MIGRATION_REVIEW');
    }
  }
  for (const migration of migrations) {
    const sql = migration.replace(/^BEGIN;\r?\n/m, '').replace(/^COMMIT;\s*$/m, '');
    await client.query(sql);
  }
  const verified = await client.query(`
    SELECT
      to_regclass('public.stripe_connected_accounts') IS NOT NULL
      AND to_regclass('public.stripe_connect_webhook_events') IS NOT NULL
      AND (SELECT COUNT(*)=6 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='organizer_card_payments'
        AND column_name IN ('refunded_amount_cents','application_fee_refunded_cents',
          'disputed_amount_cents','dispute_fee_cents','dispute_balance_net_cents',
          'dispute_balance_transaction_count'))
      AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='payment_requests' AND column_name='card_enabled')
      AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='scrimmages' AND column_name='card_payment_enabled')
      AS ready
  `);
  if (!verified.rows[0].ready) throw new Error('SCHEMA_VERIFICATION_FAILED');
  await client.query('COMMIT');
  console.info(JSON.stringify({
    productionTargetMatched: true, cardSchemaReady: true,
    copiedTestData: false, createdCharges: 0, enabledLiveCollection: false,
  }));
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  // Never expose database connection strings or provider errors in console output.
  console.error('Production card schema migration did not complete', {
    code: (error as { code?: string })?.code ?? 'GUARD_OR_VERIFICATION_FAILED',
  });
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
