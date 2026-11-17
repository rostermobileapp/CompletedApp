import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

test('production handlers deny non-pilot accounts before Stripe or financial writes', async () => {
  const ids: Record<string, string> = { first: 'U00001', second: 'U00002', blocked: 'U00003' };
  const state = {
    stripeCalls: 0, writes: 0,
    pool: {
      async query(text: string, params: string[] = []) {
        if (text.includes('SELECT display_id, role, fee_exempt')) {
          return { rows: ids[params[0]] ? [{
            display_id: ids[params[0]], role: 'commissioner', fee_exempt: params[0] === 'first',
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
        build.onResolve({ filter: /(^|\/)(db|runtimePolicy)$|^stripe$/ }, args => ({
          path: args.path, namespace: 'pilot-fixture',
        }));
        build.onLoad({ filter: /.*/, namespace: 'pilot-fixture' }, args => ({
          contents: args.path === 'stripe'
            ? `import {state} from 'pilot-test-state'; export default class Stripe { constructor(){state.stripeCalls++;} }`
            : args.path.endsWith('runtimePolicy')
              ? 'export const isVerifiedProductionRuntime = () => true;'
              : `import {state} from 'pilot-test-state'; export const pool=state.pool;`,
        }));
      },
    }],
  });
  const module = { exports: {} as any };
  const require = createRequire(import.meta.url);
  new vm.Script(bundle.outputFiles[0].text).runInNewContext({
    module, exports: module.exports, console, Buffer,
    require: (name: string) => name === 'pilot-test-state' ? { state } : require(name),
    process: { env: {
      ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED: '1',
      ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED: '1',
      STRIPE_SECRET_KEY: 'sk_live_synthetic_not_a_real_key',
      STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET: 'whsec_fixture',
      STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_fixture',
    } },
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
      '/api/organizer-card-payments/connect/status',
      '/api/organizer-card-payments/requests/:requestId',
      '/api/organizer-card-payments/scrimmages/:scrimmageId/settings',
    ]) {
      const result = await request('get', path, user);
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.enabled, false);
    }
    for (const path of [
      '/api/organizer-card-payments/connect/onboarding',
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
  // Even an allowed payer cannot start a transaction for a non-pilot organizer.
  const retiredCheckout = await request('post', '/api/organizer-card-payments/checkout-session', 'first');
  assert.equal(retiredCheckout.statusCode, 409);
  assert.equal(retiredCheckout.body.code, 'direct_checkout_required');
  const blockedOrganizer = await request('post', '/api/organizer-card-payments/direct/context', 'first');
  assert.equal(blockedOrganizer.statusCode, 403);
  assert.equal(blockedOrganizer.body.code, 'card_pilot_restricted');
  assert.equal(state.writes, 0);
  assert.equal((await request('get', '/api/organizer-card-payments/connect/status', null)).statusCode, 401);
});
