import type Stripe from "stripe";
import { pool } from "./db";
import { OrganizerCardPaymentError } from "./organizerCardPaymentMath";
import { directStripeOptions } from "./organizerDirectPricing";
import { lockInvoiceRefundScrimmage, releaseRefundedScrimmageRequest, type CommittedInvoiceRefund } from "./organizerScrimmageRefunds";
import { matchesOrganizerDispute, organizerDisputeTransition, lostDisputeRecipientReset } from "./organizerDisputeState";
import { organizerDisputeAccounting } from "./organizerDisputeAccounting";

const idOf = (value: any): string | null => typeof value === "string" ? value : value?.id ?? null;
const supported = new Set([
  "payment_intent.succeeded", "payment_intent.processing", "payment_intent.payment_failed", "payment_intent.canceled",
  "charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
  "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated",
]);

async function markDirectInvoicePaid(client: any, row: any) {
  await client.query(`
    UPDATE public.payment_request_recipients rr SET is_paid=true,payment_method='stripe',paid_at=COALESCE(paid_at,now()),updated_at=now()
    FROM public.payment_requests pr
    WHERE rr.id=$1 AND rr.payment_request_id=$2 AND rr.user_id=$3 AND pr.id=rr.payment_request_id
      AND pr.creator_id=$4 AND round(pr.amount_per_person::numeric*100)::bigint=$5
      AND (rr.is_paid=false OR rr.payment_method='stripe')
      AND NOT EXISTS(SELECT 1 FROM public.organizer_card_payments newer WHERE newer.recipient_id=rr.id
        AND newer.id<>$6 AND newer.created_at>(SELECT original.created_at FROM public.organizer_card_payments original WHERE original.id=$6)
        AND newer.status IN ('paid','refund_pending','disputed'))`,
    [row.recipient_id, row.payment_request_id, row.payer_user_id, row.organizer_user_id, row.base_amount_cents, row.id]);
}

/** Only account-scoped events can settle a direct payment. */
export async function applyDirectOrganizerEvent(
  stripe: Stripe, event: Stripe.Event,
  onInvoiceRefundCommitted: (refund: CommittedInvoiceRefund) => Promise<void>,
) {
  if (!event.account || !supported.has(event.type)) return;
  const object: any = event.data.object;
  const candidateId = object.metadata?.organizerCardPaymentId;
  let intentId = event.type.startsWith("payment_intent.") ? object.id : idOf(object.payment_intent);
  let payment = candidateId ? (await pool.query(`
    SELECT * FROM public.organizer_card_payments WHERE id=$1 AND stripe_account_id=$2 AND payment_flow='direct'`,
    [candidateId, event.account])).rows[0] : null;
  if (!payment && intentId) payment = (await pool.query(`
    SELECT * FROM public.organizer_card_payments WHERE stripe_payment_intent_id=$1
      AND stripe_account_id=$2 AND payment_flow='direct'`, [intentId, event.account])).rows[0];
  if (!payment && intentId && event.type.startsWith("charge.dispute.")) {
    // A dispute can precede the initial response that saves the intent ID.
    const known = (await pool.query(
      "SELECT stripe_account_id FROM public.organizer_direct_accounts WHERE stripe_account_id=$1", [event.account],
    )).rows[0];
    if (known) {
      const intent = await stripe.paymentIntents.retrieve(intentId, {}, directStripeOptions(event.account));
      if (intent.metadata?.organizerCardPaymentId) payment = (await pool.query(`
        SELECT * FROM public.organizer_card_payments WHERE id=$1 AND stripe_account_id=$2 AND payment_flow='direct'`,
        [intent.metadata.organizerCardPaymentId, event.account])).rows[0];
    }
  }
  if (!payment || !intentId) return;
  const options = directStripeOptions(payment.stripe_account_id, payment.processing_surcharge_cents);
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] }, options);
  if (intent.currency !== "usd" || intent.amount !== payment.total_amount_cents ||
      (intent.status === "succeeded" && intent.amount_received !== payment.total_amount_cents) ||
      (intent.application_fee_amount ?? 0) !== 0 || intent.transfer_data ||
      intent.metadata?.organizerCardPaymentId !== payment.id ||
      intent.metadata?.paymentRequestId !== payment.payment_request_id ||
      intent.metadata?.payerUserId !== payment.payer_user_id ||
      intent.metadata?.organizerUserId !== payment.organizer_user_id ||
      intent.metadata?.quoteId !== payment.quote_id ||
      (payment.stripe_payment_intent_id && payment.stripe_payment_intent_id !== intent.id)) return;
  if (payment.processing_surcharge_cents > 0 &&
      (intent as any).amount_details?.surcharge?.amount !== payment.processing_surcharge_cents) return;

  let charge: Stripe.Charge | null = null;
  let balance: Stripe.BalanceTransaction | null = null;
  let dispute: Stripe.Dispute | null = null;
  const chargeId = idOf(intent.latest_charge);
  if (intent.status === "succeeded" || event.type === "charge.refunded" || event.type.startsWith("charge.dispute.")) {
    if (!chargeId) throw new OrganizerCardPaymentError("Payment accounting is still being finalized.", 503, "stripe_accounting_pending");
    charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] }, options);
    if (!charge.paid || charge.currency !== "usd" || charge.amount !== payment.total_amount_cents ||
        idOf(charge.payment_intent) !== intent.id || charge.transfer || charge.application_fee ||
        charge.metadata?.organizerCardPaymentId !== payment.id) return;
    if (!charge.balance_transaction || typeof charge.balance_transaction === "string") {
      throw new OrganizerCardPaymentError("Payment accounting is still being finalized.", 503, "stripe_accounting_pending");
    }
    balance = charge.balance_transaction;
    if (balance.currency !== "usd" || !Number.isInteger(balance.fee) || balance.net !== balance.amount - balance.fee ||
        balance.amount !== payment.total_amount_cents) return;
  }
  if (event.type.startsWith("charge.dispute.")) {
    dispute = await stripe.disputes.retrieve(object.id, {}, options);
    if (!charge || !matchesOrganizerDispute({
      ...payment, stripe_payment_intent_id: intent.id, stripe_charge_id: charge.id,
    }, dispute)) return;
  }
  const isRefund = event.type === "charge.refunded";
  let committedRefund: CommittedInvoiceRefund | null = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const scrimmage = isRefund
      ? await lockInvoiceRefundScrimmage(client, payment.payment_request_id, payment.organizer_user_id) : null;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`organizer-card-event:${payment.id}`]);
    const inserted = await client.query(`
      INSERT INTO public.stripe_connect_webhook_events(event_id,event_type,payment_id)
      VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`, [event.id, event.type, payment.id]);
    if (!inserted.rows.length) { await client.query("COMMIT"); return; }
    await client.query("SELECT id FROM public.payment_request_recipients WHERE id=$1 FOR UPDATE", [payment.recipient_id]);
    const row = (await client.query("SELECT * FROM public.organizer_card_payments WHERE id=$1 FOR UPDATE", [payment.id])).rows[0];
    if (!row || row.payment_flow !== "direct" || row.stripe_account_id !== event.account || row.quote_id !== payment.quote_id) {
      throw new OrganizerCardPaymentError("Payment changed while verifying Stripe delivery.", 409, "payment_changed");
    }
    if (charge && balance) await client.query(`
      UPDATE public.organizer_card_payments SET stripe_payment_intent_id=$2,stripe_charge_id=$3,
        stripe_processing_fee_cents=$4,transfer_amount_cents=0,transfer_reversed_cents=0,
        receipt_url=$5,updated_at=now() WHERE id=$1`,
      [row.id, intent.id, charge.id, balance.fee, charge.receipt_url]);
    if (isRefund && charge) {
      const refunded = Math.max(row.refunded_amount_cents ?? 0, charge.amount_refunded);
      const complete = refunded >= row.total_amount_cents;
      await client.query(`
        UPDATE public.organizer_card_payments SET status=CASE WHEN status='refunded' OR $2 THEN 'refunded' ELSE 'refund_pending' END,
          refunded_amount_cents=GREATEST(refunded_amount_cents,$3),refund_status=CASE WHEN $2 THEN 'succeeded' ELSE 'partial' END,
          refunded_at=CASE WHEN $2 THEN COALESCE(refunded_at,now()) ELSE refunded_at END,updated_at=now()
        WHERE id=$1`, [row.id, complete, refunded]);
      if (complete && row.status !== "refunded") {
        // Do not undo a replacement manual payment or a later card repayment.
        const cleared = await client.query(`
          UPDATE public.payment_request_recipients rr SET is_paid=false,payment_method=NULL,paid_at=NULL,
            is_confirmed=false,confirmed_at=NULL,updated_at=now()
          WHERE rr.id=$1 AND rr.payment_request_id=$2 AND (rr.payment_method IS NULL OR rr.payment_method='stripe')
            AND NOT EXISTS(SELECT 1 FROM public.organizer_card_payments newer
              WHERE newer.recipient_id=rr.id
              AND newer.created_at>(SELECT original.created_at FROM public.organizer_card_payments original WHERE original.id=$3)
              AND newer.id<>$3
              AND newer.status IN ('paid','refund_pending','disputed'))
          RETURNING rr.id`, [row.recipient_id, row.payment_request_id, row.id]);
        if (cleared.rows.length) {
          const released = await releaseRefundedScrimmageRequest(client, scrimmage, row.payer_user_id);
          committedRefund = {
            paymentRequestId: row.payment_request_id, organizerUserId: row.organizer_user_id,
            payerUserId: row.payer_user_id, scrimmageId: scrimmage?.id ?? null, ...released,
          };
        }
      }
    } else if (dispute) {
      const transition = organizerDisputeTransition(row, dispute);
      const accounting = organizerDisputeAccounting(dispute);
      const accept = dispute.status === transition.disputeStatus &&
        (row.dispute_id !== dispute.id || accounting.entries >= (row.dispute_balance_transaction_count ?? 0));
      await client.query(`
        UPDATE public.organizer_card_payments SET status=$2,dispute_id=$3,dispute_status=$4,
          disputed_amount_cents=CASE WHEN $5 THEN $6 ELSE disputed_amount_cents END,
          dispute_fee_cents=CASE WHEN $5 THEN $7 ELSE dispute_fee_cents END,
          dispute_balance_net_cents=CASE WHEN $5 THEN $8 ELSE dispute_balance_net_cents END,
          dispute_balance_transaction_count=CASE WHEN $5 THEN $9 ELSE dispute_balance_transaction_count END,updated_at=now()
        WHERE id=$1`, [row.id, transition.paymentStatus, dispute.id, transition.disputeStatus, accept,
          accounting.amount, accounting.fees, accounting.net, accounting.entries]);
      if (transition.clearRecipient) await client.query(lostDisputeRecipientReset(row));
      else if (transition.paymentStatus === "paid" && !["paid","refunded","refund_pending"].includes(row.status)) {
        await markDirectInvoicePaid(client, row);
      }
    } else if (intent.status === "succeeded" && charge && balance &&
        !["paid","refunded","refund_pending","disputed"].includes(row.status)) {
      await client.query("UPDATE public.organizer_card_payments SET status='paid',updated_at=now() WHERE id=$1", [row.id]);
      await markDirectInvoicePaid(client, row);
    } else if (["pending","processing"].includes(row.status)) {
      await client.query(`
        UPDATE public.organizer_card_payments SET stripe_payment_intent_id=COALESCE(stripe_payment_intent_id,$2),
          status=CASE WHEN $3='canceled' THEN 'cancelled' ELSE 'processing' END,updated_at=now()
        WHERE id=$1 AND status IN ('pending','processing')`, [row.id, intent.id, intent.status]);
    }
    await client.query("UPDATE public.stripe_connect_webhook_events SET processed_at=now() WHERE event_id=$1", [event.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (committedRefund) await onInvoiceRefundCommitted(committedRefund);
}
