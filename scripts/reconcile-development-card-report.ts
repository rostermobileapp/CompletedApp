import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { createCardPaymentSandbox } from "./lib/card-payment-sandbox";
import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";
import { organizerDisputeAccounting } from "../server/organizerDisputeAccounting";
import { loadOrganizerPaymentReport, organizerReportFilters, organizerReportCsv } from "../server/organizerPaymentReport";

let stage = "isolated development setup";
let sandbox: Awaited<ReturnType<typeof createCardPaymentSandbox>> | undefined;
const snapshotPath = "generated-artifacts/card-payment-failures/report-ledger-snapshot.json";
const settledStatuses = new Set(["paid", "refund_pending", "refunded", "disputed"]);

function expectedTotals(rows: any[]) {
  const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  return {
    payments_count: rows.length,
    unreconciled_count: 0,
    gross_volume_cents: sum("gross"),
    service_fees_cents: sum("fee"),
    application_fee_refunds_cents: sum("feeRefunded"),
    retained_service_fees_cents: sum("fee") - sum("feeRefunded"),
    processing_fees_cents: sum("processing"),
    organizer_gross_transfers_cents: sum("transfer"),
    organizer_transfers_cents: sum("transfer") - sum("reversed"),
    organizer_proceeds_cents: sum("transfer") - sum("reversed") - sum("fee") + sum("feeRefunded"),
    refunds_cents: sum("refunded"),
    transfer_reversals_cents: sum("reversed"),
    disputes_count: rows.filter(row => row.dispute).length,
    active_disputes_count: rows.filter(row => row.dispute &&
      !["won", "lost", "warning_closed"].includes(row.disputeStatus)).length,
    disputed_cents: sum("disputed"),
    dispute_fees_cents: sum("disputeFee"),
    dispute_withheld_cents: rows.reduce((total, row) =>
      total + Math.max(0, -(row.disputeNet ?? 0) - (row.disputeFee ?? 0)), 0),
    // Independent Stripe balance entries, not the report's fee formula.
    platform_net_cents: sum("platformLedgerNet"),
  };
}

function compare(report: any, rows: any[]) {
  for (const [key, expected] of Object.entries(expectedTotals(rows))) {
    assert.notEqual(report.summary[key], null, `${key} must be reconciled`);
    assert.equal(Number(report.summary[key]), expected, `Stripe ledger total: ${key}`);
  }
  assert.equal(report.payments.length, Math.min(rows.length, 5000));
}

async function main() {
  const s = sandbox = await createCardPaymentSandbox();
  const env = isolateDevelopmentEnvironment(process.env);
  const origin = `https://${env.REPLIT_DEV_DOMAIN}`;
  const queryable = { query: async (text: string, values: any[] = []) =>
    ({ rows: await s.sql.unsafe(text, values) }) };

  if (process.argv.includes("--repair")) {
    stage = "development report schema";
    await s.sql.unsafe(await readFile("migrations/0055_organizer_report_ledger.sql", "utf8"));
    stage = "Stripe TEST ledger comparison";
    const payments = await s.sql`
      SELECT p.*, CASE WHEN pr.related_scrimmage_id IS NOT NULL THEN 'scrimmage'
        WHEN pr.related_conversation_id IS NOT NULL THEN 'message' ELSE 'league_fee' END AS event_type
      FROM organizer_card_payments p JOIN payment_requests pr ON pr.id=p.payment_request_id
      ORDER BY p.created_at,p.id
    `;
    const audit: any[] = [];
    const balance = async (value: any) => {
      assert.ok(value, "Final Stripe balance transaction required");
      const entry = typeof value === "string" ? await s.stripe.balanceTransactions.retrieve(value) : value;
      assert.equal(entry.currency, "usd");
      assert.equal(entry.net, entry.amount - entry.fee);
      return entry;
    };
    for (const p of payments) {
      if (!p.stripe_charge_id) {
        assert.ok(!settledStatuses.has(p.status), "A settled payment must have a verified charge");
        audit.push({ id: p.id, eventType: p.event_type, createdAt: p.created_at });
        continue;
      }
      const charge: any = await s.stripe.charges.retrieve(p.stripe_charge_id, {
        expand: ["transfer", "application_fee", "balance_transaction"],
      });
      assert.equal(charge.livemode, false);
      assert.equal(charge.metadata.organizerCardPaymentId, p.id);
      assert.equal(charge.currency, "usd");
      assert.equal(charge.amount, p.total_amount_cents);
      const transfer = charge.transfer;
      const fee = charge.application_fee;
      assert.equal(typeof transfer, "object");
      assert.equal(typeof fee, "object");
      assert.equal(transfer.destination, p.stripe_account_id);
      assert.equal(transfer.amount, p.total_amount_cents);
      assert.equal(fee.amount, p.service_fee_cents);
      const chargeBalance = await balance(charge.balance_transaction);
      let ledgerNet = chargeBalance.net + (await balance(transfer.balance_transaction)).net
        + (await balance(fee.balance_transaction)).net;
      const refunds = await s.stripe.refunds.list({ charge: charge.id, limit: 100 });
      assert.equal(refunds.has_more, false, "Do not audit a truncated refund list");
      let refunded = 0;
      for (const refund of refunds.data) {
        if (refund.status !== "succeeded") continue;
        refunded += refund.amount;
        ledgerNet += (await balance(refund.balance_transaction)).net;
      }
      assert.equal(refunded, charge.amount_refunded);
      assert.equal(transfer.reversals.has_more, false);
      let reversed = 0;
      for (const reversal of transfer.reversals.data) {
        reversed += reversal.amount;
        ledgerNet += (await balance(reversal.balance_transaction)).net;
      }
      assert.equal(reversed, transfer.amount_reversed);
      assert.equal(fee.refunds.has_more, false);
      let feeRefunded = 0;
      for (const refund of fee.refunds.data) {
        feeRefunded += refund.amount;
        ledgerNet += (await balance(refund.balance_transaction)).net;
      }
      assert.equal(feeRefunded, fee.amount_refunded);
      const dispute = p.dispute_id ? await s.stripe.disputes.retrieve(p.dispute_id) : null;
      if (dispute) assert.equal(dispute.livemode, false);
      const disputed = dispute ? organizerDisputeAccounting(dispute) : null;
      if (disputed) ledgerNet += disputed.net;
      assert.equal(ledgerNet, fee.amount - feeRefunded - chargeBalance.fee + (disputed?.net ?? 0),
        "Independent platform balance entries must reconcile");
      audit.push({
        id: p.id, chargeId: charge.id, eventType: p.event_type, createdAt: p.created_at,
        gross: charge.amount, fee: fee.amount, feeRefunded, processing: chargeBalance.fee,
        transfer: transfer.amount, reversed, refunded, dispute: !!dispute,
        disputeStatus: dispute?.status, disputed: disputed?.amount, disputeFee: disputed?.fees,
        disputeNet: disputed?.net, disputeEntries: disputed?.entries ?? 0, platformLedgerNet: ledgerNet,
      });
    }
    stage = "repair verified development accounting";
    await s.sql.begin(async tx => {
      for (const row of audit.filter(row => row.chargeId)) {
        const changed = await tx`
          UPDATE organizer_card_payments SET
            transfer_amount_cents=${row.transfer}, transfer_reversed_cents=${row.reversed},
            stripe_processing_fee_cents=${row.processing}, refunded_amount_cents=${row.refunded},
            application_fee_refunded_cents=${row.feeRefunded},
            disputed_amount_cents=${row.disputed ?? null}, dispute_fee_cents=${row.disputeFee ?? null},
            dispute_balance_net_cents=${row.disputeNet ?? null},
            dispute_balance_transaction_count=${row.disputeEntries}, updated_at=now()
          WHERE id=${row.id} AND stripe_charge_id=${row.chargeId} RETURNING id
        `;
        assert.equal(changed.length, 1);
      }
    });
    compare(await loadOrganizerPaymentReport(queryable, organizerReportFilters({})), audit);
    await writeFile(snapshotPath, JSON.stringify({ createdAt: Date.now(), rows: audit }, null, 2));
    const endpoints = await s.stripe.webhookEndpoints.list({ limit: 30 });
    const endpoint = endpoints.data.find(endpoint => !endpoint.livemode &&
      endpoint.url === `${origin}/api/stripe-card-payments-webhook`);
    assert.ok(endpoint, "An existing isolated TEST webhook is required");
    const events = new Set(endpoint.enabled_events);
    if (!events.has("*")) {
      events.add("charge.dispute.funds_withdrawn");
      events.add("charge.dispute.funds_reinstated");
      await s.stripe.webhookEndpoints.update(endpoint.id, { enabled_events: [...events] });
    }
    console.log("[Report reconciliation] Verified Stripe TEST balance entries and repaired development accounting.",
      { charges: audit.filter(row => row.chargeId).length, totals: expectedTotals(audit) });
    return;
  }

  assert.ok(process.argv.includes("--verify"), "Use --repair or --verify");
  stage = "verified ledger snapshot";
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  assert.ok(Date.now() - snapshot.createdAt < 30 * 60_000, "Refresh the Stripe snapshot after 30 minutes");
  const rows = snapshot.rows as any[];
  compare(await loadOrganizerPaymentReport(queryable, organizerReportFilters({})), rows);
  stage = "approved development founder fixture";
  // This identity is explicitly approved for this separate development tenant.
  // Read the existing gate; never add a development bypass to application auth.
  const founderEmail = /const ADMIN_EMAIL = '([^']+)'/.exec(
    await readFile("client/src/pages/AdminOrganizerCardPayments.tsx", "utf8"))?.[1];
  assert.ok(founderEmail);
  const options = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } };
  const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, options);
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ifError(users.error);
  if (!users.data.users.some(user => user.email === founderEmail)) {
    const created = await admin.auth.admin.createUser({
      email: founderEmail, email_confirm: true,
      user_metadata: { first_name: "Development", last_name: "Founder", is_synthetic_fixture: true },
    });
    assert.ifError(created.error);
  }
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: founderEmail });
  assert.ifError(generated.error);
  assert.ok(generated.data.properties?.hashed_token);
  const verified = await createClient(env.SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, options).auth.verifyOtp({
    type: "magiclink", token_hash: generated.data.properties.hashed_token,
  });
  assert.ifError(verified.error);
  const session = verified.data.session;
  assert.ok(session);
  const account = await s.api(session.access_token, "/api/user");
  assert.equal(account.status, 200);
  if (!account.body.onboardingCompleted) {
    assert.equal(verified.data.user?.user_metadata?.is_synthetic_fixture, true);
    const onboarding = await s.api(session.access_token, "/api/user/onboarding", "PATCH", {
      firstName: "Development", lastName: "Founder", onboardingCompleted: true,
    });
    assert.equal(onboarding.status, 200);
    assert.equal(onboarding.body.onboardingCompleted, true);
  }
  const roles = await s.sql`SELECT id,role FROM users ORDER BY id`;
  const endpoint = "/api/admin/organizer-card-payments/report";
  for (const token of [s.organizer.access_token, s.payer.access_token]) {
    assert.equal((await s.api(token, endpoint)).status, 403);
  }
  assert.equal((await fetch(`${origin}${endpoint}`)).status, 401);
  stage = "missing accounting and provider webhook recovery";
  const disputes = await s.sql`
    SELECT DISTINCT ON (p.dispute_status) p.id,p.payment_request_id,p.recipient_id,p.dispute_id,
      p.stripe_charge_id,p.dispute_status
    FROM organizer_card_payments p JOIN payment_requests pr ON pr.id=p.payment_request_id
    WHERE p.dispute_id IS NOT NULL AND p.dispute_status IN ('won','lost')
      AND pr.creator_id=${s.organizer.user.id} AND pr.title LIKE 'Synthetic card dispute %'
    ORDER BY p.dispute_status,p.created_at DESC
  `;
  assert.equal(disputes.length, 2);
  const createdEvents = await s.stripe.events.list({ type: "charge.dispute.created", limit: 100 });
  for (const payment of disputes) {
    const expected = rows.find(row => row.id === payment.id);
    assert.ok(expected);
    const recipient = () => s.sql`
      SELECT is_paid,is_confirmed,payment_method,paid_at,confirmed_at
      FROM payment_request_recipients WHERE id=${payment.recipient_id}
    `;
    const originalRecipient = await recipient();
    const event = createdEvents.data.find(event => event.data.object.id === payment.dispute_id);
    assert.ok(event);
    try {
      await s.sql`UPDATE organizer_card_payments SET disputed_amount_cents=NULL,
        dispute_fee_cents=NULL,dispute_balance_net_cents=NULL,dispute_balance_transaction_count=0
        WHERE id=${payment.id}`;
      const incomplete = await s.api(session.access_token, endpoint);
      assert.equal(incomplete.status, 200);
      assert.equal(incomplete.body.summary.unreconciled_count, 1);
      assert.equal(incomplete.body.summary.platform_net_cents, null);
      assert.equal(incomplete.body.payments.find((row: any) => row.id === payment.id).platform_net_cents, null);
      await s.replay({ ...event, id: `evt_synthetic_report_${randomUUID()}` });
      compare((await s.api(session.access_token, endpoint)).body, rows);
      assert.deepEqual(await recipient(), originalRecipient);
      if (payment.dispute_status === "won") {
        const refundedEvents = await s.stripe.events.list({ type: "charge.refunded", limit: 100 });
        const refund = refundedEvents.data.find(event => event.data.object.id === payment.stripe_charge_id);
        assert.ok(refund);
        await s.replay({ ...refund, id: `evt_synthetic_report_refund_${randomUUID()}` });
        compare((await s.api(session.access_token, endpoint)).body, rows);
        assert.deepEqual(await recipient(), originalRecipient);
      }
    } finally {
      // Restore the already-verified ledger even if an assertion interrupts the check.
      await s.sql`UPDATE organizer_card_payments SET disputed_amount_cents=${expected.disputed},
        dispute_fee_cents=${expected.disputeFee},dispute_balance_net_cents=${expected.disputeNet},
        dispute_balance_transaction_count=${expected.disputeEntries} WHERE id=${payment.id}`;
    }
  }
  stage = "authenticated report totals and filters";
  const all = await s.api(session.access_token, endpoint);
  assert.equal(all.status, 200);
  compare(all.body, rows);
  for (const eventType of ["scrimmage", "league_fee", "message"]) {
    const response = await s.api(session.access_token, `${endpoint}?eventType=${eventType}`);
    assert.equal(response.status, 200);
    compare(response.body, rows.filter(row => row.eventType === eventType));
  }
  const dates = [...new Set(rows.map(row => new Date(row.createdAt).toISOString().slice(0, 10)))];
  for (const date of dates) {
    const response = await s.api(session.access_token, `${endpoint}?from=${date}&to=${date}`);
    assert.equal(response.status, 200);
    compare(response.body, rows.filter(row => new Date(row.createdAt).toISOString().slice(0, 10) === date));
  }
  for (const query of ["from=2026-02-30", "to=bad", "from=2030-01-02&to=2030-01-01", "eventType=other"]) {
    assert.equal((await s.api(session.access_token, `${endpoint}?${query}`)).status, 400);
  }
  const empty = await s.api(session.access_token, `${endpoint}?from=1970-01-01&to=1970-01-01`);
  assert.equal(empty.status, 200);
  compare(empty.body, []);
  stage = "authenticated CSV export";
  const csv = await fetch(`${origin}${endpoint}?format=csv`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type")!, /text\/csv/);
  const csvText = await csv.text();
  assert.equal(csvText, organizerReportCsv(all.body.payments));
  await writeFile(`${s.outputDir}/reconciled-founder-report.csv`, csvText);
  stage = "founder report desktop and phone";
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const [name, viewport] of [
      ["desktop", { width: 1440, height: 1100 }], ["phone", { width: 390, height: 844 }],
    ] as const) {
      stage = `founder report ${name} view`;
      const context = await browser.newContext({ viewport });
      const key = `sb-${new URL(env.SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
      await context.addInitScript(({ origin, key, session }) => {
        if (location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
      }, { origin, key, session });
      const page = await context.newPage();
      await page.goto(`${origin}/admin/organizer-card-payments`, { waitUntil: "domcontentloaded" });
      const metric = page.getByTestId("report-platform-net");
      await metric.waitFor({ timeout: 45_000 }).catch(async error => {
        await page.screenshot({ path: `${s.outputDir}/founder-report-${name}-failure.jpg`, fullPage: true });
        throw error;
      });
      const net = Number(all.body.summary.platform_net_cents);
      const displayed = `${net < 0 ? "-" : ""}$${(Math.abs(net) / 100).toFixed(2)}`;
      await page.getByTestId("report-platform-net").filter({ hasText: displayed }).waitFor({ timeout: 30_000 });
      if (name === "phone") {
        await metric.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.screenshot({ path: `${s.outputDir}/founder-report-${name}.jpg`, fullPage: true });
      if (name === "desktop") {
        stage = "founder CSV download in browser";
        const downloaded = page.waitForEvent("download");
        await page.getByTestId("export-organizer-payments").click();
        await (await downloaded).saveAs(`${s.outputDir}/founder-report-browser.csv`);
        assert.equal(await readFile(`${s.outputDir}/founder-report-browser.csv`, "utf8"), csvText);
      }
      await context.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(await s.sql`SELECT id,role FROM users ORDER BY id`, roles);
  console.log("[Report reconciliation] Founder-only APIs, ledger totals, filters, CSV and desktop/phone views passed.",
    { payments: rows.length, totals: all.body.summary });
}

main().catch(error => {
  console.error("[Report reconciliation] Stopped safely.", {
    stage, type: error?.name, code: error?.code ?? "",
    actual: typeof error?.actual === "number" ? error.actual : undefined,
    expected: typeof error?.expected === "number" ? error.expected : undefined,
  });
  process.exitCode = 1;
}).finally(async () => { await sandbox?.close(); });
