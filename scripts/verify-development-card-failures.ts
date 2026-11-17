import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type Stripe from "stripe";
import { createCardPaymentSandbox, poll, submitSandboxCard, checkoutText } from "./lib/card-payment-sandbox";

let stage = "development sandbox setup";
let sandbox: Awaited<ReturnType<typeof createCardPaymentSandbox>> | undefined;
const evidence: Record<string, unknown>[] = [];

async function main() {
  const s = sandbox = await createCardPaymentSandbox();
  const roles = await s.sql`SELECT id,role FROM users ORDER BY id`;
  const record = async (result: Record<string, unknown>) => {
    evidence.push(result);
    await writeFile(`${s.outputDir}/${flag ?? "all"}-results.json`, JSON.stringify(evidence, null, 2));
  };
  const flag = process.argv.find(arg => arg.startsWith("--scenario="))?.split("=")[1];
  if (flag) assert.ok(["decline", "cancel", "won", "lost"].includes(flag));

  if (!flag || flag === "decline") {
    stage = "declined card checkout";
    const invoiceId = await s.invoice("decline and retry");
    const { context, page } = await s.checkout(invoiceId);
    const initial = await s.payment(invoiceId);
    await submitSandboxCard(page, "4000000000009995");
    await poll(() => checkoutText(page), text => /insufficient funds|card.*declined/i.test(text), "visible card decline");
    await page.screenshot({ path: `${s.outputDir}/declined-card-mobile.jpg`, fullPage: true });
    const failedEvent = await poll(async () => {
      const events = await s.stripe.events.list({ type: "payment_intent.payment_failed", limit: 30 });
      return events.data.find(event =>
        (event.data.object as Stripe.PaymentIntent).metadata.organizerCardPaymentId === initial.id);
    }, Boolean, "genuine decline event");
    assert.ok(failedEvent);
    await poll(async () => {
      const [received] = await s.sql`
        SELECT processed_at FROM stripe_connect_webhook_events
        WHERE event_id=${failedEvent.id} AND payment_id=${initial.id}
      `;
      return received?.processed_at;
    }, Boolean, "processed genuine decline webhook");
    const declined = await poll(() => s.payment(invoiceId),
      row => row?.status === "processing", "retryable declined payment");
    assert.equal(declined.is_paid, false);
    const intent = await s.stripe.paymentIntents.retrieve((failedEvent.data.object as Stripe.PaymentIntent).id);
    assert.equal(intent.status, "requires_payment_method");
    assert.equal(intent.amount_received, 0);
    const same = await s.api(s.payer.access_token, "/api/organizer-card-payments/checkout-session", "POST", { paymentRequestId: invoiceId });
    assert.equal(same.status, 200);
    assert.equal(same.body.paymentId, initial.id);
    assert.equal((await s.payment(invoiceId)).stripe_checkout_session_id, initial.stripe_checkout_session_id);
    console.log("[Failure checks] Stripe declined the card visibly; invoice stayed unpaid and retry reused the same session.");
    stage = "successful retry after decline";
    await submitSandboxCard(page, "4242424242424242");
    const paid = await poll(() => s.payment(invoiceId), row => row?.status === "paid", "successful retry");
    assert.equal(paid.is_paid, true);
    await s.replay({ ...failedEvent, id: `evt_synthetic_late_decline_${randomUUID()}` });
    assert.equal((await s.payment(invoiceId)).is_paid, true);
    const [{ count }] = await s.sql`SELECT COUNT(*)::int AS count FROM organizer_card_payments WHERE payment_request_id=${invoiceId}`;
    assert.equal(count, 1);
    assert.equal((await s.api(s.organizer.access_token, `/api/organizer-card-payments/${paid.id}/refund`, "POST", {})).status, 200);
    await poll(() => s.payment(invoiceId), row => row?.status === "refunded", "cleanup invoice refund");
    await context.close();
    await record({ scenario: "decline_retry", invoiceId, paymentId: paid.id, passed: true });
    console.log("[Failure checks] One successful retry settled the invoice; a late decline did not undo it; test payment refunded.");
  }

  if (!flag || flag === "cancel") {
    stage = "expired checkout";
    const invoiceId = await s.invoice("expired checkout");
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await s.api(s.payer.access_token, "/api/organizer-card-payments/checkout-session",
        "POST", { paymentRequestId: invoiceId })).status, 200);
      const payment = await s.payment(invoiceId);
      await s.stripe.checkout.sessions.expire(payment.stripe_checkout_session_id);
      const cancelled = await poll(() => s.payment(invoiceId), row => row?.status === "cancelled", "genuine session expiry");
      assert.equal(cancelled.is_paid, false);
    }
    await record({ scenario: "expired_checkout_retry", invoiceId, passed: true });
    console.log("[Failure checks] Expired sessions stayed unpaid and could be retried safely.");
  }

  for (const outcome of ["won", "lost"] as const) {
    if (flag && flag !== outcome) continue;
    stage = `genuine ${outcome} dispute checkout`;
    const invoiceId = await s.invoice(`dispute ${outcome}`);
    const { context, page } = await s.checkout(invoiceId);
    await submitSandboxCard(page, "4061219946393810");
    const settled = await poll(() => s.payment(invoiceId),
      row => Boolean(row?.stripe_payment_intent_id), "verified dispute-card settlement");
    const dispute = await poll(async () => {
      const disputes = await s.stripe.disputes.list({ payment_intent: settled.stripe_payment_intent_id, limit: 10 });
      return disputes.data[0];
    }, Boolean, "genuine Stripe dispute");
    assert.ok(dispute);
    assert.equal(dispute.livemode, false);
    stage = `genuine ${outcome} dispute webhook`;
    const opened = await poll(() => s.payment(invoiceId),
      row => row?.status === "disputed" && row.dispute_id === dispute.id, "dispute creation webhook");
    assert.equal(opened.is_paid, true);
    assert.equal((await s.api(s.payer.access_token, "/api/organizer-card-payments/checkout-session",
      "POST", { paymentRequestId: invoiceId })).status, 409);
    const visible = await s.api(s.payer.access_token, `/api/organizer-card-payments/requests/${invoiceId}`);
    assert.equal(visible.status, 200);
    assert.equal(visible.body.payments.find((p: any) => p.id === opened.id).disputeStatus, dispute.status);
    assert.equal((await s.api(s.organizer.access_token,
      `/api/payment-request-recipients/${opened.recipient_id}/confirm`, "PATCH", { isConfirmed: true })).status, 200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(`Dispute status: ${dispute.status}`, { exact: true }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: `${s.outputDir}/dispute-${outcome}-open-mobile.jpg`, fullPage: true });
    console.log(`[Failure checks] Genuine ${outcome}-case dispute reached the app, remained visible and blocked another card charge.`);
    stage = `Stripe ${outcome} evidence resolution`;
    await s.stripe.disputes.update(dispute.id, {
      evidence: { uncategorized_text: outcome === "won" ? "winning_evidence" : "losing_evidence" }, submit: true,
    });
    await poll(() => s.stripe.disputes.retrieve(dispute.id), value => value.status === outcome, "Stripe dispute resolution");
    const closed = await poll(() => s.payment(invoiceId),
      row => row?.dispute_status === outcome, "closed dispute webhook");
    assert.equal(closed.status, outcome === "won" ? "paid" : "disputed");
    assert.equal(closed.is_paid, outcome === "won");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(`Dispute status: ${outcome}`, { exact: true }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: `${s.outputDir}/dispute-${outcome}-closed-mobile.jpg`, fullPage: true });
    if (outcome === "lost") {
      assert.equal(closed.is_confirmed, false);
      assert.equal(closed.confirmed_at, null);
      assert.equal((await s.api(s.organizer.access_token,
        `/api/payment-request-recipients/${closed.recipient_id}`, "PATCH",
        { isPaid: true, paymentMethod: "cash" })).status, 200);
      assert.equal((await s.payment(invoiceId)).is_paid, true);
    }
    stage = `${outcome} dispute duplicate and out-of-order events`;
    const createdEvents = await s.stripe.events.list({ type: "charge.dispute.created", limit: 30 });
    const createdEvent = createdEvents.data.find(event => event.data.object.id === dispute.id);
    assert.ok(createdEvent);
    await s.replay({ ...createdEvent, id: `evt_synthetic_old_dispute_${randomUUID()}` });
    const afterOldCreation = await s.payment(invoiceId);
    assert.equal(afterOldCreation.dispute_status, outcome);
    assert.equal(afterOldCreation.is_paid, true);
    const closedEvents = await s.stripe.events.list({ type: "charge.dispute.closed", limit: 30 });
    const closedEvent = closedEvents.data.find(event => event.data.object.id === dispute.id);
    assert.ok(closedEvent);
    await Promise.all([1, 2].map(() => s.replay({
      ...closedEvent, id: `evt_synthetic_dispute_replay_${randomUUID()}`,
    })));
    assert.equal((await s.payment(invoiceId)).is_paid, true);
    await context.close();
    await record({ scenario: `dispute_${outcome}`, invoiceId, paymentId: closed.id, disputeId: dispute.id, passed: true });
    console.log(`[Failure checks] ${outcome} dispute resolved correctly; late/repeated events preserved the outcome and later payment state.`);
    if (outcome === "won") {
      assert.equal((await s.api(s.organizer.access_token,
        `/api/organizer-card-payments/${closed.id}/refund`, "POST", {})).status, 200);
      await poll(() => s.payment(invoiceId), row => row?.status === "refunded", "won-case test refund");
    }
  }
  assert.deepEqual(await s.sql`SELECT id,role FROM users ORDER BY id`, roles);
  console.log("[Failure checks] Subscription roles unchanged; only isolated development data and Stripe TEST transactions used.");
}

main().catch(error => {
  console.error("[Failure checks] Failed safely.", {
    stage, errorType: error?.name,
    actual: typeof error?.actual === "number" || typeof error?.actual === "boolean" ? error.actual : undefined,
    expected: typeof error?.expected === "number" || typeof error?.expected === "boolean" ? error.expected : undefined,
  });
  process.exitCode = 1;
}).finally(async () => { await sandbox?.close(); });
