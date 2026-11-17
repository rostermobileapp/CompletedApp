/** Signed-in browser fixtures only. No Stripe API requests, payments, or database writes. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createCardPaymentSandbox } from "./lib/card-payment-sandbox";
import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";

const sandbox = await createCardPaymentSandbox();
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const env = isolateDevelopmentEnvironment(process.env);
const origin = `https://${env.REPLIT_DEV_DOMAIN}`;
const output = "generated-artifacts/direct-checkout";
let stage = "initialization";
let lastPage: any;
let pageErrors: string[] = [];
try {
  await mkdir(output, { recursive: true });
  const [existing] = await sandbox.sql`
    SELECT p.payment_request_id FROM organizer_card_payments p JOIN payment_requests pr ON pr.id=p.payment_request_id
    WHERE p.payer_user_id=${sandbox.payer.user.id} AND pr.related_scrimmage_id IS NULL ORDER BY p.created_at DESC LIMIT 1`;
  assert.ok(existing);
  const id = existing.payment_request_id;
  const base = await sandbox.api(sandbox.payer.access_token, `/api/payment-requests/${id}`);
  assert.equal(base.status, 200);
  const results = [];
  for (const device of ["ios","android"] as const) {
    stage = `${device} session`;
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: device === "ios"
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Natively/iOS"
        : "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Natively/Android",
    });
    await context.addInitScript(({ origin, key, session }) => {
      Object.defineProperty(window, "__name", { value: new Function("value", "return value"), configurable: true });
      if (location.origin !== origin) return;
      localStorage.setItem(key, JSON.stringify(session));
      const counters = { token: 0, nextAction: 0 };
      (window as any).__directStripeFixture = counters;
      (window as any).Stripe = () => ({
        _registerWrapper() {}, registerAppInfo() {}, createToken() {}, createPaymentMethod() {}, confirmCardPayment() {},
        elements: () => ({
          submit: async () => ({}), update() {},
          create: (type: string) => {
            const listeners = new Map<string, Function>();
            let node: HTMLElement | null = null;
            return {
              on(name: string, callback: Function) { listeners.set(name, callback); },
              off() {}, update() {}, destroy() { node?.remove(); }, unmount() { node?.remove(); },
              mount(target: HTMLElement) {
                node = document.createElement("div");
                node.style.cssText = "padding:14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#334155;font-size:13px";
                node.textContent = type === "address" ? "Billing address fixture · New York, US" : "Card entry fixture · Visa credit";
                target.appendChild(node);
                setTimeout(() => {
                  listeners.get("ready")?.();
                  listeners.get("change")?.({ complete: true, value: {
                    name: "Test Player", address: { line1: "123 Test Street", city: "New York", state: "NY", postal_code: "10001", country: "US" },
                  } });
                }, 50);
              },
            };
          },
        }),
        createConfirmationToken: async () => { counters.token++; return { confirmationToken: { id: "ctoken_fixture123" } }; },
        handleNextAction: async () => { counters.nextAction++; return {}; },
      });
    }, { origin, key: `sb-${new URL(env.SUPABASE_URL!).hostname.split(".")[0]}-auth-token`, session: sandbox.payer });
    const page = await context.newPage();
    lastPage = page;
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    pageErrors = errors;
    let paid = false, surcharge = 60, status = "", confirms = 0, resumed = false;
    await page.route("https://api.stripe.com/**", route => route.abort());
    await page.route(`**/api/payment-requests/${id}`, route => route.fulfill({ json: {
      ...base.body, title: "Direct payment verification",
      recipients: base.body.recipients.map((r: any) => r.userId === sandbox.payer.user.id
        ? { ...r, isPaid: paid, isConfirmed: false, paymentMethod: paid ? "stripe" : null, paidAt: paid ? new Date().toISOString() : null } : r),
    } }));
    await page.route(`**/api/organizer-card-payments/requests/${id}`, route => route.fulfill({ json: {
      enabled: true, paymentFlow: "direct", cardEnabled: true, webhookReady: true, baseAmountCents: 2000, serviceFeeCents: 0, totalAmountCents: 2000,
      payments: status ? [{ id: "fixture_payment", payerUserId: sandbox.payer.user.id, organizerUserId: sandbox.organizer.user.id,
        paymentFlow: "direct", status, baseAmountCents: 2000, processingSurchargeCents: surcharge, totalAmountCents: 2000 + surcharge,
        refundedAmountCents: 0, disputeStatus: null }] : [],
    } }));
    await page.route("**/api/organizer-card-payments/direct/context", route => route.fulfill({ json: {
      stripeAccountId: "acct_fixture", baseAmountCents: 2000, currency: "usd",
      ...(resumed ? { resume: { paymentId: "fixture_payment", quoteId: "fixture_quote", status: "confirmation_pending",
        clientSecret: null, totalAmountCents: 2060 } } : {}),
    } }));
    await page.route("**/api/organizer-card-payments/direct/quote", route => route.fulfill({ json: {
      paymentId: "fixture_payment", quoteId: "fixture_quote", baseAmountCents: 2000, processingSurchargeCents: surcharge,
      totalAmountCents: 2000 + surcharge, expiresAt: new Date(Date.now() + 600000).toISOString(),
      feeExplanation: surcharge ? "The organizer covers remaining processing costs." : "No player surcharge applies. The organizer covers processing costs.",
    } }));
    await page.route("**/api/organizer-card-payments/direct/confirm", async route => {
      confirms++; status = "processing";
      assert.deepEqual(route.request().postDataJSON(), { paymentId: "fixture_payment", quoteId: "fixture_quote" });
      await route.fulfill({ json: { paymentId: "fixture_payment", clientSecret: "pi_fixture_secret_fixture", status: "requires_action" } });
    });
    stage = `${device} disclosed surcharge`;
    await page.goto(`${origin}/payment-requests/${id}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-pay-by-card").click({ timeout: 45000 });
    await page.getByText("Card entry fixture · Visa credit", { exact: true }).waitFor();
    await page.waitForTimeout(120);
    await page.getByRole("button", { name: "Review total", exact: true }).click();
    await page.getByTestId("direct-review-total").waitFor();
    assert.equal(await page.getByTestId("direct-review-total").innerText(), "$20.60");
    assert.equal(confirms, 0, "Review cannot charge the player");
    await page.screenshot({ path: `${output}/${device}-review.jpg` });
    await page.getByTestId("direct-confirm-payment").click();
    await page.getByRole("heading", { name: "Verification pending" }).waitFor();
    assert.equal(confirms, 1);
    assert.equal(await page.evaluate(() => (window as any).__directStripeFixture.nextAction), 1);
    assert.notEqual(await page.getByTestId(`status-pill-${id}`).innerText(), "Paid");
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
    stage = `${device} interrupted confirmation recovery`;
    resumed = true;
    await page.getByTestId("button-resume-card-payment").click();
    await page.getByRole("button", { name: "Continue verification", exact: true }).click();
    await page.getByText("Verification pending. Stripe has not yet confirmed this payment as paid.").waitFor();
    assert.equal(confirms, 2);
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
    paid = true; status = "paid";
    await page.waitForFunction((id: string) => document.querySelector(`[data-testid="status-pill-${id}"]`)?.textContent === "Paid", id, { timeout: 18000 });
    stage = `${device} zero surcharge`;
    paid = false; status = ""; surcharge = 0; resumed = false;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("button-pay-by-card").click({ timeout: 45000 });
    await page.getByText("Card entry fixture · Visa credit", { exact: true }).waitFor();
    await page.waitForTimeout(120);
    await page.getByRole("button", { name: "Review total", exact: true }).click();
    assert.equal(await page.getByTestId("direct-review-total").innerText(), "$20.00");
    assert.equal(await page.getByTestId("direct-fee-amount").innerText(), "$0.00");
    await page.screenshot({ path: `${output}/${device}-no-surcharge.jpg` });
    assert.deepEqual(errors, []);
    results.push({ device, separateFeeApproval: true, bankVerification: "fixture", interruptedConfirmationRecovery: true,
      serverSettlementRefresh: true, zeroSurcharge: true, realStripeRequests: 0 });
    await context.close();
  }
  console.info(JSON.stringify({ results, actualInstalledDeviceVerified: false, productionWrites: 0, realCharges: 0 }));
} catch (error: any) {
  await lastPage?.screenshot({ path: `${output}/failure.jpg` }).catch(() => {});
  console.error("Direct checkout browser fixture failed.", { stage, message: error?.message, pageErrors,
    dialog: await lastPage?.getByRole("dialog").innerText().catch(() => "unavailable") });
  process.exitCode = 1;
} finally { await browser.close(); await sandbox.close(); }
