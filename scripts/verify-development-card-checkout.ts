import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import Stripe from "stripe";
import postgres from "postgres";
import { chromium, type Page } from "playwright-core";
import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";

// Genuine Stripe TEST transactions only. No auth bypass and no real card data.
// Only public fixture identifiers persist; sessions and client secrets stay in memory.
const env = isolateDevelopmentEnvironment(process.env);
const origin = `https://${env.REPLIT_DEV_DOMAIN}`;
const outputDir = "generated-artifacts/card-payment-checks";
const scrimmageTest = process.argv.includes("--scrimmage");
const statePath = `${outputDir}/${scrimmageTest ? "scrimmage" : "checkout"}-fixture.json`;
let stage = "synthetic login";

async function login(email: string) {
  assert.ok(["commissioner@roster-dev.invalid", "player@roster-dev.invalid", "captain@roster-dev.invalid"].includes(email));
  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws },
  });
  const generated = await client.auth.admin.generateLink({ type: "magiclink", email });
  assert.ok(generated.data.properties?.hashed_token);
  const verified = await client.auth.verifyOtp({
    type: "magiclink", token_hash: generated.data.properties.hashed_token,
  });
  assert.ok(verified.data.session);
  return verified.data.session;
}

async function api(token: string, path: string, method = "GET", body?: unknown) {
  const result = await fetch(`${origin}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: result.status, body: await result.json() };
}

async function field(page: Page, selector: string) {
  for (const frame of page.frames()) {
    const candidate = frame.locator(selector).first();
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function main() {
  const organizer = await login("commissioner@roster-dev.invalid");
  const payer = await login("player@roster-dev.invalid");
  const stripe = new Stripe(env.TESTING_STRIPE_SECRET_KEY!);
  const sql = postgres(env.DEV_DATABASE_URL!, {
    max: 1, connect_timeout: 10, idle_timeout: 1,
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile(new URL("../server/certs/supabase-ca.pem", import.meta.url), "utf8"),
    },
  });
  const browser = await chromium.launch({
    executablePath: "/repl/tools/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    await mkdir(outputDir, { recursive: true });
    stage = "verified receiving account";
    const account = await api(organizer.access_token, "/api/organizer-card-payments/connect/status");
    assert.equal(account.status, 200);
    assert.equal(account.body.ready, true);
    let invoiceId: string;
    let scrimmageId: string | null = null;
    let backupUserId: string | null = null;
    const scrimmageEvidence: Record<string, unknown>[] = [];
    async function scrimmageSnapshot(phase: string) {
      const [state] = await sql`
        SELECT COALESCE(sr.status::text,'not_on_roster') AS admission_status, sr.backup_position,
               rr.is_paid, rr.is_confirmed, rr.payment_method,
               rr.paid_at IS NOT NULL AS has_paid_timestamp,
               rr.confirmed_at IS NOT NULL AS has_confirmed_timestamp
        FROM payment_requests pr
        JOIN payment_request_recipients rr ON rr.payment_request_id=pr.id
        LEFT JOIN scrimmage_requests sr ON sr.scrimmage_id=pr.related_scrimmage_id AND sr.player_id=rr.user_id
        WHERE pr.related_scrimmage_id=${scrimmageId} AND rr.user_id=${payer.user.id}
      `;
      assert.ok(state);
      const view = await api(organizer.access_token, `/api/payment-requests/${invoiceId}`);
      assert.equal(view.status, 200);
      const visibleRecipient = view.body.recipients.find((recipient: any) => recipient.userId === payer.user.id);
      assert.ok(visibleRecipient);
      assert.equal(visibleRecipient.isPaid, state.is_paid);
      assert.equal(visibleRecipient.isConfirmed, state.is_confirmed);
      scrimmageEvidence.push({ phase, ...state });
      await writeFile(`${outputDir}/scrimmage-results.json`, JSON.stringify({
        invoiceId, scrimmageId, states: scrimmageEvidence,
      }, null, 2));
      return state;
    }
    if (process.argv.includes("--resume")) {
      const saved = JSON.parse(await readFile(statePath, "utf8"));
      invoiceId = saved.invoiceId;
      scrimmageId = saved.scrimmageId ?? null;
      backupUserId = saved.backupUserId ?? null;
      const [fixture] = await sql`
        SELECT id FROM payment_requests
        WHERE id=${invoiceId} AND creator_id=${organizer.user.id}
          AND (title='Synthetic genuine card checkout' OR
            related_scrimmage_id IN (
              SELECT id FROM scrimmages WHERE id=${scrimmageId}
              AND creator_id=${organizer.user.id} AND title LIKE 'Synthetic card scrimmage %'
            ))
      `;
      assert.ok(fixture, "Only the synthetic checkout fixture can be resumed");
    } else if (scrimmageTest) {
      stage = "card-enabled first-to-pay scrimmage creation";
      const secondPlayer = await login("captain@roster-dev.invalid");
      backupUserId = secondPlayer.user.id;
      const created = await api(organizer.access_token, "/api/scrimmages", "POST", {
        leagueId: "dev-league", title: `Synthetic card scrimmage ${randomUUID()}`,
        dateTime: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19),
        location: "Synthetic development rink", maxPlayers: 2,
        costPerPlayer: "20.00", joinMode: "first_pay", cardPaymentEnabled: true,
        inviteUserIds: [payer.user.id, secondPlayer.user.id],
      });
      assert.equal(created.status, 201);
      scrimmageId = created.body.id;
      // Outbound email/push stays disabled in development. Seed only the
      // delivered-invitation state of this validated synthetic fixture so the
      // real authenticated RSVP can run. This does not test invite delivery.
      const invitationFixture = await sql`
        UPDATE scrimmages SET invite_sent_at=now()
        WHERE id=${scrimmageId} AND creator_id=${organizer.user.id}
          AND title LIKE 'Synthetic card scrimmage %'
        RETURNING id
      `;
      assert.equal(invitationFixture.length, 1);
      stage = "player joins and receives the scrimmage invoice";
      const joined = await api(payer.access_token, `/api/scrimmages/${scrimmageId}/requests`, "POST", {});
      assert.equal(joined.status, 201);
      assert.equal(joined.body.status, "pending");
      const [request] = await sql`
        SELECT id,card_enabled FROM payment_requests
        WHERE related_scrimmage_id=${scrimmageId} AND creator_id=${organizer.user.id}
      `;
      assert.ok(request);
      assert.equal(request.card_enabled, true);
      invoiceId = request.id;
      await writeFile(statePath, JSON.stringify({ invoiceId, scrimmageId, backupUserId }, null, 2));
      const initial = await scrimmageSnapshot("joined_before_payment");
      assert.equal(initial.is_paid, false);
      assert.equal(initial.is_confirmed, false);
      assert.equal(initial.admission_status, "pending");
      const secondJoin = await api(secondPlayer.access_token,
        `/api/scrimmages/${scrimmageId}/requests`, "POST", {});
      assert.equal(secondJoin.status, 201);
      const [{ invoice_count, recipient_count }] = await sql`
        SELECT COUNT(DISTINCT pr.id)::int AS invoice_count, COUNT(rr.id)::int AS recipient_count
        FROM payment_requests pr JOIN payment_request_recipients rr ON rr.payment_request_id=pr.id
        WHERE pr.related_scrimmage_id=${scrimmageId}
      `;
      assert.equal(invoice_count, 1);
      assert.equal(recipient_count, 2);
      console.log("[Scrimmage test] Real scrimmage creation and RSVP produced one card-enabled unpaid invoice.");
    } else {
      stage = "card-enabled invoice creation";
      const created = await api(organizer.access_token, "/api/payment-requests", "POST", {
        leagueId: "dev-league", title: "Synthetic genuine card checkout",
        amountPerPerson: "20.00", recipientUserIds: [payer.user.id],
        placeholderPlayerIds: [], cardEnabled: true,
      });
      assert.equal(created.status, 200);
      invoiceId = created.body.id;
      await writeFile(statePath, JSON.stringify({ invoiceId }, null, 2));
    }
    const beforeRoles = await sql`SELECT id,role FROM users WHERE id IN (${organizer.user.id},${payer.user.id}) ORDER BY id`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const storageKey = `sb-${new URL(env.SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
    await context.addInitScript(({ origin, storageKey, session }) => {
      if (location.origin === origin) localStorage.setItem(storageKey, JSON.stringify(session));
    }, { origin, storageKey, session: payer });
    const page = await context.newPage();
    stage = "payer checkout UI";
    await page.goto(`${origin}/payment-requests/${invoiceId}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("card-pay-by-card").waitFor({ timeout: 45_000 });
    const continueButton = page.getByTestId("button-resume-card-payment");
    if (await continueButton.isVisible()) await continueButton.click();
    else await page.getByTestId("button-pay-by-card").click();
    await page.getByTestId("stripe-checkout-modal").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `${outputDir}/checkout-open.jpg`, fullPage: true });
    const [payment] = await sql`
      SELECT * FROM organizer_card_payments WHERE payment_request_id=${invoiceId}
      ORDER BY created_at DESC LIMIT 1
    `;
    assert.ok(payment?.stripe_checkout_session_id);
    assert.equal(payment.total_amount_cents, 2150);
    assert.equal(payment.service_fee_cents, 150);
    const same = await api(payer.access_token, "/api/organizer-card-payments/checkout-session", "POST", {
      paymentRequestId: invoiceId, totalAmountCents: 1,
    });
    assert.equal(same.status, 200);
    assert.equal(same.body.paymentId, payment.id);
    assert.equal(same.body.totalAmountCents, 2150, "The client cannot override the server total");
    console.log("[Checkout test] Real embedded session created; repeat checkout reused it; server enforced $21.50 total.");

    if (!process.argv.includes("--pay")) {
      const controls = [];
      for (const frame of page.frames()) {
        controls.push(await frame.locator("input,select,button").evaluateAll(elements =>
          elements.filter(e => (e as HTMLElement).offsetWidth > 0).map(e => ({
            tag: e.tagName, name: e.getAttribute("name"),
            placeholder: e.getAttribute("placeholder"), label: e.getAttribute("aria-label"),
            text: e.tagName === "BUTTON" ? e.textContent?.trim().slice(0, 60) : undefined,
          })),
        ).catch(() => []));
      }
      console.log("[Checkout test] Visible control descriptors:", JSON.stringify(controls));
      return;
    }

    stage = "Stripe test card entry";
    const email = await field(page, 'input[name="email"]');
    assert.ok(email);
    await email.fill("player@roster-dev.invalid");
    const number = await field(page, 'input[name="cardNumber"],input[name="number"]');
    assert.ok(number, "Stripe card entry must be rendered");
    await number.fill("4242424242424242");
    const expiry = await field(page, 'input[name="cardExpiry"],input[name="expiry"]');
    assert.ok(expiry);
    await expiry.fill("1230");
    const cvc = await field(page, 'input[name="cardCvc"],input[name="cvc"]');
    assert.ok(cvc);
    await cvc.fill("123");
    const name = await field(page, 'input[name="billingName"],input[name="name"]');
    if (name) await name.fill("Jenny Rosen");
    const zip = await field(page, 'input[name="billingPostalCode"],input[name="postalCode"],input[name="postal_code"]');
    if (zip) await zip.fill("10001");
    const saveWithLink = await field(page, 'input[name="enableStripePass"]');
    if (saveWithLink && await saveWithLink.isChecked()) await saveWithLink.uncheck();
    const submit = await field(page, 'button[type="submit"]');
    assert.ok(submit);
    stage = "test card submission";
    await submit.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${outputDir}/checkout-after-submit.jpg`, fullPage: true });

    stage = "genuine payment webhook settlement";
    let settled: any;
    for (let attempt = 0; attempt < 30; attempt++) {
      [settled] = await sql`
        SELECT p.*,r.is_paid,r.payment_method,r.paid_at FROM organizer_card_payments p
        JOIN payment_request_recipients r ON r.id=p.recipient_id WHERE p.id=${payment.id}
      `;
      if (settled.status === "paid") break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(settled.status, "paid");
    assert.equal(settled.is_paid, true);
    assert.equal(settled.payment_method, "stripe");
    assert.ok(settled.paid_at);
    assert.ok(settled.receipt_url);
    const intent = await stripe.paymentIntents.retrieve(settled.stripe_payment_intent_id);
    assert.equal(intent.livemode, false);
    assert.equal(intent.amount_received, 2150);
    assert.equal(intent.application_fee_amount, 150);
    assert.equal(intent.transfer_data?.destination, settled.stripe_account_id);
    assert.ok(settled.stripe_transfer_id);
    assert.ok(settled.stripe_application_fee_id);
    assert.ok(Number.isInteger(settled.stripe_processing_fee_cents));
    const actualTransfer = await stripe.transfers.retrieve(settled.stripe_transfer_id);
    assert.equal(settled.transfer_amount_cents, actualTransfer.amount);
    const actualFee = await stripe.applicationFees.retrieve(settled.stripe_application_fee_id);
    assert.equal(actualTransfer.amount - actualFee.amount, 2000);
    console.log("[Checkout test] Genuine Stripe TEST payment settled the invoice; base $20, fee $1.50; receipt recorded.");

    if (scrimmageTest) {
      stage = "scrimmage organizer paid list and admission";
      const paid = await scrimmageSnapshot("stripe_payment_succeeded");
      assert.equal(paid.is_paid, true);
      assert.equal(paid.payment_method, "stripe");
      console.log("[Scrimmage test] Stripe settlement appeared as paid in the organizer's real invoice response.");
      if (paid.admission_status === "pending") {
        assert.equal(paid.is_confirmed, false);
        assert.equal((await api(payer.access_token,
          `/api/payment-request-recipients/${payment.recipient_id}/confirm`, "PATCH",
          { isConfirmed: true })).status, 403);
        const confirmation = await api(organizer.access_token,
          `/api/payment-request-recipients/${payment.recipient_id}/confirm`, "PATCH",
          { isConfirmed: true });
        assert.equal(confirmation.status, 200);
        const admitted = await scrimmageSnapshot("organizer_confirms_payment");
        assert.equal(admitted.admission_status, "approved");
        assert.equal(admitted.is_confirmed, true);
        console.log("[Scrimmage test] Admission still requires organizer confirmation; confirmation approved the paid player.");
      }
      stage = "normal paid backup queue setup";
      assert.ok(backupUserId);
      // Use the existing manual-payment APIs for the other synthetic players;
      // only the primary player needs another genuine Stripe TEST transaction.
      assert.equal((await api(organizer.access_token,
        `/api/scrimmages/${scrimmageId}/requests`, "POST", {})).status, 201);
      for (const userId of [organizer.user.id, backupUserId]) {
        const [recipient] = await sql`
          SELECT id FROM payment_request_recipients
          WHERE payment_request_id=${invoiceId} AND user_id=${userId}
        `;
        assert.ok(recipient);
        assert.equal((await api(organizer.access_token,
          `/api/payment-request-recipients/${recipient.id}`, "PATCH",
          { isPaid: true, paymentMethod: "cash" })).status, 200);
        assert.equal((await api(organizer.access_token,
          `/api/payment-request-recipients/${recipient.id}/confirm`, "PATCH",
          { isConfirmed: true })).status, 200);
      }
      const [backup] = await sql`
        SELECT status,backup_position FROM scrimmage_requests
        WHERE scrimmage_id=${scrimmageId} AND player_id=${backupUserId}
      `;
      assert.equal(backup.status, "backup");
      assert.equal(backup.backup_position, 1);
      console.log("[Scrimmage test] Normal payment confirmation filled the roster and queued the next paid backup.");
    }

    stage = "database RLS isolation";
    const outsider = await login("captain@roster-dev.invalid");
    const rest = async (token: string | null, table: string, query: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method,
        headers: {
          apikey: env.VITE_SUPABASE_ANON_KEY!,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const filter = `select=id&id=eq.${payment.id}`;
    const ownerRead = await rest(organizer.access_token, "organizer_card_payments", filter);
    const payerRead = await rest(payer.access_token, "organizer_card_payments", filter);
    const outsiderRead = await rest(outsider.access_token, "organizer_card_payments", filter);
    assert.equal(ownerRead.status, 200);
    assert.equal(ownerRead.body.length, 1);
    assert.equal(payerRead.body.length, 1);
    assert.deepEqual(outsiderRead.body, []);
    assert.ok([401, 403].includes((await rest(null, "organizer_card_payments", filter)).status));
    assert.equal((await rest(payer.access_token, "organizer_card_payments", `id=eq.${payment.id}`,
      "PATCH", { status: "refunded" })).status, 403);
    assert.equal((await rest(payer.access_token, "stripe_connect_webhook_events", "select=event_id&limit=1")).status, 403);
    console.log("[Checkout test] Real Supabase RLS allowed payer/organizer reads and rejected outsiders, anonymous reads and direct writes.");

    if (scrimmageTest) {
      stage = "organizer refund consequence disclosure";
      const organizerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await organizerContext.addInitScript(({ origin, storageKey, session }) => {
        if (location.origin === origin) localStorage.setItem(storageKey, JSON.stringify(session));
      }, { origin, storageKey, session: organizer });
      const organizerPage = await organizerContext.newPage();
      await organizerPage.goto(`${origin}/payment-requests/${invoiceId}`, { waitUntil: "domcontentloaded" });
      const refundButton = organizerPage.getByRole("button", { name: "Refund invoice amount", exact: true });
      await refundButton.waitFor({ timeout: 45_000 });
      await refundButton.click();
      const dialog = organizerPage.getByRole("alertdialog");
      const disclosure = await dialog.innerText();
      assert.match(disclosure, /refund \$20\.00/);
      assert.match(disclosure, /roster spot and promotes the next eligible backup/);
      await organizerPage.screenshot({
        path: `${outputDir}/scrimmage-refund-confirmation-mobile.jpg`, fullPage: true,
      });
      await organizerContext.close();
      console.log("[Scrimmage test] Phone refund confirmation disclosed the $20 refund, spot release and backup promotion.");
    }

    stage = "invoice-only refund and transfer reversal";
    assert.equal((await api(payer.access_token, `/api/organizer-card-payments/${payment.id}/refund`, "POST", {})).status, 404);
    const refund = await api(organizer.access_token, `/api/organizer-card-payments/${payment.id}/refund`, "POST", {});
    assert.equal(refund.status, 200);
    let refunded: any;
    for (let attempt = 0; attempt < 30; attempt++) {
      [refunded] = await sql`
        SELECT p.*,r.is_paid FROM organizer_card_payments p
        JOIN payment_request_recipients r ON r.id=p.recipient_id WHERE p.id=${payment.id}
      `;
      if (refunded.status === "refunded") break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(refunded.status, "refunded");
    assert.equal(refunded.is_paid, false);
    if (scrimmageTest) {
      const returned = await scrimmageSnapshot("invoice_refunded");
      assert.equal(returned.is_paid, false);
      assert.equal(returned.payment_method, null);
      assert.equal(returned.is_confirmed, false);
      assert.equal(returned.has_confirmed_timestamp, false);
      assert.equal(returned.admission_status, "not_on_roster");
      let backup: any;
      for (let attempt = 0; attempt < 30; attempt++) {
        [backup] = await sql`
          SELECT status,backup_position FROM scrimmage_requests
          WHERE scrimmage_id=${scrimmageId} AND player_id=${backupUserId}
        `;
        if (backup.status === "approved") break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      assert.equal(backup.status, "approved");
      assert.equal(backup.backup_position, null);
      console.log("[Scrimmage test] Confirmed refund cleared payment confirmation, removed the player and promoted backup #1.");
    }
    assert.equal(refunded.transfer_reversed_cents, 2000);
    assert.equal(refunded.refunded_amount_cents, 2000);
    assert.ok(refunded.refund_id);
    const stripeRefund = await stripe.refunds.retrieve(refunded.refund_id);
    assert.equal(stripeRefund.amount, 2000);
    assert.equal(stripeRefund.status, "succeeded");
    assert.ok(stripeRefund.transfer_reversal);
    const refundedTransfer = await stripe.transfers.retrieve(settled.stripe_transfer_id);
    const retainedFee = await stripe.applicationFees.retrieve(settled.stripe_application_fee_id);
    assert.equal(refundedTransfer.amount_reversed, 2000);
    assert.equal(refundedTransfer.amount - refundedTransfer.amount_reversed - retainedFee.amount, 0);
    assert.equal(retainedFee.amount_refunded, 0);
    assert.equal((await api(organizer.access_token, `/api/organizer-card-payments/${payment.id}/refund`, "POST", {})).status, 200);
    stage = "duplicate and reordered signed webhook replay";
    const successEvents = await stripe.events.list({ type: "payment_intent.succeeded", limit: 20 });
    const success = successEvents.data.find(event =>
      (event.data.object as Stripe.PaymentIntent).metadata.organizerCardPaymentId === payment.id);
    assert.ok(success);
    const replay = async (event: Stripe.Event) => {
      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload, secret: env.TESTING_STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET!,
      });
      const response = await fetch(`${origin}/api/stripe-card-payments-webhook`, {
        method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": signature },
        body: payload,
      });
      assert.equal(response.status, 200);
    };
    // Signed test replays use Stripe-generated data but are not claimed to be
    // genuine provider redeliveries. The alias represents a distinct late event.
    await replay(success);
    await replay({ ...success, id: `evt_synthetic_late_${randomUUID()}` });
    if (scrimmageTest) {
      // A new RSVP after the refund must survive even distinct, concurrent late
      // refund events for the old card transaction.
      const rejoin = await api(payer.access_token,
        `/api/scrimmages/${scrimmageId}/requests`, "POST", {});
      assert.equal(rejoin.status, 201);
      assert.equal(rejoin.body.status, "pending");
      assert.equal((await api(organizer.access_token,
        `/api/payment-request-recipients/${payment.recipient_id}`, "PATCH",
        { isPaid: true, paymentMethod: "cash" })).status, 200);
      assert.equal((await api(organizer.access_token,
        `/api/payment-request-recipients/${payment.recipient_id}/confirm`, "PATCH",
        { isConfirmed: true })).status, 200);
      const rosterBeforeReplay = await sql`
        SELECT player_id,status,backup_position,approved_at
        FROM scrimmage_requests WHERE scrimmage_id=${scrimmageId} ORDER BY player_id
      `;
      const refundEvents = await stripe.events.list({ type: "charge.refunded", limit: 20 });
      const refundEvent = refundEvents.data.find(event =>
        (event.data.object as Stripe.Charge).payment_intent === settled.stripe_payment_intent_id);
      assert.ok(refundEvent);
      await replay(refundEvent);
      await Promise.all([1, 2].map(() => replay({
        ...refundEvent, id: `evt_synthetic_refund_replay_${randomUUID()}`,
      })));
      assert.deepEqual(await sql`
        SELECT player_id,status,backup_position,approved_at
        FROM scrimmage_requests WHERE scrimmage_id=${scrimmageId} ORDER BY player_id
      `, rosterBeforeReplay);
      const repaid = await scrimmageSnapshot("fresh_repayment_survived_late_refund_replays");
      assert.equal(repaid.is_paid, true);
      assert.equal(repaid.is_confirmed, true);
      assert.equal(repaid.payment_method, "cash");
      assert.equal(repaid.admission_status, "backup");
      console.log("[Scrimmage test] Concurrent refund replays preserved the fresh RSVP/manual repayment and did not promote another backup.");
    }
    const [afterReplay] = await sql`
      SELECT p.status,r.is_paid FROM organizer_card_payments p
      JOIN payment_request_recipients r ON r.id=p.recipient_id WHERE p.id=${payment.id}
    `;
    assert.equal(afterReplay.status, "refunded");
    assert.equal(afterReplay.is_paid, scrimmageTest);
    const roles = await sql`SELECT id,role FROM users WHERE id IN (${organizer.user.id},${payer.user.id}) ORDER BY id`;
    assert.deepEqual(roles, beforeRoles, "Fee payments and refunds must never change subscription roles");
    console.log("[Checkout test] $20 invoice refund and $20 reversal verified; $1.50 fee retained; organizer net zero; subscription roles unchanged.");
    console.log("[Checkout test] Repeated refund request and duplicate/late success events did not create another refund or re-pay the invoice.");
  } finally {
    await browser.close();
    await sql.end({ timeout: 2 });
  }
}

main().catch(() => {
  console.error(`[Checkout test] Failed at ${stage}. No provider error is printed because it may contain checkout credentials.`);
  process.exitCode = 1;
});
