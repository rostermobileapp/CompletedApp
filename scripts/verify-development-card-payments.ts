import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import ws from "ws";
import postgres from "postgres";
import Stripe from "stripe";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";

// This script intentionally does not import the application or bypass its auth.
// Sessions are generated only for the seeded synthetic development identities,
// used in memory, and never written into screenshots, logs, or fixture files.
const env = isolateDevelopmentEnvironment(process.env);
const origin = `https://${env.REPLIT_DEV_DOMAIN}`;
const authOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
};
const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, authOptions);
let stage = "synthetic login";

async function api(session: { access_token: string }, path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

async function fixtureSession(email: string) {
  assert.ok([
    "commissioner@roster-dev.invalid",
    "captain@roster-dev.invalid",
    "player@roster-dev.invalid",
  ].includes(email));
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw new Error("Could not generate synthetic login");
  const client = createClient(env.SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, authOptions);
  const verified = await client.auth.verifyOtp({
    type: "magiclink", token_hash: data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session) throw new Error("Could not verify synthetic login");
  return verified.data.session;
}

async function main() {
  const session = await fixtureSession("commissioner@roster-dev.invalid");
  const payer = await fixtureSession("player@roster-dev.invalid");
  const outsider = await fixtureSession("captain@roster-dev.invalid");
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const response = await fetch(`${origin}/api/organizer-card-payments/connect/status`, { headers });
  assert.equal(response.status, 200, "Authenticated organizer status must load");
  const status = await response.json();
  assert.equal(status.enabled, true, "Preview must be isolated, not live-data");
  assert.equal(status.webhookReady, true, "Both test signing secrets must be configured");
  console.log("[Card verification] Authenticated synthetic organizer and isolated card runtime verified.");

  stage = "real authorization and invoice APIs";
  assert.equal((await api(payer, "/api/organizer-card-payments/connect/onboarding", "POST", {})).status, 403);
  assert.equal((await api(outsider, "/api/admin/organizer-card-payments/report")).status, 403);
  const noAuth = await fetch(`${origin}/api/organizer-card-payments/connect/status`);
  assert.equal(noAuth.status, 401);
  for (const path of ["/api/stripe-card-payments-webhook", "/api/stripe-connect-webhook"]) {
    const badSignature = await fetch(`${origin}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "invalid" },
      body: JSON.stringify({ id: `evt_synthetic_${randomUUID()}`, livemode: false }),
    });
    assert.equal(badSignature.status, 400, "Invalid webhook signatures must be rejected");
  }

  const sql = postgres(env.DEV_DATABASE_URL!, {
    max: 1, connect_timeout: 10, idle_timeout: 1,
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile(new URL("../server/certs/supabase-ca.pem", import.meta.url), "utf8"),
    },
  });
  const syntheticPaymentId = `synthetic-verification:${randomUUID()}`;
  let invoiceId: string | undefined;
  try {
    const created = await api(session, "/api/payment-requests", "POST", {
      leagueId: "dev-league",
      title: "Synthetic sandbox verification",
      amountPerPerson: "20.00",
      recipientUserIds: [payer.user.id],
      placeholderPlayerIds: [],
      cardEnabled: false,
    });
    assert.equal(created.status, 200, "Manual methods must still support invoice creation");
    invoiceId = created.body.id;
    assert.ok(invoiceId);
    assert.equal((await api(outsider, `/api/payment-requests/${invoiceId}`)).status, 403);
    assert.equal((await api(payer, `/api/payment-requests/${invoiceId}`)).status, 200);
    const detail = await api(session, `/api/payment-requests/${invoiceId}`);
    const recipientId = detail.body.recipients.find((r: any) => r.userId === payer.user.id)?.id;
    assert.ok(recipientId);
    assert.equal((await api(payer, `/api/payment-request-recipients/${recipientId}`, "PATCH", {
      isPaid: true, paymentMethod: "stripe",
    })).status, 400, "The client cannot mark a manual payment as Stripe verified");
    assert.equal((await api(payer, `/api/payment-request-recipients/${recipientId}`, "PATCH", {
      isPaid: true, paymentMethod: "cash",
    })).status, 200);
    const paid = await api(session, `/api/payment-requests/${invoiceId}`);
    assert.equal(paid.body.recipients[0].isPaid, true);
    assert.equal(paid.body.recipients[0].paymentMethod, "cash");
    assert.equal((await api(payer, `/api/payment-request-recipients/${recipientId}`, "PATCH", {
      isPaid: false,
    })).status, 200);

    // A labeled synthetic pending record exercises API/UI concurrency guards,
    // not payment settlement. It never represents an actual Stripe charge.
    await sql`
      UPDATE payment_requests SET card_enabled=true WHERE id=${invoiceId}
    `;
    await sql`
      INSERT INTO organizer_card_payments (
        id,payment_request_id,recipient_id,payer_user_id,organizer_user_id,
        stripe_account_id,base_amount_cents,service_fee_cents,total_amount_cents,idempotency_key,status
      )
      SELECT ${syntheticPaymentId},${invoiceId},${recipientId},${payer.user.id},${session.user.id},
        stripe_account_id,2000,150,2150,${syntheticPaymentId},'pending'
      FROM stripe_connected_accounts WHERE user_id=${session.user.id}
    `;
    assert.equal((await api(payer, `/api/payment-request-recipients/${recipientId}`, "PATCH", {
      isPaid: true, paymentMethod: "cash",
    })).status, 409, "An active card attempt must block simultaneous manual settlement");
    assert.equal((await api(session, `/api/payment-requests/${invoiceId}`, "PATCH", {
      amountPerPerson: "30.00",
    })).status, 409, "An active card attempt must lock its invoice amount");
    assert.equal((await api(outsider, `/api/organizer-card-payments/requests/${invoiceId}`)).status, 403);
    if (!status.ready) {
      const blockedCharge = await api(payer, "/api/organizer-card-payments/checkout-session", "POST", {
        paymentRequestId: invoiceId,
      });
      assert.equal(blockedCharge.status, 409, "Unverified receiving accounts cannot collect card payments");
    }
    console.log("[Card verification] Real auth, manual methods, card spoofing, ownership and active-attempt safeguards passed.");

    stage = "connected-account webhook delivery";
    const [account] = await sql`SELECT stripe_account_id FROM stripe_connected_accounts WHERE user_id=${session.user.id}`;
    const stripe = new Stripe(env.TESTING_STRIPE_SECRET_KEY!);
    // Metadata changes reliably emit account.updated; not every editable
    // business-profile field does. Correlate the exact Stripe request so old
    // account events or unrelated deliveries cannot make this check pass.
    const updatedAccount = await stripe.accounts.update(account.stripe_account_id, {
      metadata: { rosterVerificationRun: randomUUID() },
    });
    const updateRequestId = updatedAccount.lastResponse.requestId;
    let delivered = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const events = await stripe.events.list(
        { type: "account.updated", limit: 5 },
        { stripeAccount: account.stripe_account_id },
      );
      const event = events.data.find(candidate => candidate.request?.id === updateRequestId);
      if (!event) continue;
      const [received] = await sql`
        SELECT count(*)::int AS count FROM stripe_connect_webhook_events
        WHERE event_id=${event.id} AND event_type='account.updated' AND processed_at IS NOT NULL
      `;
      if (received.count === 1) { delivered = true; break; }
    }
    console.log(delivered
      ? "[Card verification] Genuine Stripe connected-account event delivered and processed."
      : "[Card verification] PENDING: no genuine connected-account webhook arrived during this check.");

  stage = "browser launch";
  const browser = await chromium.launch({
    executablePath: "/repl/tools/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const storageKey = `sb-${new URL(env.SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
    await context.addInitScript(({ origin, storageKey, session }) => {
      if (location.origin === origin) localStorage.setItem(storageKey, JSON.stringify(session));
    }, { origin, storageKey, session });
    const page = await context.newPage();
    stage = "payment page navigation";
    await page.goto(`${origin}/payment-requests`, { waitUntil: "domcontentloaded" });
    await mkdir("generated-artifacts/card-payment-checks", { recursive: true });
    stage = "signed-in organizer setup";
    try {
      await page.getByTestId("card-organizer-card-setup").waitFor({ timeout: 45_000 });
    } catch {
      await page.screenshot({ path: "generated-artifacts/card-payment-checks/organizer-failure.jpg", fullPage: true });
      throw new Error("Organizer setup not rendered");
    }
    await page.screenshot({ path: "generated-artifacts/card-payment-checks/organizer-desktop.jpg", fullPage: true });
    console.log("[Card verification] Signed-in organizer payment setup rendered.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "generated-artifacts/card-payment-checks/organizer-mobile.jpg", fullPage: true });
    if (process.argv.includes("--onboarding")) {
      stage = "hosted Stripe onboarding";
      await page.getByTestId("button-connect-stripe").click();
      await page.waitForURL(url => url.hostname.endsWith(".stripe.com"), { timeout: 30_000 });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2500);
      const testPhone = page.getByText("Use test phone number", { exact: true });
      if (await testPhone.isVisible()) {
        await testPhone.click();
        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await page.waitForTimeout(2500);
      }
      if (await page.getByText("Too many attempts. Please try again later.", { exact: true }).isVisible()) {
        console.log("[Card verification] Stripe hosted test onboarding is rate-limited; no further automated attempts will be made.");
      }
      const controls = await page.locator("input,button,select").evaluateAll(elements => elements.map(element => ({
        tag: element.tagName,
        name: element.getAttribute("name"),
        placeholder: element.getAttribute("placeholder"),
        label: element.getAttribute("aria-label"),
        text: element.tagName === "BUTTON" ? element.textContent?.trim().slice(0, 90) : undefined,
      })));
      console.log("[Card verification] Hosted sandbox onboarding controls:", JSON.stringify(controls));
      await page.screenshot({ path: "generated-artifacts/card-payment-checks/stripe-onboarding.jpg", fullPage: true });
    }
    const payerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await payerContext.addInitScript(({ origin, storageKey, session }) => {
      if (location.origin === origin) localStorage.setItem(storageKey, JSON.stringify(session));
    }, { origin, storageKey, session: payer });
    const payerPage = await payerContext.newPage();
    await payerPage.goto(`${origin}/payment-requests/${invoiceId}`, { waitUntil: "domcontentloaded" });
    await payerPage.getByTestId("button-resume-card-payment").waitFor({ timeout: 45_000 });
    await payerPage.screenshot({ path: "generated-artifacts/card-payment-checks/payer-mobile.jpg", fullPage: true });
    console.log("[Card verification] Mobile payer can resume an existing attempt without starting another one.");
    await payerContext.close();
    await context.close();
    if (!delivered) process.exitCode = 1;
  } finally {
    await browser.close();
  }
  } finally {
    await sql`DELETE FROM organizer_card_payments WHERE id=${syntheticPaymentId} AND idempotency_key=${syntheticPaymentId}`;
    if (invoiceId) {
      await sql`DELETE FROM payment_request_recipients WHERE payment_request_id=${invoiceId}`;
      await sql`DELETE FROM payment_requests WHERE id=${invoiceId}`;
    }
    await sql.end({ timeout: 2 });
  }
}

main().catch(() => {
  // Provider/browser errors can contain signed onboarding URLs or session
  // credentials. Do not print them.
  console.error(`[Card verification] Failed at ${stage}. Inspect sanitized server logs and the generated test screenshots.`);
  process.exitCode = 1;
});
