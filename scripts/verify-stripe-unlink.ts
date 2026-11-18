/**
 * Disposable local PostgreSQL + Stripe fixtures only. Never reads application
 * database credentials and never calls Stripe. Start an isolated local cluster
 * on 127.0.0.1:55439 with role unlink_fixture before running.
 */
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import vm from "node:vm";

const pool = new pg.Pool({
  host: "127.0.0.1", port: 55439, database: "postgres",
  user: "unlink_fixture", password: "", ssl: false, connectionTimeoutMillis: 3000,
});
let releaseRevoke: (() => void) | undefined;
let revokeStarted: (() => void) | undefined;
let stripeCalls = 0;
const stripe: any = {
  oauth: {
    deauthorize: async () => {
      stripeCalls++;
      revokeStarted?.();
      await new Promise<void>(resolve => { releaseRevoke = resolve; });
      return { stripe_user_id: "acct_old" };
    },
  },
  accounts: {
    create: async () => ({
      id: "acct_new", controller: { losses: { payments: "stripe" }, fees: { payer: "account" },
        stripe_dashboard: { type: "full" }, requirement_collection: "stripe" },
    }),
    retrieve: async () => { throw new Error("Unexpected retrieve"); },
  },
  accountLinks: { create: async () => ({ url: "https://connect.stripe.com/setup/s/fixture" }) },
};
try {
  const identity = (await pool.query("SELECT current_user AS role")).rows[0];
  assert.equal(identity.role, "unlink_fixture");
  await pool.query(`
    CREATE TABLE public.organizer_stripe_account_registry (
      stripe_account_id text PRIMARY KEY,user_id text,account_kind text
    );
    CREATE TABLE public.organizer_direct_accounts (
      user_id text PRIMARY KEY,stripe_account_id text UNIQUE,
      creation_idempotency_key text UNIQUE,updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.organizer_card_payments (
      id text PRIMARY KEY,organizer_user_id text,stripe_account_id text,payment_flow text,status text,
      stripe_payment_intent_id text,confirmation_started_at timestamptz,updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.payment_requests (id text PRIMARY KEY,creator_id text,card_enabled boolean);
    CREATE TABLE public.scrimmages (id text PRIMARY KEY,creator_id text,card_payment_enabled boolean);
    INSERT INTO public.organizer_stripe_account_registry VALUES ('acct_old','owner','direct');
    INSERT INTO public.organizer_direct_accounts(user_id,stripe_account_id,creation_idempotency_key)
      VALUES ('owner','acct_old','original');
    INSERT INTO public.payment_requests VALUES ('invoice','owner',true);
    INSERT INTO public.scrimmages VALUES ('scrimmage','owner',true);
    INSERT INTO public.organizer_card_payments(id,organizer_user_id,stripe_account_id,payment_flow,status)
      VALUES ('paid','owner','acct_old','direct','paid'),('quote','owner','acct_old','direct','pending');
  `);
  await pool.query(await readFile("migrations/0057_organizer_stripe_unlink.sql", "utf8"));
  // Applying the additive migration twice must be harmless.
  await pool.query(await readFile("migrations/0057_organizer_stripe_unlink.sql", "utf8"));
  const bundled = await build({
    stdin: {
      contents: `export * from './server/organizerStripeUnlink';
        export {onboardDirectAccount} from './server/organizerDirectAccounts';`,
      resolveDir: process.cwd(), loader: "ts",
    },
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{
      name: "local-unlink-only",
      setup(build) {
        build.onResolve({ filter: /^local-unlink-pool$/ }, args => ({ path: args.path, external: true }));
        build.onResolve({ filter: /(^|\/)(db|runtimePolicy)$/ }, args => ({ path: args.path, namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
          contents: args.path.endsWith("runtimePolicy")
            ? "export const isVerifiedProductionRuntime=()=>true;"
            : "export {pool} from 'local-unlink-pool';",
        }));
      },
    }],
  });
  const module = { exports: {} as any };
  const require = createRequire(import.meta.url);
  new vm.Script(bundled.outputFiles[0].text).runInNewContext({
    module, exports: module.exports, console, URL, Buffer,
    process: { env: { STRIPE_CONNECT_CLIENT_ID: "ca_fixture" } },
    require: (name: string) => name === "local-unlink-pool" ? { pool } : require(name),
  });
  const { unlinkOrganizerStripe, lockActiveDirectAccount, onboardDirectAccount } = module.exports;

  // Simulate a confirmation holding the account lock while marking its payment
  // processing. Unlink must wait, then see the committed processing state.
  const confirming = await pool.connect();
  await confirming.query("BEGIN");
  await lockActiveDirectAccount(confirming, "owner", "acct_old");
  await confirming.query("UPDATE organizer_card_payments SET status='processing' WHERE id='quote'");
  let finished = false;
  const blockedUnlink = unlinkOrganizerStripe("owner", "acct_old", stripe)
    .then(() => { throw new Error("Unlink unexpectedly succeeded"); }, (error: any) => {
      assert.equal(error.code, "stripe_unlink_payments_active"); finished = true;
    });
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(finished, false);
  assert.equal(stripeCalls, 0);
  await confirming.query("COMMIT");
  confirming.release();
  await blockedUnlink;
  await pool.query("UPDATE organizer_card_payments SET status='pending' WHERE id='quote'");

  // A delayed Stripe response must leave a durable collection stop in place.
  const started = new Promise<void>(resolve => { revokeStarted = resolve; });
  const unlink = unlinkOrganizerStripe("owner", "acct_old", stripe);
  await started;
  const paused = (await pool.query("SELECT disconnect_requested_at FROM organizer_direct_accounts")).rows[0];
  assert.ok(paused.disconnect_requested_at);
  await assert.rejects(lockActiveDirectAccount(pool, "owner", "acct_old"), { code: "direct_account_unavailable" });
  await assert.rejects(onboardDirectAccount("owner", stripe, "https://example.test"), { code: "stripe_unlink_pending" });
  releaseRevoke!();
  await unlink;
  assert.equal(stripeCalls, 1);
  assert.equal((await pool.query("SELECT stripe_account_id FROM organizer_direct_accounts")).rows[0].stripe_account_id, null);
  assert.equal((await pool.query("SELECT card_enabled FROM payment_requests")).rows[0].card_enabled, false);
  assert.equal((await pool.query("SELECT card_payment_enabled FROM scrimmages")).rows[0].card_payment_enabled, false);
  assert.equal((await pool.query("SELECT status FROM organizer_card_payments WHERE id='paid'")).rows[0].status, "paid");
  assert.equal((await pool.query("SELECT status FROM organizer_card_payments WHERE id='quote'")).rows[0].status, "cancelled");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM organizer_stripe_account_registry")).rows[0].count, 1);
  await unlinkOrganizerStripe("owner", "acct_old", stripe);
  assert.equal(stripeCalls, 1);

  // A new onboarding request owns a new account without changing old history,
  // and a stale unlink confirmation cannot disconnect that new account.
  await onboardDirectAccount("owner", stripe, "https://example.test");
  assert.equal((await pool.query("SELECT stripe_account_id FROM organizer_direct_accounts")).rows[0].stripe_account_id, "acct_new");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM organizer_stripe_account_registry")).rows[0].count, 2);
  await assert.rejects(unlinkOrganizerStripe("owner", "acct_old", stripe), { code: "stripe_connection_changed" });
  assert.equal((await pool.query("SELECT stripe_account_id FROM organizer_card_payments WHERE id='paid'")).rows[0].stripe_account_id, "acct_old");
  const originalCreate = stripe.accounts.create;
  const attemptedKeys: string[] = [];
  stripe.accounts.create = async (_params: any, options: any) => {
    attemptedKeys.push(options.idempotencyKey);
    if (attemptedKeys.length === 1) throw new Error("Simulated ambiguous account-creation timeout");
    return { ...await originalCreate(), id: "acct_recovered" };
  };
  await assert.rejects(onboardDirectAccount("new-owner", stripe, "https://example.test"), /ambiguous/);
  const savedKey = (await pool.query(
    "SELECT creation_idempotency_key FROM organizer_direct_accounts WHERE user_id='new-owner'",
  )).rows[0]?.creation_idempotency_key;
  assert.equal(savedKey, attemptedKeys[0], "Account-creation uncertainty cannot lose the durable idempotency key");
  await onboardDirectAccount("new-owner", stripe, "https://example.test");
  assert.equal(attemptedKeys[0], attemptedKeys[1]);
  console.log(JSON.stringify({
    localPostgresOnly: true, migrationRepeatable: true, confirmationRaceBlocked: true,
    collectionPausedBeforeRevocation: true, onboardingBlockedWhilePending: true,
    historyPreserved: true, reconnectVerified: true, staleUnlinkBlocked: true, accountCreationRetryProtected: true,
    realStripeCalls: 0, productionWrites: 0,
  }));
} finally {
  releaseRevoke?.();
  await pool.end();
}
