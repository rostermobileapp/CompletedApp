import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const bundle = await build({
  stdin: {
    contents: `export * from './server/organizerStripeUnlink';
      export {readDirectAccount} from './server/organizerDirectAccounts';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{
    name: 'unlink-fixtures',
    setup(build) {
      build.onResolve({ filter: /^unlink-state$/ }, args => ({ path: args.path, external: true }));
      build.onResolve({ filter: /(^|\/)(db|runtimePolicy)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: args.path.endsWith('runtimePolicy')
          ? 'export const isVerifiedProductionRuntime = () => true;'
          : `import {state} from 'unlink-state'; export const pool=state.pool;`,
      }));
    },
  }],
});

function fixture() {
  const state = {
    accountId: 'acct_owner' as string | null, pending: false, blocked: false,
    invoiceCards: true, scrimmageCards: true, quoteCancelled: false, key: 'original-key',
    stripeCalls: 0, queryLog: [] as string[],
    pool: {} as any,
  };
  let snapshot: any;
  async function query(sql: string, params: string[] = []) {
    state.queryLog.push(sql);
    if (sql === 'BEGIN') { snapshot = { ...state }; return { rows: [] }; }
    if (sql === 'COMMIT') { snapshot = null; return { rows: [] }; }
    if (sql === 'ROLLBACK') {
      if (snapshot) Object.assign(state, snapshot);
      return { rows: [] };
    }
    if (sql.startsWith('SELECT stripe_account_id')) return {
      rows: params[0] === 'owner' && state.accountId ? [{
        stripe_account_id: state.accountId, disconnect_requested_at: state.pending ? 'pending' : null,
      }] : [],
    };
    if (sql.includes('SELECT id FROM public.organizer_card_payments')) return { rows: state.blocked ? [{ id: 'active' }] : [] };
    if (sql.includes('SET disconnect_requested_at=')) state.pending = true;
    else if (sql.includes('SET status=\'cancelled\'')) state.quoteCancelled = true;
    else if (sql.startsWith('UPDATE public.payment_requests')) state.invoiceCards = false;
    else if (sql.includes('UPDATE public.scrimmages')) state.scrimmageCards = false;
    else if (sql.includes('SET stripe_account_id=NULL')) {
      state.accountId = null; state.pending = false; state.key = params[2];
    } else throw new Error('Unexpected fixture query');
    return { rows: [], rowCount: 1 };
  }
  state.pool = { query, connect: async () => ({ query, release() {} }) };
  const env: Record<string, string> = { STRIPE_CONNECT_CLIENT_ID: 'ca_liveFixture' };
  const module = { exports: {} as any };
  const require = createRequire(import.meta.url);
  new vm.Script(bundle.outputFiles[0].text).runInNewContext({
    module, exports: module.exports, console, Buffer, URL, process: { env },
    require: (name: string) => name === 'unlink-state' ? { state } : require(name),
  });
  const stripe = {
    oauth: { deauthorize: async (params: any) => {
      state.stripeCalls++;
      assert.equal(params.stripe_user_id, 'acct_owner');
      assert.equal(params.client_id, 'ca_liveFixture');
      assert.equal(state.pending, true, 'Pause was committed before calling Stripe');
      assert.equal(state.invoiceCards, false);
      assert.equal(state.scrimmageCards, false);
      return { stripe_user_id: 'acct_owner' };
    } },
    accounts: { retrieve: async (_id: string): Promise<any> => { throw new Error('Unexpected account retrieval'); } },
  };
  return { state, env, stripe, ...module.exports };
}

test('unlink revokes access, disables card collection, preserves history and permits fresh setup', async () => {
  const f = fixture();
  await f.unlinkOrganizerStripe('owner', 'acct_owner', f.stripe);
  assert.equal(f.state.accountId, null);
  assert.equal(f.state.pending, false);
  assert.equal(f.state.quoteCancelled, true);
  assert.notEqual(f.state.key, 'original-key', 'A new onboarding request cannot reuse the old account-creation key');
  assert.equal(f.state.stripeCalls, 1);
  assert.ok(f.state.queryLog.every((sql: string) => !/\bDELETE\b|SET is_paid|SET role|UPDATE public.organizer_stripe_account_registry/i.test(sql)));
});

test('unlink rejects another account or another owner before making changes', async () => {
  for (const [user, account] of [['owner', 'acct_other'], ['other', 'acct_owner']]) {
    const f = fixture();
    if (user === 'other') {
      await f.unlinkOrganizerStripe(user, account, f.stripe);
    } else {
      await assert.rejects(f.unlinkOrganizerStripe(user, account, f.stripe), { code: 'stripe_connection_changed' });
    }
    assert.equal(f.state.stripeCalls, 0);
    assert.equal(f.state.accountId, 'acct_owner');
    assert.equal(f.state.invoiceCards, true);
  }
});

test('in-progress payments, refunds, or disputes prevent revocation and all mutations', async () => {
  const f = fixture();
  f.state.blocked = true;
  await assert.rejects(f.unlinkOrganizerStripe('owner', 'acct_owner', f.stripe), { code: 'stripe_unlink_payments_active' });
  assert.equal(f.state.pending, false);
  assert.equal(f.state.invoiceCards, true);
  assert.equal(f.state.stripeCalls, 0);
  const sql = f.state.queryLog.find((q: string) => q.includes('SELECT id FROM public.organizer_card_payments'))!;
  for (const text of ['processing', 'refund_pending', 'disputed', 'stripe_payment_intent_id', 'confirmation_started_at']) {
    assert.ok(sql.includes(text), text);
  }
});

test('missing Connect application ID fails explicitly without changing any account', async () => {
  const f = fixture();
  delete f.env.STRIPE_CONNECT_CLIENT_ID;
  await assert.rejects(f.unlinkOrganizerStripe('owner', 'acct_owner', f.stripe), { code: 'stripe_unlink_not_configured' });
  assert.equal(f.state.queryLog.length, 0);
  assert.equal(f.state.stripeCalls, 0);
});

test('an ambiguous Stripe failure leaves collection paused and provides an unlink retry', async () => {
  const f = fixture();
  f.stripe.oauth.deauthorize = async () => { throw new Error('timeout'); };
  await assert.rejects(f.unlinkOrganizerStripe('owner', 'acct_owner', f.stripe), { code: 'stripe_unlink_pending' });
  assert.equal(f.state.accountId, 'acct_owner');
  assert.equal(f.state.pending, true);
  assert.equal(f.state.invoiceCards, false);
  assert.equal(f.state.scrimmageCards, false);
  await assert.rejects(f.lockActiveDirectAccount(f.state.pool, 'owner', 'acct_owner'), { code: 'direct_account_unavailable' });
  const status = await f.readDirectAccount('owner', f.stripe);
  assert.equal(status.connected, true);
  assert.equal(status.ready, false);
  assert.equal(status.unlinkPending, true, 'Status remains readable after Stripe revocation');
});

test('retry can recover a confirmed prior revocation, but never infers success from another timeout', async () => {
  for (const verified of [false, true]) {
    const f = fixture();
    f.state.pending = true;
    f.stripe.oauth.deauthorize = async () => { throw { code: 'invalid_client' }; };
    f.stripe.accounts.retrieve = async () => { throw { code: verified ? 'account_invalid' : 'ETIMEDOUT' }; };
    if (verified) {
      await f.unlinkOrganizerStripe('owner', 'acct_owner', f.stripe);
      assert.equal(f.state.accountId, null);
    } else {
      await assert.rejects(f.unlinkOrganizerStripe('owner', 'acct_owner', f.stripe), { code: 'stripe_unlink_pending' });
      assert.equal(f.state.accountId, 'acct_owner');
    }
  }
});

test('already unlinked requests are idempotent and do not contact Stripe', async () => {
  const f = fixture();
  f.state.accountId = null;
  await f.unlinkOrganizerStripe('owner', 'acct_owner', f.stripe);
  assert.equal(f.state.stripeCalls, 0);
});
