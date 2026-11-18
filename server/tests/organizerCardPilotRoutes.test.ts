import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

test('production pilot separates onboarding from collection without bypassing runtime safety', async () => {
  const ids: Record<string, string> = {
    first: 'U00001', second: 'U00002', blocked: 'U00003', pro: 'U00004',
    secondary: 'U00005', free: 'U00006', exempt: 'U00007', grantedPro: 'U00008',
  };
  const state = {
    stripeCalls: 0, writes: 0, onboardingCalls: 0, accountReady: false,
    pool: {
      async query(text: string, params: string[] = []) {
        if (text.includes('SELECT display_id, role, fee_exempt')) {
          return { rows: ids[params[0]] ? [{
            display_id: ids[params[0]],
            role: ({ pro: 'player_pro', grantedPro: 'player_pro', secondary: 'secondary_commissioner', free: 'free_tier' } as Record<string, string>)[params[0]] ?? 'commissioner',
            fee_exempt: ['first', 'exempt', 'grantedPro'].includes(params[0]),
          }] : [] };
        }
        if (text.includes('SELECT display_id')) {
          return { rows: ids[params[0]] ? [{ display_id: ids[params[0]] }] : [] };
        }
        if (text.includes('SELECT stripe_account_id')) return { rows: [] };
        if (text.includes('SELECT pr.id,pr.creator_id')) return { rows: [{
          id: 'invoice', creator_id: 'blocked', display_id: 'U00003', role: 'commissioner',
          fee_exempt: false, amount_per_person: '20.00', card_enabled: true,
          recipient_id: 'recipient', is_paid: false,
        }] };
        throw new Error('Unexpected database query');
      },
      async connect() {
        return {
          release() {},
          async query(text: string) {
            if (/^\s*(BEGIN|ROLLBACK|COMMIT)\s*$/.test(text)) return { rows: [] };
            if (text.includes('SELECT pr.id AS payment_request_id')) return { rows: [{
              creator_id: 'blocked', organizer_display_id: 'U00003',
              payment_request_id: 'invoice', card_enabled: true, is_paid: false,
              recipient_id: 'recipient', recipient_user_id: 'first', amount_per_person: '20.00',
            }] };
            state.writes++;
            throw new Error('Unexpected financial write');
          },
        };
      },
    },
  };
  const bundle = await build({
    entryPoints: ['server/organizerCardPaymentRoutes.ts'],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{
      name: 'production-pilot-fixtures',
      setup(build) {
        build.onResolve({ filter: /^pilot-test-state$/ }, args => ({
          path: args.path, external: true,
        }));
        build.onResolve({ filter: /(^|\/)(db|runtimePolicy|organizerDirectAccounts)$|^stripe$/ }, args => ({
          path: args.path, namespace: 'pilot-fixture',
        }));
        build.onLoad({ filter: /.*/, namespace: 'pilot-fixture' }, args => ({
          contents: args.path === 'stripe'
            ? `import {state} from 'pilot-test-state'; export default class Stripe { constructor(){state.stripeCalls++;} }`
            : args.path.endsWith('organizerDirectAccounts')
              ? `import {state} from 'pilot-test-state';
                 export const readDirectAccount = async () => ({
                   connected:state.accountReady, accountId:null, ready:state.accountReady, detailsSubmitted:state.accountReady,
                   chargesEnabled:false, transfersEnabled:false, payoutsEnabled:false, currentlyDue:[]
                 });
                 export const onboardDirectAccount = async () => {
                   state.onboardingCalls++;
                   return {url:'https://connect.stripe.com/setup/synthetic-'+state.onboardingCalls};
                 };`
            : args.path.endsWith('runtimePolicy')
              ? 'export const isVerifiedProductionRuntime = () => true;'
              : `import {state} from 'pilot-test-state'; export const pool=state.pool;`,
        }));
      },
    }],
  });
  const module = { exports: {} as any };
  const require = createRequire(import.meta.url);
  const env: Record<string, string> = {
    ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED: '1',
    ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED: '1',
    STRIPE_SECRET_KEY: 'sk_live_synthetic_not_a_real_key',
    STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET: 'whsec_fixture',
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_fixture',
    FRONTEND_URL: 'https://example.test',
  };
  new vm.Script(bundle.outputFiles[0].text).runInNewContext({
    module, exports: module.exports, console, Buffer, URL,
    require: (name: string) => name === 'pilot-test-state' ? { state } : require(name),
    process: { env },
  });
  const handlers = new Map<string, Function>();
  const app = Object.fromEntries(['get', 'post'].map(method => [
    method, (path: string, ...callbacks: Function[]) => handlers.set(`${method} ${path}`, callbacks.at(-1)!),
  ]));
  module.exports.registerOrganizerCardPaymentRoutes(app, () => {}, () => {}, async () => {});
  async function request(method: string, path: string, sub: string | null) {
    const response = {
      statusCode: 200, body: null as any,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    const req = {
      user: { claims: { sub, displayId: 'U00001', role: 'commissioner' } },
      body: { paymentRequestId: 'invoice', displayId: 'U00001', organizerUserId: 'first' },
      params: { requestId: 'invoice', scrimmageId: 'scrimmage', paymentId: 'payment' },
    };
    await handlers.get(`${method} ${path}`)!(req, response);
    return response;
  }
  for (const user of ['blocked', 'missing']) {
    for (const path of [
      '/api/organizer-card-payments/requests/:requestId',
      '/api/organizer-card-payments/scrimmages/:scrimmageId/settings',
    ]) {
      const result = await request('get', path, user);
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.enabled, false);
    }
    for (const path of [
      '/api/organizer-card-payments/checkout-session',
      '/api/organizer-card-payments/:paymentId/refund',
      '/api/organizer-card-payments/direct/context',
      '/api/organizer-card-payments/direct/quote',
      '/api/organizer-card-payments/direct/confirm',
    ]) assert.equal((await request('post', path, user)).statusCode, 403);
  }
  assert.equal(state.stripeCalls, 0);
  assert.equal(state.writes, 0);
  for (const user of ['first', 'second']) {
    const result = await request('get', '/api/organizer-card-payments/connect/status', user);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.enabled, true);
    assert.equal(result.body.eligible, true, 'The founder can collect while remaining fee-exempt');
  }
  for (const user of ['blocked', 'pro', 'secondary', 'exempt', 'grantedPro']) {
    const result = await request('get', '/api/organizer-card-payments/connect/status', user);
    assert.equal(result.body.onboardingEnabled, true);
    assert.equal(result.body.eligible, true);
    assert.equal(result.body.enabled, false, 'Broad onboarding does not expand the collection pilot');
  }
  // Even an allowed payer cannot start a transaction for a non-pilot organizer.
  const retiredCheckout = await request('post', '/api/organizer-card-payments/checkout-session', 'first');
  assert.equal(retiredCheckout.statusCode, 409);
  assert.equal(retiredCheckout.body.code, 'direct_checkout_required');
  const blockedOrganizer = await request('post', '/api/organizer-card-payments/direct/context', 'first');
  assert.equal(blockedOrganizer.statusCode, 403);
  assert.equal(blockedOrganizer.body.code, 'card_pilot_restricted');
  assert.equal(state.writes, 0);
  assert.equal((await request('get', '/api/organizer-card-payments/connect/status', null)).statusCode, 401);

  // Preparing onboarding must not turn on collection, even for the founder.
  delete env.ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED;
  for (const value of [undefined, '0', 'true']) {
    if (value === undefined) delete env.ORGANIZER_DIRECT_ONBOARDING_LIVE_ENABLED;
    else env.ORGANIZER_DIRECT_ONBOARDING_LIVE_ENABLED = value;
    const status = await request('get', '/api/organizer-card-payments/connect/status', 'first');
    assert.equal(status.body.enabled, false);
    assert.equal(status.body.onboardingEnabled, false);
    const setup = await request('post', '/api/organizer-card-payments/connect/onboarding', 'first');
    assert.equal(setup.statusCode, 503);
    assert.equal(setup.body.code, 'direct_onboarding_disabled');
  }
  assert.equal(state.onboardingCalls, 0);
  state.accountReady = true;
  const completedWithCollectionOff = await request('get', '/api/organizer-card-payments/connect/status', 'pro');
  assert.equal(completedWithCollectionOff.body.ready, true, 'Completed setup remains authoritative while onboarding and collection are disabled');
  assert.equal(completedWithCollectionOff.body.enabled, false);
  assert.equal(completedWithCollectionOff.body.onboardingEnabled, false);
  state.accountReady = false;
  env.ORGANIZER_DIRECT_ONBOARDING_LIVE_ENABLED = '1';
  for (const user of ['first', 'second', 'blocked', 'pro', 'secondary', 'exempt', 'grantedPro']) {
    const status = await request('get', '/api/organizer-card-payments/connect/status', user);
    assert.equal(status.body.enabled, false);
    assert.equal(status.body.onboardingEnabled, true);
    assert.equal(status.body.eligible, true);
    const setup = await request('post', '/api/organizer-card-payments/connect/onboarding', user);
    assert.equal(setup.statusCode, 200);
    assert.match(setup.body.url, /^https:\/\/connect\.stripe\.com\/setup\/synthetic-/);
    for (const path of ['context', 'quote', 'confirm']) {
      const payment = await request('post', `/api/organizer-card-payments/direct/${path}`, user);
      const pilot = ['first', 'second'].includes(user);
      assert.equal(payment.statusCode, pilot ? 503 : 403);
      assert.equal(payment.body.code, pilot ? 'direct_payments_disabled' : 'card_pilot_restricted');
    }
  }
  for (const user of ['free', 'missing']) {
    const status = await request('get', '/api/organizer-card-payments/connect/status', user);
    assert.equal(status.body.onboardingEnabled, false);
    assert.equal(status.body.eligible, false);
    const setup = await request('post', '/api/organizer-card-payments/connect/onboarding', user);
    assert.equal(setup.statusCode, 403);
    assert.equal(setup.body.code, 'subscription_required');
  }
  assert.equal((await request('post', '/api/organizer-card-payments/connect/onboarding', null)).statusCode, 401);
  assert.equal(state.onboardingCalls, 7);
  assert.equal(state.writes, 0, 'No invoice or payment ledger writes during onboarding-only requests');

  delete env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const missingWebhook = await request('get', '/api/organizer-card-payments/connect/status', 'first');
  assert.equal(missingWebhook.body.onboardingEnabled, true, 'Receiving-account setup can precede webhook readiness');
  assert.equal(missingWebhook.body.webhookReady, false);
  assert.equal(missingWebhook.body.enabled, false);

  // The original runtime and key safety gates remain mandatory.
  delete env.ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED;
  assert.equal((await request('post', '/api/organizer-card-payments/connect/onboarding', 'first')).body.code, 'payments_disabled');
  env.ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED = '1';
  env.STRIPE_SECRET_KEY = 'sk_test_fixture';
  assert.equal((await request('post', '/api/organizer-card-payments/connect/onboarding', 'first')).body.code, 'stripe_not_ready');
  assert.equal(state.onboardingCalls, 7);
});
