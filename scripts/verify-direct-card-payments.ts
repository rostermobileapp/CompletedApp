/**
 * Real isolated PostgreSQL transactions with a deterministic Stripe fixture.
 * No Stripe API requests or charges. Never runs against the production database.
 */
import "../server/runtimeBootstrap";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build } from "esbuild";
import Stripe from "stripe";
import { pool } from "../server/db";
import { databaseEndpoint, getDatabaseConnectionString } from "../server/testDatabaseGuard";
import { loadOrganizerPaymentReport, organizerReportFilters } from "../server/organizerPaymentReport";

const organizer = randomUUID(), payer = randomUUID(), outsider = randomUUID();
const accountId = `acct_directfixture${randomUUID().replaceAll("-", "")}`;
const invoices: string[] = [];
const events: string[] = [];
const intents = new Map<string, any>(), charges = new Map<string, any>(), byKey = new Map<string, any>();
const tokens = new Map<string, any>(), disputes = new Map<string, any>();
let accountCreates = 0, intentCreates = 0, refundCreates = 0, committedRefunds = 0;
const account = {
  id: accountId, country: "US", type: "standard", details_submitted: true, charges_enabled: true, payouts_enabled: true,
  capabilities: { card_payments: "active", transfers: "active" }, requirements: { currently_due: [] },
  business_profile: { support_address: { state: "NY" } },
  controller: { losses: { payments: "stripe" }, fees: { payer: "account" },
    stripe_dashboard: { type: "full" }, requirement_collection: "stripe" },
};
const policy = { merchantCountry: "US", merchantState: "NY", customerStates: ["NY"], brands: ["visa"],
  processorRateBps: 290, processorFixedCents: 30, maximumSurchargeBps: 300,
  approvedUntil: new Date(Date.now() + 30 * 86400_000).toISOString() };
const fixtureEnv: Record<string, string> = {
  NONPRODUCTION_ISOLATED: "1", TESTING_STRIPE_SECRET_KEY: "sk_test_fixture_not_a_real_key",
  TESTING_STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET: "whsec_fixture", TESTING_STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_fixture",
  REPLIT_DEV_DOMAIN: "direct-fixture.invalid",
  ORGANIZER_DIRECT_SURCHARGE_POLICIES: JSON.stringify({ [accountId]: policy }),
};
function scoped(options: any) { assert.equal(options?.stripeAccount, accountId, "Every money read/write must have connected-account scope"); }
class FixtureStripe {
  static errors = Stripe.errors;
  accounts = {
    create: async (params: any, options: any) => {
      assert.equal(params.type, "standard"); assert.equal(params.capabilities.card_payments.requested, true);
      assert.ok(options.idempotencyKey); accountCreates++; return account;
    },
    retrieve: async (id: string) => { assert.equal(id, accountId); return account; },
  };
  accountLinks = { create: async (params: any) => {
    assert.equal(params.account, accountId); assert.equal(params.type, "account_onboarding");
    return { url: "https://connect.stripe.com/fixture" };
  } };
  confirmationTokens = { retrieve: async (id: string, _: any, options: any) => {
    scoped(options); assert.ok(tokens.has(id)); return tokens.get(id);
  } };
  paymentIntents = {
    create: async (params: any, options: any) => {
      scoped(options);
      assert.equal(params.transfer_data, undefined); assert.equal(params.application_fee_amount, undefined);
      assert.equal(params.currency, "usd"); assert.equal(params.confirm, true);
      if (byKey.has(options.idempotencyKey)) return byKey.get(options.idempotencyKey);
      const token = tokens.get(params.confirmation_token); assert.ok(token);
      if (params.amount_details?.surcharge) {
        assert.equal(options.apiVersion, "2026-03-25.preview");
        assert.equal(params.amount_details.surcharge.enforce_validation, "enabled");
      }
      intentCreates++;
      const id = `pi_fixture${randomUUID().replaceAll("-", "")}`;
      const chargeId = `ch_fixture${randomUUID().replaceAll("-", "")}`;
      const fee = Math.round(params.amount * 0.029) + 30;
      const intent = { id, status: "succeeded", client_secret: `${id}_secret_fixture`,
        amount: params.amount, amount_received: params.amount, currency: "usd",
        application_fee_amount: null, transfer_data: null, metadata: params.metadata,
        latest_charge: chargeId, amount_details: params.amount_details };
      intents.set(id, intent); byKey.set(options.idempotencyKey, intent);
      charges.set(chargeId, { id: chargeId, amount: params.amount, currency: "usd", paid: true,
        payment_intent: id, transfer: null, application_fee: null, metadata: params.metadata, amount_refunded: 0,
        balance_transaction: { amount: params.amount, currency: "usd", fee, net: params.amount - fee },
        receipt_url: "https://pay.stripe.com/receipts/fixture" });
      return intent;
    },
    retrieve: async (id: string, _: any, options: any) => { scoped(options); assert.ok(intents.has(id)); return intents.get(id); },
    cancel: async (id: string, _: any, options: any) => { scoped(options); const intent = intents.get(id); intent.status = "canceled"; return intent; },
  };
  charges = { retrieve: async (id: string, _: any, options: any) => { scoped(options); assert.ok(charges.has(id)); return charges.get(id); } };
  refunds = { create: async (params: any, options: any) => {
    scoped(options); assert.equal(params.reverse_transfer, undefined); assert.equal(params.refund_application_fee, undefined);
    const charge = charges.get(intents.get(params.payment_intent).latest_charge);
    assert.equal(params.amount, charge.amount - charge.amount_refunded);
    charge.amount_refunded += params.amount; refundCreates++;
    return { id: `re_fixture${refundCreates}`, status: "succeeded", amount: params.amount };
  } };
  disputes = { retrieve: async (id: string, _: any, options: any) => { scoped(options); return disputes.get(id); } };
  webhooks = { constructEvent: (body: Buffer, signature: string) => {
    assert.equal(signature, "fixture_signature"); return JSON.parse(body.toString());
  } };
}
const state = { pool, Stripe: FixtureStripe };
const handlers = new Map<string, Function>();
async function request(method: string, path: string, user: string, body: any = {}, params: any = {}) {
  const response = {
    statusCode: 200, body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(value: any) { this.body = value; return this; }, send(value: any) { this.body = value; return this; },
  };
  const handler = handlers.get(`${method} ${path}`); assert.ok(handler, path);
  await handler({ user: { claims: { sub: user } }, body, params, headers: { "stripe-signature": "fixture_signature" } }, response);
  return response;
}
async function webhook(intent: any, type = "payment_intent.succeeded", overrides: any = {}) {
  const id = `evt_fixture${randomUUID().replaceAll("-", "")}`; events.push(id);
  const event = { id, type, account: accountId, livemode: false,
    data: { object: type === "charge.refunded" ? charges.get(intent.latest_charge) : intent }, ...overrides };
  const response = await request("post", "/api/stripe-connect-webhook", "", Buffer.from(JSON.stringify(event)));
  assert.equal(response.statusCode, 200, JSON.stringify(response.body)); return event;
}
async function invoice() {
  const id = randomUUID(), recipient = randomUUID(); invoices.push(id);
  await pool.query(`INSERT INTO public.payment_requests(id,creator_id,title,amount_per_person,card_enabled)
    VALUES($1,$2,'Isolated direct payment verification',20,true)`, [id, organizer]);
  await pool.query(`INSERT INTO public.payment_request_recipients(id,payment_request_id,user_id)
    VALUES($1,$2,$3)`, [recipient, id, payer]);
  return { id, recipient };
}
async function quote(id: string, funding = "credit") {
  const tokenId = `ctoken_${randomUUID().replaceAll("-", "")}`;
  tokens.set(tokenId, { expires_at: Math.floor(Date.now() / 1000) + 3600,
    payment_method_preview: { type: "card", card: { funding, country: "US", brand: "visa" },
      billing_details: { address: { country: "US", state: "NY" } } } });
  const result = await request("post", "/api/organizer-card-payments/direct/quote", payer,
    { paymentRequestId: id, confirmationTokenId: tokenId, totalAmountCents: 1, processingSurchargeCents: 999999 });
  assert.equal(result.statusCode, 200, JSON.stringify(result.body)); return result.body;
}
async function confirm(q: any) {
  const result = await request("post", "/api/organizer-card-payments/direct/confirm", payer,
    { paymentId: q.paymentId, quoteId: q.quoteId, totalAmountCents: 1 });
  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  return intents.get((await pool.query("SELECT stripe_payment_intent_id FROM public.organizer_card_payments WHERE id=$1", [q.paymentId])).rows[0].stripe_payment_intent_id);
}
async function paidFlag(recipient: string) {
  return (await pool.query("SELECT is_paid,payment_method FROM public.payment_request_recipients WHERE id=$1", [recipient])).rows[0];
}

try {
  if (process.env.NODE_ENV !== "development" || process.env.NONPRODUCTION_ISOLATED !== "1") throw new Error("Isolated dev required");
  const endpoint = databaseEndpoint(getDatabaseConnectionString(process.env, process.argv));
  const project = new URL(process.env.DEV_SUPABASE_URL!).hostname.split(".")[0];
  assert.ok(endpoint.startsWith(`supabase:${project}/`));
  assert.ok(!JSON.parse(process.env.NONPRODUCTION_FORBIDDEN_DATABASES ?? "[]").includes(endpoint));
  for (const [id, role] of [[organizer,"commissioner"],[payer,"free_tier"],[outsider,"free_tier"]]) {
    await pool.query("INSERT INTO public.users(id,email,first_name,last_name,role) VALUES($1,$2,'Direct','Fixture',$3)",
      [id, `direct-${id}@example.invalid`, role]);
  }
  const bundle = await build({
    entryPoints: ["server/organizerCardPaymentRoutes.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "isolated-direct-finance", setup(b) {
      b.onResolve({ filter: /^direct-fixture-state$/ }, args => ({ path: args.path, external: true }));
      b.onResolve({ filter: /(^|\/)(db|runtimePolicy)$|^stripe$/ }, args => ({ path: args.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        contents: args.path === "stripe" ? "import {state} from 'direct-fixture-state'; export default state.Stripe;"
          : args.path.endsWith("runtimePolicy") ? "export const isVerifiedProductionRuntime=()=>false;"
          : "import {state} from 'direct-fixture-state'; export const pool=state.pool;",
      }));
    } }],
  });
  const module = { exports: {} as any }, require = createRequire(import.meta.url);
  new vm.Script(bundle.outputFiles[0].text).runInNewContext({
    module, exports: module.exports, Buffer, URL, console, setTimeout, process: { env: fixtureEnv },
    require: (name: string) => name === "direct-fixture-state" ? { state } : require(name),
  });
  const app = Object.fromEntries(["get","post"].map(method => [method,
    (path: string, ...callbacks: Function[]) => handlers.set(`${method} ${path}`, callbacks.at(-1)!)]));
  module.exports.registerOrganizerCardPaymentRoutes(app, () => {}, () => {}, async () => { committedRefunds++; });
  for (let i = 0; i < 2; i++) {
    const setup = await request("post", "/api/organizer-card-payments/connect/onboarding", organizer);
    assert.equal(setup.statusCode, 200, JSON.stringify(setup.body));
  }
  assert.equal(accountCreates, 1, "Onboarding retries reuse one Standard account");
  const privilege = await pool.query(`SELECT
    has_column_privilege('authenticated','public.organizer_card_payments','confirmation_token_id','SELECT') AS token,
    has_column_privilege('authenticated','public.organizer_card_payments','quote_id','SELECT') AS nonce,
    has_column_privilege('authenticated','public.organizer_card_payments','total_amount_cents','SELECT') AS total`);
  assert.deepEqual(privilege.rows[0], { token: false, nonce: false, total: true });

  const first = await invoice();
  assert.equal((await request("post", "/api/organizer-card-payments/direct/context", outsider, { paymentRequestId: first.id })).statusCode, 404);
  const q = await quote(first.id);
  assert.equal(q.processingSurchargeCents, 60); assert.equal(q.totalAmountCents, 2060);
  assert.equal((await request("post", "/api/organizer-card-payments/direct/confirm", payer,
    { paymentId: q.paymentId, quoteId: "tampered" })).statusCode, 409);
  assert.equal(intentCreates, 0);
  const [intent] = await Promise.all([confirm(q), confirm(q)]);
  assert.equal(intentCreates, 1, "Concurrent confirmations never create a second charge");
  await pool.query("UPDATE public.organizer_card_payments SET stripe_payment_intent_id=NULL WHERE id=$1", [q.paymentId]);
  const recovery = await request("post", "/api/organizer-card-payments/direct/context", payer, { paymentRequestId: first.id });
  assert.equal(recovery.body.resume.status, "confirmation_pending");
  assert.equal(recovery.body.resume.quoteId, q.quoteId);
  assert.equal((await confirm(q)).id, intent.id);
  assert.equal(intentCreates, 1, "Ambiguous confirmation is recovered with its original idempotency key");
  assert.equal((await paidFlag(first.recipient)).is_paid, false, "Client confirmation does not settle invoices");
  const foreign = await webhook(intent, "payment_intent.succeeded", { account: "acct_unrelated" });
  assert.equal((await paidFlag(first.recipient)).is_paid, false);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.stripe_connect_webhook_events WHERE event_id=$1", [foreign.id])).rows[0].n, 0);
  const platformEvent = { ...foreign, id: `evt_platform${randomUUID()}`, account: undefined };
  events.push(platformEvent.id);
  assert.equal((await request("post", "/api/stripe-card-payments-webhook", "", Buffer.from(JSON.stringify(platformEvent)))).statusCode, 200);
  assert.equal((await paidFlag(first.recipient)).is_paid, false, "Platform events cannot settle direct charges");
  const delivered = await webhook(intent);
  assert.equal((await paidFlag(first.recipient)).is_paid, true);
  await request("post", "/api/stripe-connect-webhook", "", Buffer.from(JSON.stringify(delivered)));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.stripe_connect_webhook_events WHERE event_id=$1", [delivered.id])).rows[0].n, 1);
  charges.get(intent.latest_charge).amount_refunded = 1000;
  await webhook(intent, "charge.refunded");
  assert.equal((await paidFlag(first.recipient)).is_paid, true, "Partial gross refund does not claim the invoice and surcharge were fully refunded");
  assert.equal((await request("post", "/api/organizer-card-payments/:paymentId/refund", organizer, {}, { paymentId: q.paymentId })).statusCode, 200);
  assert.equal(refundCreates, 1);
  assert.equal((await paidFlag(first.recipient)).is_paid, true, "Refund confirmation is webhook-authoritative");
  const refunded = await webhook(intent, "charge.refunded");
  assert.equal((await paidFlag(first.recipient)).is_paid, false);
  assert.equal(committedRefunds, 1);
  await pool.query("UPDATE public.payment_request_recipients SET is_paid=true,payment_method='cash' WHERE id=$1", [first.recipient]);
  await webhook(intent, "charge.refunded");
  assert.equal((await paidFlag(first.recipient)).payment_method, "cash", "Late refunds preserve replacement cash payments");
  assert.equal(committedRefunds, 1);

  const expired = await invoice(), expiredQuote = await quote(expired.id);
  await pool.query("UPDATE public.organizer_card_payments SET quote_expires_at=now()-interval '1 second' WHERE id=$1", [expiredQuote.paymentId]);
  assert.equal((await request("post", "/api/organizer-card-payments/direct/confirm", payer, expiredQuote)).statusCode, 409);
  const changed = await invoice(), changedQuote = await quote(changed.id);
  const originalPolicy = fixtureEnv.ORGANIZER_DIRECT_SURCHARGE_POLICIES;
  fixtureEnv.ORGANIZER_DIRECT_SURCHARGE_POLICIES = "{}";
  assert.equal((await request("post", "/api/organizer-card-payments/direct/confirm", payer, changedQuote)).statusCode, 409);
  fixtureEnv.ORGANIZER_DIRECT_SURCHARGE_POLICIES = originalPolicy;
  const debit = await invoice(), debitQuote = await quote(debit.id, "debit");
  assert.equal(debitQuote.processingSurchargeCents, 0); assert.equal(debitQuote.totalAmountCents, 2000);
  const debitIntent = await confirm(debitQuote); await webhook(debitIntent);
  const dispute = { id: `dp_fixture${randomUUID()}`, payment_intent: debitIntent.id, charge: debitIntent.latest_charge,
    amount: 2000, currency: "usd", status: "lost", balance_transactions: [{ amount: -2000, fee: 1500, net: -3500, currency: "usd" }] };
  disputes.set(dispute.id, dispute);
  await webhook(debitIntent, "charge.dispute.closed", { data: { object: dispute } });
  assert.equal((await paidFlag(debit.recipient)).is_paid, false);
  assert.equal((await request("post", "/api/organizer-card-payments/direct/context", payer, { paymentRequestId: debit.id })).statusCode, 200,
    "Lost disputes allow a legitimate replacement payment");
  await pool.query("UPDATE public.payment_request_recipients SET is_paid=true,payment_method='cash' WHERE id=$1", [debit.recipient]);
  await webhook(debitIntent, "charge.dispute.created", { data: { object: { ...dispute, status: "under_review" } } });
  assert.equal((await paidFlag(debit.recipient)).payment_method, "cash");

  const report = await loadOrganizerPaymentReport(pool as any, organizerReportFilters({}));
  const reported = report.payments.find((p: any) => p.id === q.paymentId);
  assert.equal(Number(reported.platform_net_cents), 0);
  assert.equal(Number(reported.organizer_proceeds_cents), -charges.get(intent.latest_charge).balance_transaction.fee);
  assert.equal(Number(reported.processing_surcharge_cents), 60);
  console.info(JSON.stringify({
    database: "isolated-development", stripe: "deterministic-fixture-no-network", productionWrites: 0, realCharges: 0,
    passed: ["Standard onboarding reuse","private quote columns","payer authorization","server fee totals","concurrent confirmation",
      "webhook-only settlement","connected-account isolation","platform-event rejection","event replay","partial and full surcharge refund",
      "replacement payment protection","quote expiry","fee policy revocation","debit no surcharge","lost dispute recovery","direct accounting",
      "ambiguous confirmation recovery"],
  }));
} catch (error: any) {
  console.error("Direct payment verification failed.", { name: error?.name,
    message: error?.message?.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]"),
    source: error?.stack?.split("\n").filter((line: string) => line.includes("verify-direct-card-payments.ts")).slice(0,2),
  });
  process.exitCode = 1;
} finally {
  if (process.env.NONPRODUCTION_ISOLATED === "1") {
    await pool.query("DELETE FROM public.stripe_connect_webhook_events WHERE event_id=ANY($1)", [events]).catch(() => {});
    await pool.query("DELETE FROM public.organizer_card_payments WHERE payment_request_id=ANY($1)", [invoices]).catch(() => {});
    await pool.query("DELETE FROM public.payment_request_recipients WHERE payment_request_id=ANY($1)", [invoices]).catch(() => {});
    await pool.query("DELETE FROM public.payment_requests WHERE id=ANY($1)", [invoices]).catch(() => {});
    await pool.query("DELETE FROM public.organizer_direct_accounts WHERE user_id=$1", [organizer]).catch(() => {});
    await pool.query("DELETE FROM public.organizer_stripe_account_registry WHERE user_id=$1", [organizer]).catch(() => {});
    await pool.query("DELETE FROM public.users WHERE id=ANY($1)", [[organizer,payer,outsider]]).catch(() => {});
  }
  await pool.end();
}
