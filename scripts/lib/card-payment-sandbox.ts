import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright-core";
import postgres from "postgres";
import Stripe from "stripe";
import ws from "ws";
import { isolateDevelopmentEnvironment } from "../../server/nonproductionEnvironment";

export async function createCardPaymentSandbox() {
  const env = isolateDevelopmentEnvironment(process.env);
  assert.ok(env.TESTING_STRIPE_SECRET_KEY?.startsWith("sk_test_"));
  assert.equal(env.DATABASE_URL, env.DEV_DATABASE_URL);
  assert.equal(new URL(env.SUPABASE_URL!).origin, new URL(env.DEV_SUPABASE_URL!).origin);
  const origin = `https://${env.REPLIT_DEV_DOMAIN}`;
  const outputDir = "generated-artifacts/card-payment-failures";
  await mkdir(outputDir, { recursive: true });
  const sql = postgres(env.DEV_DATABASE_URL!, {
    max: 1, connect_timeout: 10, idle_timeout: 1,
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile(new URL("../../server/certs/supabase-ca.pem", import.meta.url), "utf8"),
    },
  });
  const stripe = new Stripe(env.TESTING_STRIPE_SECRET_KEY!);
  const browser = await chromium.launch({
    executablePath: "/repl/tools/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws },
  });
  async function login(email: string) {
    assert.ok(["commissioner@roster-dev.invalid", "player@roster-dev.invalid"].includes(email));
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
    assert.ok(generated.data.properties?.hashed_token);
    const verified = await admin.auth.verifyOtp({
      type: "magiclink", token_hash: generated.data.properties.hashed_token,
    });
    assert.ok(verified.data.session);
    return verified.data.session;
  }
  const organizer = await login("commissioner@roster-dev.invalid");
  const payer = await login("player@roster-dev.invalid");
  async function api(token: string, path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${origin}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function invoice(scenario: string) {
    const created = await api(organizer.access_token, "/api/payment-requests", "POST", {
      leagueId: "dev-league", title: `Synthetic card ${scenario}`, amountPerPerson: "20.00",
      recipientUserIds: [payer.user.id], placeholderPlayerIds: [], cardEnabled: true,
    });
    assert.equal(created.status, 200);
    return created.body.id as string;
  }
  async function payment(invoiceId: string) {
    const [row] = await sql`
      SELECT p.*,r.is_paid,r.is_confirmed,r.payment_method,r.paid_at,r.confirmed_at
      FROM organizer_card_payments p JOIN payment_request_recipients r ON r.id=p.recipient_id
      WHERE p.payment_request_id=${invoiceId} ORDER BY p.created_at DESC LIMIT 1
    `;
    return row;
  }
  async function checkout(invoiceId: string) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const storageKey = `sb-${new URL(env.SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
    await context.addInitScript(({ origin, storageKey, session }) => {
      if (location.origin === origin) localStorage.setItem(storageKey, JSON.stringify(session));
    }, { origin, storageKey, session: payer });
    const page = await context.newPage();
    await page.goto(`${origin}/payment-requests/${invoiceId}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("card-pay-by-card").waitFor({ timeout: 45_000 });
    const resume = page.getByTestId("button-resume-card-payment");
    if (await resume.isVisible()) await resume.click();
    else await page.getByTestId("button-pay-by-card").click();
    await page.getByTestId("stripe-checkout-modal").waitFor({ timeout: 30_000 });
    await field(page, 'input[name="cardNumber"],input[name="number"]');
    return { context, page };
  }
  async function replay(event: Stripe.Event) {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload, secret: env.TESTING_STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET!,
    });
    const response = await fetch(`${origin}/api/stripe-card-payments-webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    assert.equal(response.status, 200);
  }
  return {
    sql, stripe, organizer, payer, api, invoice, payment, checkout, replay, outputDir,
    close: async () => { await browser.close(); await sql.end({ timeout: 2 }); },
  };
}

export async function poll<T>(load: () => Promise<T>, ready: (value: T) => boolean, label: string) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const value = await load();
    if (ready(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out: ${label}`);
}

async function field(page: Page, selector: string, required = true) {
  for (let attempt = 0; attempt < (required ? 60 : 1); attempt++) {
    for (const frame of page.frames()) {
      const locator = frame.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    if (required) await page.waitForTimeout(250);
  }
  assert.equal(required, false, `Missing Stripe field: ${selector}`);
  return null;
}

export async function submitSandboxCard(page: Page, card: string) {
  assert.ok(["4000000000009995", "4242424242424242", "4061219946393810"].includes(card));
  const email = await field(page, 'input[name="email"]', false);
  if (email) await email.fill("player@roster-dev.invalid");
  await (await field(page, 'input[name="cardNumber"],input[name="number"]'))!.fill(card);
  await (await field(page, 'input[name="cardExpiry"],input[name="expiry"]'))!.fill("1230");
  await (await field(page, 'input[name="cardCvc"],input[name="cvc"]'))!.fill("123");
  const name = await field(page, 'input[name="billingName"],input[name="name"]', false);
  if (name) await name.fill("Synthetic Test Player");
  const zip = await field(page, 'input[name="billingPostalCode"],input[name="postalCode"],input[name="postal_code"]', false);
  if (zip) await zip.fill("10001");
  const link = await field(page, 'input[name="enableStripePass"]', false);
  if (link && await link.isChecked()) await link.uncheck();
  await (await field(page, 'button[type="submit"]'))!.click();
}

export async function checkoutText(page: Page) {
  return (await Promise.all(page.frames().map(frame =>
    frame.locator("body").innerText().catch(() => "")))).join("\n");
}
