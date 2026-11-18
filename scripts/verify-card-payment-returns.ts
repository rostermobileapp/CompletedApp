/**
 * Read-only development data + browser response fixtures. No Checkout creation,
 * charges, refunds, production access, or auth bypasses.
 *
 * env -u PREVIEW_USE_LIVE_SECRETS NODE_ENV=development npx tsx scripts/verify-card-payment-returns.ts
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import { createCardPaymentSandbox, poll } from './lib/card-payment-sandbox';
import { isolateDevelopmentEnvironment } from '../server/nonproductionEnvironment';

const output = 'generated-artifacts/native-return-fixes';
const agents = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Natively/iOS',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Natively/Android',
};
const env = isolateDevelopmentEnvironment(process.env);
const origin = `https://${env.REPLIT_DEV_DOMAIN}`;
const sandbox = await createCardPaymentSandbox();
const browser = await chromium.launch({
  executablePath: '/repl/tools/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results: object[] = [];
let stage = 'development fixtures';

async function foreground(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function authenticatedContext(session: typeof sandbox.payer, agent: keyof typeof agents) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, userAgent: agents[agent],
  });
  const key = `sb-${new URL(env.SUPABASE_URL!).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({ origin, key, session }) => {
    if (location.origin !== origin) return;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('roster.mobile.lastScreen', JSON.stringify({
      userId: session.user.id, path: '/profile', savedAt: Date.now(),
    }));
  }, { origin, key, session });
  return context;
}

try {
  await mkdir(output, { recursive: true });
  const [{ count: chargesBefore }] = await sandbox.sql`
    SELECT COUNT(*)::int AS count FROM organizer_card_payments WHERE stripe_charge_id IS NOT NULL
  `;
  const beforeRoles = await sandbox.sql`SELECT id, role FROM users ORDER BY id`;
  const [fixture] = await sandbox.sql`
    SELECT p.payment_request_id FROM organizer_card_payments p
    JOIN payment_requests pr ON pr.id=p.payment_request_id
    WHERE p.payer_user_id=${sandbox.payer.user.id} AND pr.related_scrimmage_id IS NULL
    ORDER BY p.created_at DESC LIMIT 1
  `;
  assert.ok(fixture, 'An existing synthetic invoice is required');
  const id = fixture.payment_request_id as string;
  const invoice = await sandbox.api(sandbox.payer.access_token, `/api/payment-requests/${id}`);
  const card = await sandbox.api(sandbox.payer.access_token, `/api/organizer-card-payments/requests/${id}`);
  const setup = await sandbox.api(sandbox.organizer.access_token, '/api/organizer-card-payments/connect/status');
  for (const response of [invoice, card, setup]) assert.equal(response.status, 200);

  for (const agent of ['ios', 'android'] as const) {
    stage = `${agent} delayed settlement and refund`;
    const context = await authenticatedContext(sandbox.payer, agent);
    const page = await context.newPage();
    let status = 'processing', invoicePaid = false, invoiceReads = 0, cardReads = 0;
    let paymentMethod = 'stripe';
    let holdNextInvoice = false;
    let releaseInvoice: (() => void) | undefined;
    await page.route(`**/api/payment-requests/${id}`, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      invoiceReads++;
      // Snapshot when the request starts, as a DB read before settlement would.
      const data = structuredClone(invoice.body);
      data.title = 'Native return refresh verification';
      data.recipients = data.recipients.map((recipient: any) =>
        recipient.userId === sandbox.payer.user.id ? {
          ...recipient, isPaid: invoicePaid, isConfirmed: false,
          paymentMethod: invoicePaid ? paymentMethod : null,
          paidAt: invoicePaid ? new Date().toISOString() : null, confirmedAt: null,
        } : recipient);
      if (holdNextInvoice) {
        holdNextInvoice = false;
        await new Promise<void>(resolve => { releaseInvoice = resolve; });
      }
      await route.fulfill({ json: data });
    });
    await page.route(`**/api/organizer-card-payments/requests/${id}`, async route => {
      cardReads++;
      await route.fulfill({ json: {
        ...card.body, enabled: true, cardEnabled: true, webhookReady: true,
        payments: card.body.payments.map((payment: any) => ({
          ...payment, status, disputeStatus: null, receiptUrl: null,
          refundedAmountCents: status === 'refunded' ? 2000 : 0,
        })),
      } });
    });
    const target = `${origin}/payment-requests/${id}?checkout_session_id=cs_test_fixture_not_payment_proof`;
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('button-resume-card-payment').waitFor({ timeout: 45_000 });
    await page.waitForTimeout(400);
    assert.equal(page.url(), target, 'An explicit invoice must beat the saved profile');
    const initialReads = invoiceReads;
    // Simulate completion after the modal's first refresh, with no focus event.
    status = 'paid';
    invoicePaid = true;
    await poll(async () => invoiceReads, count => count > initialReads, 'invoice refresh after settlement');
    await poll(() => page.getByTestId(`status-pill-${id}`).innerText(), text => text === 'Paid', 'paid invoice flag');
    assert.equal(await page.getByTestId('button-pay-by-card').count(), 0);
    await page.screenshot({ path: `${output}/${agent}-paid.jpg` });
    // Unchanged polling must not repeatedly invalidate invoice/list queries.
    const stableInvoiceReads = invoiceReads, priorCardReads = cardReads;
    await poll(async () => cardReads, count => count > priorCardReads, 'unchanged card poll');
    await page.waitForTimeout(300);
    assert.equal(invoiceReads, stableInvoiceReads);

    status = 'refunded';
    invoicePaid = false;
    await poll(() => page.getByTestId(`status-pill-${id}`).innerText(), text => text !== 'Paid', 'refund clears invoice flag');
    await page.getByTestId('button-pay-by-card').waitFor();
    const beforeResume = invoiceReads;
    // A manual repayment can change invoice flags without changing old card history.
    invoicePaid = true;
    paymentMethod = 'cash';
    await foreground(page);
    await poll(() => page.getByTestId(`status-pill-${id}`).innerText(), text => text === 'Paid', 'warm invoice refresh');
    assert.ok(invoiceReads > beforeResume);

    // Hold a pre-settlement invoice request while the card status changes again.
    invoicePaid = false;
    holdNextInvoice = true;
    await foreground(page);
    await poll(async () => !!releaseInvoice, Boolean, 'held invoice request');
    status = 'paid';
    invoicePaid = true;
    paymentMethod = 'stripe';
    await page.getByText(/· Paid$/).first().waitFor({ timeout: 15_000 });
    assert.equal(await page.getByTestId('button-pay-by-card').count(), 0);
    const heldReadCount = invoiceReads;
    releaseInvoice!();
    await poll(async () => invoiceReads, count => count > heldReadCount, 'follow-up read after stale in-flight response');
    await poll(() => page.getByTestId(`status-pill-${id}`).innerText(), text => text === 'Paid', 'settlement racing an invoice read');
    results.push({
      platformSimulation: agent, delayedSettlement: 'passed', refund: 'passed',
      warmInvoiceResume: 'passed', inFlightInvoiceRace: 'passed',
      unchangedPollsDoNotRefetchInvoice: true, directInvoiceBeatsSavedScreen: true,
    });
    await context.close();
  }

  stage = 'organizer setup warm return';
  {
    const context = await authenticatedContext(sandbox.organizer, 'android');
    const page = await context.newPage();
    let ready = false, reads = 0;
    await page.route('**/api/organizer-card-payments/connect/status', async route => {
      reads++;
      await route.fulfill({ json: {
        ...setup.body, enabled: true, eligible: true, connected: true,
        webhookReady: true, ready,
      } });
    });
    await page.goto(`${origin}/payment-requests?connect=return`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('button-connect-stripe').waitFor({ timeout: 45_000 });
    await page.waitForTimeout(400);
    const before = reads;
    ready = true;
    await foreground(page);
    await page.getByTestId('button-manage-stripe').waitFor();
    await page.waitForTimeout(300);
    assert.equal(reads - before, 1, 'One refresh for three foreground signals');
    assert.equal(await page.getByTestId('button-connect-stripe').count(), 0);
    assert.equal(await page.getByTestId('button-manage-stripe').count(), 1);
    await page.screenshot({ path: `${output}/organizer-ready.jpg` });
    results.push({ organizerWarmResume: 'passed', foregroundSignalsCoalesced: true });
    await context.close();
  }

  const [{ count: chargesAfter }] = await sandbox.sql`
    SELECT COUNT(*)::int AS count FROM organizer_card_payments WHERE stripe_charge_id IS NOT NULL
  `;
  const afterRoles = await sandbox.sql`SELECT id, role FROM users ORDER BY id`;
  assert.equal(chargesAfter, chargesBefore);
  assert.deepEqual(afterRoles, beforeRoles);
  const report = {
    checkedAt: new Date().toISOString(), results, newCharges: chargesAfter - chargesBefore,
    subscriptionRolesUnchanged: true, realDevicesTested: false, productionTouched: false,
  };
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Payment return verification failed', {
    stage, type: error instanceof Error ? error.name : 'unknown',
  });
  process.exitCode = 1;
} finally {
  await browser.close();
  await sandbox.close();
}
