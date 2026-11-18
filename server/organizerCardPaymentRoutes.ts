import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import Stripe from "stripe";
import { onboardDirectAccount } from "./organizerDirectAccounts";
import { registerOrganizerDirectRoutes, requestDirectInvoiceRefund } from "./organizerDirectPayments";
import { applyDirectOrganizerEvent } from "./organizerDirectWebhooks";
import { readFinalizedOrganizerCharge } from "./organizerChargeAccounting";
import { isOrganizerInvoiceRefunded, organizerInvoiceRefundParams, organizerRefundAccountingUpdate } from "./organizerRefundAccounting";
import { matchesOrganizerDispute, organizerDisputeTransition, lostDisputeRecipientReset } from "./organizerDisputeState";
import { organizerDisputeAccounting } from "./organizerDisputeAccounting";
import { loadOrganizerPaymentReport, organizerReportFilters, organizerReportCsv } from "./organizerPaymentReport";
import {
  lockInvoiceRefundScrimmage, releaseRefundedScrimmageRequest,
  type CommittedInvoiceRefund,
} from "./organizerScrimmageRefunds";
import { pool } from "./db";
import { isVerifiedProductionRuntime } from "./runtimePolicy";
import { canUseOrganizerCardPilot } from "./organizerCardPilot";
import {
  assertOrganizerCardWebhooksReady,
  assertDirectCollectionEnabled,
  assertDirectOnboardingEnabled,
  isDirectCollectionEnabled,
  assertOrganizerCardPilotUser,
  isOrganizerCardPilotUser,
  calculateOrganizerServiceFeeCents,
  getOrganizerCardConnectWebhookSecret,
  getOrganizerCardPaymentsWebhookSecret,
  getOrganizerCardStripe,
  getVerifiedConnectedAccountStatus,
  hasOrganizerCardCollectionEntitlement,
  isOrganizerCardPaymentsActiveInCurrentRuntime,
  OrganizerCardPaymentError,
  parseBaseAmountCents,
} from "./organizerCardPaymentService";

type PaymentRow = {
  payment_flow?: "destination" | "direct";
  processing_surcharge_cents?: number;
  id: string;
  payment_request_id: string;
  recipient_id: string;
  payer_user_id: string;
  organizer_user_id: string;
  stripe_account_id: string;
  base_amount_cents: number;
  service_fee_cents: number;
  total_amount_cents: number;
  status: string;
  idempotency_key: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id?: string | null;
  dispute_id?: string | null;
  dispute_status?: string | null;
  disputed_amount_cents?: number | null;
  dispute_fee_cents?: number | null;
  dispute_balance_net_cents?: number | null;
  dispute_balance_transaction_count?: number;
};

function userIdFromRequest(req: any): string | null {
  const id = req.user?.claims?.sub;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function requestAppOrigin(req: any): string {
  if (isVerifiedProductionRuntime()) {
    const configured = process.env.FRONTEND_URL?.split(",")[0]?.trim();
    if (!configured) throw new OrganizerCardPaymentError("The app return URL is not configured.", 503, "return_url_not_ready");
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") throw new OrganizerCardPaymentError("The app return URL must use HTTPS.", 503, "return_url_not_ready");
    return parsed.origin;
  }
  const configuredDomain = process.env.REPLIT_DEV_DOMAIN?.split(",")[0]?.trim();
  if (!configuredDomain) {
    throw new OrganizerCardPaymentError("The isolated test return domain is not configured.", 503, "return_url_not_ready");
  }
  let parsed: URL;
  try {
    parsed = new URL(configuredDomain.includes("://") ? configuredDomain : `https://${configuredDomain}`);
  } catch {
    throw new OrganizerCardPaymentError("The isolated test return domain is invalid.", 503, "return_url_not_ready");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/") {
    throw new OrganizerCardPaymentError("The isolated test return domain must use HTTPS.", 503, "return_url_not_ready");
  }
  return parsed.origin;
}

function sendPaymentError(res: any, error: unknown) {
  if (error instanceof OrganizerCardPaymentError) {
    return res.status(error.statusCode).json({ message: error.message, code: error.code });
  }
  const stripeStatus = (error as any)?.statusCode;
  if (typeof stripeStatus === "number" && stripeStatus >= 400 && stripeStatus < 500) {
    const field = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_.[\]-]{1,120}$/.test(value) ? value : undefined;
    console.warn("[OrganizerCardPayments] Stripe request rejected.", {
      type: field((error as any)?.type), code: field((error as any)?.code),
      parameter: field((error as any)?.param), requestId: field((error as any)?.requestId),
    });
    return res.status(400).json({ message: "Stripe could not complete this payment action." });
  }
  console.error("[OrganizerCardPayments] Request failed.", {
    code: typeof (error as any)?.code === "string" ? (error as any).code : "unknown",
  });
  return res.status(500).json({ message: "Could not complete the card payment action." });
}

async function preparePaymentAttempt(paymentRequestId: string, payerUserId: string): Promise<PaymentRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestResult = await client.query<{
      payment_request_id: string;
      creator_id: string;
      organizer_display_id: string | null;
      amount_per_person: string;
      card_enabled: boolean;
      recipient_id: string;
      recipient_user_id: string;
      is_paid: boolean;
    }>(`
      SELECT pr.id AS payment_request_id, pr.creator_id, organizer.display_id AS organizer_display_id, pr.amount_per_person::text,
             pr.card_enabled, rr.id AS recipient_id, rr.user_id AS recipient_user_id, rr.is_paid
      FROM public.payment_requests pr
      JOIN public.payment_request_recipients rr ON rr.payment_request_id = pr.id
      JOIN public.users organizer ON organizer.id = pr.creator_id AND organizer.deleted_at IS NULL
      WHERE pr.id = $1 AND rr.user_id = $2
      FOR UPDATE OF pr, rr
    `, [paymentRequestId, payerUserId]);
    const request = requestResult.rows[0];
    if (!request) throw new OrganizerCardPaymentError("This invoice is not assigned to your account.", 404, "recipient_not_found");
    if (!canUseOrganizerCardPilot(isVerifiedProductionRuntime(), request.organizer_display_id)) {
      throw new OrganizerCardPaymentError("The organizer is not in the card payment pilot.", 403, "card_pilot_restricted");
    }
    if (!request.card_enabled) throw new OrganizerCardPaymentError("The organizer has not enabled card payments for this invoice.", 409, "card_payment_not_enabled");
    if (request.is_paid) throw new OrganizerCardPaymentError("This invoice is already marked paid.", 409, "already_paid");

    const protectedPayment = await client.query(
      `SELECT id FROM public.organizer_card_payments
       WHERE recipient_id = $1 AND (
         status IN ('paid', 'refund_pending')
         OR (status='disputed' AND COALESCE(dispute_status,'') NOT IN ('lost','won'))
       )
       ORDER BY created_at DESC LIMIT 1`,
      [request.recipient_id],
    );
    if (protectedPayment.rows.length) {
      throw new OrganizerCardPaymentError("A completed or disputed card payment already exists for this invoice.", 409, "payment_already_exists");
    }

    const pending = await client.query<PaymentRow>(
      `SELECT * FROM public.organizer_card_payments
       WHERE recipient_id = $1 AND status IN ('pending', 'processing')
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [request.recipient_id],
    );
    if (pending.rows[0]) {
      await client.query("COMMIT");
      return pending.rows[0];
    }

    const baseAmountCents = parseBaseAmountCents(request.amount_per_person);
    const serviceFeeCents = calculateOrganizerServiceFeeCents(baseAmountCents);
    const connected = await client.query<{ stripe_account_id: string }>(
      `SELECT stripe_account_id FROM public.stripe_connected_accounts
       WHERE user_id = $1 AND stripe_account_id IS NOT NULL`,
      [request.creator_id],
    );
    const stripeAccountId = connected.rows[0]?.stripe_account_id;
    if (!stripeAccountId) throw new OrganizerCardPaymentError("The organizer has not connected a receiving account.", 409, "organizer_not_connected");

    const inserted = await client.query<PaymentRow>(`
      INSERT INTO public.organizer_card_payments (
        payment_request_id, recipient_id, payer_user_id, organizer_user_id, stripe_account_id,
        base_amount_cents, service_fee_cents, total_amount_cents, currency, status, idempotency_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'usd','pending',$9)
      RETURNING *
    `, [
      request.payment_request_id,
      request.recipient_id,
      payerUserId,
      request.creator_id,
      stripeAccountId,
      baseAmountCents,
      serviceFeeCents,
      baseAmountCents + serviceFeeCents,
      `organizer-card-payment:${randomUUID()}`,
    ]);
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function validateStripePaymentIntent(
  stripe: Stripe,
  payment: PaymentRow,
  paymentIntentId: string,
  expectedSessionId?: string,
) {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  const destination = typeof intent.transfer_data?.destination === "string"
    ? intent.transfer_data.destination
    : intent.transfer_data?.destination?.id;
  const metadataMatches =
    intent.metadata?.organizerCardPaymentId === payment.id &&
    intent.metadata?.paymentRequestId === payment.payment_request_id &&
    intent.metadata?.payerUserId === payment.payer_user_id &&
    intent.metadata?.organizerUserId === payment.organizer_user_id;
  if (
    intent.status !== "succeeded" ||
    intent.amount !== payment.total_amount_cents ||
    intent.amount_received !== payment.total_amount_cents ||
    intent.currency !== "usd" ||
    intent.application_fee_amount !== payment.service_fee_cents ||
    destination !== payment.stripe_account_id ||
    !metadataMatches
  ) {
    return null;
  }

  const chargeValue = intent.latest_charge;
  const chargeId = typeof chargeValue === "string" ? chargeValue : chargeValue?.id;
  if (!chargeId) {
    throw new OrganizerCardPaymentError(
      "Stripe charge details are still being finalized. Delivery can be retried.",
      503, "stripe_accounting_pending",
    );
  }
  // An expanded latest_charge on a PaymentIntent can precede its transfer,
  // application fee and balance transaction. Retrieve the complete charge
  // explicitly instead of recording an incomplete financial snapshot.
  const charge = await readFinalizedOrganizerCharge(() => stripe.charges.retrieve(chargeId, {
    expand: ["balance_transaction", "application_fee", "transfer"],
  }));
  if (!charge) {
    throw new OrganizerCardPaymentError(
      "Stripe payment accounting is still being finalized. Delivery can be retried.",
      503, "stripe_accounting_pending",
    );
  }
  if (expectedSessionId && payment.stripe_checkout_session_id && payment.stripe_checkout_session_id !== expectedSessionId) {
    return null;
  }
  const balance: any = charge?.balance_transaction;
  const balanceTransaction = typeof balance === "string" && balance
    ? await stripe.balanceTransactions.retrieve(balance)
    : balance;
  const transfer: any = charge.transfer;
  const fee: any = charge.application_fee;
  if (!transfer || typeof transfer === "string" ||
      !fee || typeof fee === "string" || !balanceTransaction) {
    throw new OrganizerCardPaymentError(
      "Stripe payment accounting is still being finalized. Delivery can be retried.",
      503, "stripe_accounting_pending",
    );
  }
  if (charge.amount !== payment.total_amount_cents ||
      charge.currency !== "usd" || !charge.paid ||
      transfer.amount !== payment.total_amount_cents ||
      transfer.destination !== payment.stripe_account_id ||
      fee.amount !== payment.service_fee_cents) {
    return null;
  }
  return { intent, charge, balanceTransaction, valid: true };
}

async function applyStripeEvent(
  stripe: Stripe,
  event: Stripe.Event,
  scope: "platform" | "connect",
  onInvoiceRefundCommitted: (refund: CommittedInvoiceRefund) => Promise<void>,
): Promise<void> {
  const object: any = event.data.object;
  let paymentId: string | null = object?.metadata?.organizerCardPaymentId ?? null;
  let paymentIntentId: string | null = null;
  let effect: "success" | "processing" | "failed" | "cancelled" | "refund" | "dispute_created" | "dispute_closed" | "account_updated" | "none" = "none";
  let verifiedDispute: Stripe.Dispute | null = null;
  let refundInfo: any = null;
  let verifiedRefundedCents = 0;
  let verifiedTransferReversedCents = 0;
  let verifiedApplicationFeeRefundedCents = 0;
  let sessionId: string | null = null;

  if (event.type === "account.updated") {
    effect = "account_updated";
  } else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    sessionId = object.id;
    paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id ?? null;
    if (object.payment_status === "paid") effect = "success";
    else effect = "processing";
  } else if (event.type === "checkout.session.expired") {
    sessionId = object.id;
    effect = "cancelled";
  } else if (event.type === "checkout.session.async_payment_failed") {
    effect = "failed";
  } else if (event.type === "payment_intent.payment_failed") {
    // Card declines are retryable in the same open Checkout Session. Do not
    // release the attempt and allow a second charge while that session is live.
    paymentIntentId = object.id;
    effect = "processing";
  } else if (event.type === "payment_intent.canceled") {
    paymentIntentId = object.id;
    effect = "cancelled";
  } else if (event.type === "payment_intent.succeeded") {
    paymentIntentId = object.id;
    effect = "success";
  } else if (event.type === "charge.refunded") {
    paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id ?? null;
    refundInfo = object.refunds?.data?.[0] ?? null;
    effect = "refund";
  } else if (["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
    "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated"].includes(event.type)) {
    paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id ?? null;
    effect = event.type === "charge.dispute.closed" ? "dispute_closed" : "dispute_created";
  }
  if ((scope === "connect" && event.type !== "account.updated") ||
      (scope === "platform" && event.type === "account.updated")) {
    effect = "none";
  }
  if (effect === "dispute_created" || effect === "dispute_closed") {
    // Use current Stripe state, not an older webhook snapshot. A late "created"
    // event can arrive after a genuine won/lost closure.
    verifiedDispute = await stripe.disputes.retrieve(object.id);
    paymentIntentId = typeof verifiedDispute.payment_intent === "string"
      ? verifiedDispute.payment_intent : verifiedDispute.payment_intent?.id ?? null;
  }

  let payment: PaymentRow | undefined;
  if (paymentId) {
    const result = await pool.query<PaymentRow>("SELECT * FROM public.organizer_card_payments WHERE id = $1 LIMIT 1", [paymentId]);
    payment = result.rows[0];
  }
  if (!payment && paymentIntentId) {
    const result = await pool.query<PaymentRow>(
      "SELECT * FROM public.organizer_card_payments WHERE stripe_payment_intent_id = $1 LIMIT 1",
      [paymentIntentId],
    );
    payment = result.rows[0];
    paymentId = payment?.id ?? null;
  }
  if (!payment && verifiedDispute && paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const candidateId = intent.metadata?.organizerCardPaymentId;
    if (candidateId) {
      const result = await pool.query<PaymentRow>(
        "SELECT * FROM public.organizer_card_payments WHERE id=$1 LIMIT 1", [candidateId],
      );
      payment = result.rows[0];
      paymentId = payment?.id ?? null;
    }
  }
  if (!payment) paymentId = null;
  if (payment?.payment_flow === "direct") {
    // A platform-signed event is not proof about a connected-account charge.
    payment = undefined;
    paymentId = null;
    effect = "none";
  }
  if (verifiedDispute && payment) {
    if (!payment.stripe_payment_intent_id) {
      // The dispute may precede success delivery. Retry rather than permanently
      // acknowledging an unmapped dispute and losing it.
      throw new OrganizerCardPaymentError(
        "The disputed payment is still being finalized. Delivery can be retried.",
        503, "disputed_payment_pending",
      );
    }
    if (!matchesOrganizerDispute(payment, verifiedDispute)) effect = "none";
  }

  let verifiedSuccess: Awaited<ReturnType<typeof validateStripePaymentIntent>> | null = null;
  if (effect === "success" && payment && paymentIntentId) {
    if (event.type.startsWith("checkout.session.")) {
      if (
        object.mode !== "payment" ||
        object.currency !== "usd" ||
        object.amount_total !== payment.total_amount_cents ||
        object.client_reference_id !== payment.id ||
        object.metadata?.organizerCardPaymentId !== payment.id
      ) {
        effect = "none";
      } else {
        verifiedSuccess = await validateStripePaymentIntent(stripe, payment, paymentIntentId, sessionId ?? undefined);
      }
    } else {
      verifiedSuccess = await validateStripePaymentIntent(stripe, payment, paymentIntentId);
    }
    if (!verifiedSuccess?.valid) effect = "none";
  }
  if (effect === "refund" && payment) {
    // charge.refunded snapshots do not always include the refunds list. Read
    // Stripe's current charge/transfer so dashboard refunds and late deliveries
    // cannot invent a reversal or replace a real amount with the invoice base.
    const currentCharge = await stripe.charges.retrieve(object.id, {
      expand: ["transfer", "application_fee"],
    });
    const refunds = await stripe.refunds.list({ charge: currentCharge.id, limit: 100 });
    refundInfo = refunds.data.find(refund => refund.status === "succeeded")
      ?? refunds.data[0] ?? null;
    verifiedRefundedCents = Math.min(
      currentCharge.amount_refunded,
      refunds.data.filter(refund => refund.status === "succeeded")
        .reduce((total, refund) => total + refund.amount, 0),
    );
    const transfer: any = currentCharge.transfer;
    verifiedTransferReversedCents = typeof transfer === "object" && transfer
      ? transfer.amount_reversed ?? 0 : 0;
    const applicationFee = currentCharge.application_fee;
    if (!applicationFee || typeof applicationFee === "string") {
      throw new OrganizerCardPaymentError("Refund accounting is still being finalized.", 503, "refund_accounting_pending");
    }
    verifiedApplicationFeeRefundedCents = applicationFee.amount_refunded;
  }

  let committedRefund: CommittedInvoiceRefund | null = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const refundScrimmage = effect === "refund" && payment
      ? await lockInvoiceRefundScrimmage(client, payment.payment_request_id, payment.organizer_user_id)
      : null;
    if (payment) {
      // Serialize distinct deliveries before inserting their payment FK, so
      // concurrent webhook inserts cannot deadlock against the payment row lock.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
        [`organizer-card-event:${payment.id}`]);
    }
    const inserted = await client.query(
      `INSERT INTO public.stripe_connect_webhook_events (event_id, event_type, payment_id)
       VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type, paymentId],
    );
    if (!inserted.rows.length) {
      await client.query("COMMIT");
      return;
    }

    if (effect === "account_updated") {
      const current = object as Stripe.Account;
      await client.query(
        `UPDATE public.stripe_connected_accounts
         SET details_submitted=$2, charges_enabled=$3, transfers_enabled=$4,
             payouts_enabled=$5, requirements_currently_due=$6, updated_at=now()
         WHERE stripe_account_id=$1`,
        [
          current.id,
          current.details_submitted === true,
          current.charges_enabled === true,
          current.capabilities?.transfers === "active",
          current.payouts_enabled === true,
          current.requirements?.currently_due ?? [],
        ],
      );
    } else if (payment) {
      await client.query(
        "SELECT id FROM public.payment_request_recipients WHERE id=$1 FOR UPDATE",
        [payment.recipient_id],
      );
      const locked = await client.query<PaymentRow & { recipient_id: string }>(
        "SELECT * FROM public.organizer_card_payments WHERE id = $1 FOR UPDATE",
        [payment.id],
      );
      const row = locked.rows[0];
      if (row) {
        if (
          effect === "success" && verifiedSuccess?.valid &&
          !["refunded", "refund_pending", "disputed"].includes(row.status)
        ) {
          const charge: any = verifiedSuccess.charge;
          const appFee: any = charge?.application_fee;
          const transfer: any = charge?.transfer;
          const balanceTransaction: any = verifiedSuccess.balanceTransaction;
          await client.query(
            `UPDATE public.organizer_card_payments
             SET status='paid', stripe_payment_intent_id=$2, stripe_charge_id=$3,
                 stripe_application_fee_id=$4, stripe_transfer_id=$5, transfer_amount_cents=$6,
                 stripe_processing_fee_cents=$7, receipt_url=$8,
                 stripe_checkout_session_id=COALESCE(stripe_checkout_session_id,$9),
                 updated_at=now()
             WHERE id=$1 AND status NOT IN ('refunded','refund_pending')`,
            [
              row.id,
              paymentIntentId,
              charge?.id ?? null,
              typeof appFee === "string" ? appFee : appFee?.id ?? null,
              typeof transfer === "string" ? transfer : transfer?.id ?? null,
              transfer.amount,
              balanceTransaction?.fee ?? null,
              charge?.receipt_url ?? null,
              sessionId,
            ],
          );
          await client.query(
            `UPDATE public.payment_request_recipients
             SET is_paid=true, payment_method='stripe', paid_at=now(), updated_at=now()
             WHERE id=$1 AND payment_request_id=$2 AND user_id=$3`,
            [row.recipient_id, row.payment_request_id, row.payer_user_id],
          );
        } else if (effect === "processing") {
          await client.query(
            `UPDATE public.organizer_card_payments SET status='processing', stripe_checkout_session_id=COALESCE(stripe_checkout_session_id,$2), updated_at=now()
             WHERE id=$1 AND status IN ('pending','processing')`,
            [row.id, sessionId],
          );
        } else if (effect === "failed" || effect === "cancelled") {
          await client.query(
            `UPDATE public.organizer_card_payments SET status=$2, stripe_payment_intent_id=COALESCE(stripe_payment_intent_id,$3), updated_at=now()
             WHERE id=$1 AND status IN ('pending','processing')`,
            [row.id, effect, paymentIntentId],
          );
        } else if (effect === "refund") {
          // A completed invoice refund excludes the non-refundable service fee.
          const fullRefund = isOrganizerInvoiceRefunded(row.base_amount_cents, verifiedRefundedCents);
          const reversal: any = refundInfo?.transfer_reversal;
          await client.query(
            `UPDATE public.organizer_card_payments
             SET status=CASE WHEN status='refunded' OR $2 THEN 'refunded' ELSE 'refund_pending' END,
                 refund_id=COALESCE($3, refund_id),
                 refund_status=COALESCE($4, 'succeeded'),
                 refunded_at=CASE WHEN $2 THEN now() ELSE refunded_at END,
                 transfer_reversal_id=COALESCE($5, transfer_reversal_id),
                  transfer_reversed_cents=GREATEST(transfer_reversed_cents,$6),
                  refunded_amount_cents=GREATEST(refunded_amount_cents,$7),
                   application_fee_refunded_cents=GREATEST(application_fee_refunded_cents,$8),
                 updated_at=now()
             WHERE id=$1`,
            [
              row.id,
              fullRefund,
              refundInfo?.id ?? null,
              refundInfo?.status ?? null,
              typeof reversal === "string" ? reversal : reversal?.id ?? null,
              verifiedTransferReversedCents,
               verifiedRefundedCents,
                verifiedApplicationFeeRefundedCents,
            ],
          );
          // Only the first completed refund may mutate the recipient/roster.
          // Later deliveries must not undo a subsequent RSVP or repayment.
          if (fullRefund && row.status !== "refunded") {
            await client.query(
              `UPDATE public.payment_request_recipients
               SET is_paid=false, payment_method=NULL, paid_at=NULL,
                   is_confirmed=false, confirmed_at=NULL, updated_at=now()
               WHERE id=$1 AND payment_request_id=$2`,
              [row.recipient_id, row.payment_request_id],
            );
            const released = await releaseRefundedScrimmageRequest(client, refundScrimmage, row.payer_user_id);
            committedRefund = {
              paymentRequestId: row.payment_request_id,
              organizerUserId: row.organizer_user_id,
              payerUserId: row.payer_user_id,
              scrimmageId: refundScrimmage?.id ?? null,
              ...released,
            };
          }
        } else if ((effect === "dispute_created" || effect === "dispute_closed") && verifiedDispute) {
          const transition = organizerDisputeTransition(row, verifiedDispute);
          const accounting = organizerDisputeAccounting(verifiedDispute);
          // A provider read made before another delivery obtained the lock must
          // not replace a final outcome or a more complete append-only ledger.
          const acceptAccounting = verifiedDispute.status === transition.disputeStatus &&
            (row.dispute_id !== verifiedDispute.id ||
             accounting.entries >= (row.dispute_balance_transaction_count ?? 0));
          const accountingChanged = acceptAccounting && (
            row.disputed_amount_cents !== accounting.amount || row.dispute_fee_cents !== accounting.fees ||
            row.dispute_balance_net_cents !== accounting.net ||
            row.dispute_balance_transaction_count !== accounting.entries
          );
          if (row.status !== transition.paymentStatus ||
              row.dispute_id !== verifiedDispute.id || row.dispute_status !== transition.disputeStatus || accountingChanged) {
            await client.query(
              `UPDATE public.organizer_card_payments
                SET status=$2, dispute_id=$3, dispute_status=$4,
                    disputed_amount_cents=CASE WHEN $5 THEN $6 ELSE disputed_amount_cents END,
                    dispute_fee_cents=CASE WHEN $5 THEN $7 ELSE dispute_fee_cents END,
                    dispute_balance_net_cents=CASE WHEN $5 THEN $8 ELSE dispute_balance_net_cents END,
                    dispute_balance_transaction_count=CASE WHEN $5 THEN $9 ELSE dispute_balance_transaction_count END,
                    updated_at=now()
               WHERE id=$1`,
              [row.id, transition.paymentStatus, verifiedDispute.id, transition.disputeStatus,
                acceptAccounting, accounting.amount, accounting.fees, accounting.net, accounting.entries],
            );
          }
          if (transition.clearRecipient) {
            await client.query(lostDisputeRecipientReset(row));
          }
        }
      }
    }

    await client.query(
      "UPDATE public.stripe_connect_webhook_events SET processed_at=now() WHERE event_id=$1",
      [event.id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  // Reuse normal backup promotion only after releasing the transaction's
  // scrimmage lock. The normal promotion path also checks capacity atomically.
  if (committedRefund) await onInvoiceRefundCommitted(committedRefund);
}

export function registerOrganizerCardPaymentRoutes(
  app: Express,
  isAuthenticated: RequestHandler,
  requireFounder: RequestHandler,
  onInvoiceRefundCommitted: (refund: CommittedInvoiceRefund) => Promise<void>,
) {
  registerOrganizerDirectRoutes(app, isAuthenticated, requestAppOrigin, sendPaymentError);
  app.get("/api/organizer-card-payments/connect/status", isAuthenticated, async (req: any, res) => {
    const userId = userIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const eligible = await hasOrganizerCardCollectionEntitlement(userId).catch(() => false);
    if (!eligible) {
      return res.json({ enabled: false, onboardingEnabled: false, webhookReady: false, eligible: false, connected: false, ready: false });
    }
    let stripe: Stripe;
    try {
      assertDirectOnboardingEnabled();
      stripe = getOrganizerCardStripe();
    } catch {
      return res.json({
        enabled: false,
        onboardingEnabled: false,
        webhookReady: false,
        eligible,
        connected: false,
        ready: false,
        detailsSubmitted: false,
        chargesEnabled: false,
        transfersEnabled: false,
        payoutsEnabled: false,
        currentlyDue: [],
      });
    }
    try {
      let webhookReady = true;
      try {
        assertOrganizerCardWebhooksReady();
      } catch {
        webhookReady = false;
      }
      const status = eligible
        ? await getVerifiedConnectedAccountStatus(userId, stripe)
        : { connected: false, accountId: null, ready: false, detailsSubmitted: false, chargesEnabled: false, transfersEnabled: false, payoutsEnabled: false, currentlyDue: [] };
      const { accountId: _accountId, ...publicStatus } = status;
      const collectionEnabled = isDirectCollectionEnabled() && await isOrganizerCardPilotUser(userId);
      res.json({ enabled: collectionEnabled, onboardingEnabled: true, webhookReady, eligible, ...publicStatus });
    } catch (error) {
      sendPaymentError(res, error);
    }
  });

  app.post("/api/organizer-card-payments/connect/onboarding", isAuthenticated, async (req: any, res) => {
    const userId = userIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    try {
      if (!await hasOrganizerCardCollectionEntitlement(userId)) {
        throw new OrganizerCardPaymentError("Connecting a receiving account requires your own active Player Pro subscription or higher.", 403, "subscription_required");
      }
      assertDirectOnboardingEnabled();
      const accountLink = await onboardDirectAccount(userId, getOrganizerCardStripe(), requestAppOrigin(req));
      res.json({ url: accountLink.url });
    } catch (error) {
      sendPaymentError(res, error);
    }
  });

  app.post("/api/organizer-card-payments/checkout-session", isAuthenticated, async (req: any, res) => {
    const payerUserId = userIdFromRequest(req);
    if (!payerUserId) return res.status(401).json({ message: "Authentication required" });
    const paymentRequestId = typeof req.body?.paymentRequestId === "string" ? req.body.paymentRequestId : "";
    if (!paymentRequestId) return res.status(400).json({ message: "Payment request is required" });
    try {
      await assertOrganizerCardPilotUser(payerUserId);
      // Retired clients must update rather than create a platform-owned charge.
      return res.status(409).json({ message: "Reload the app to use direct organizer checkout.", code: "direct_checkout_required" });
    } catch (error) {
      sendPaymentError(res, error);
    }
  });

  app.get("/api/organizer-card-payments/requests/:requestId", isAuthenticated, async (req: any, res) => {
    const viewerId = userIdFromRequest(req);
    if (!viewerId) return res.status(401).json({ message: "Authentication required" });
    if (!isOrganizerCardPaymentsActiveInCurrentRuntime()) {
      return res.json({ enabled: false, webhookReady: false, cardEnabled: false, payments: [] });
    }
    try {
      if (!await isOrganizerCardPilotUser(viewerId)) {
        return res.json({ enabled: false, webhookReady: false, cardEnabled: false, payments: [] });
      }
      const requestId = String(req.params.requestId);
      const access = await pool.query<{ allowed: boolean; card_enabled: boolean; amount_per_person: string; title: string; refund_releases_spot: boolean }>(`
        SELECT pr.card_enabled, pr.amount_per_person::text, pr.title,
        EXISTS (
          SELECT 1 FROM public.scrimmages s
          WHERE s.id=pr.related_scrimmage_id AND s.join_mode='first_pay'
        ) AS refund_releases_spot, (
          pr.creator_id=$2
          OR EXISTS (
            SELECT 1 FROM public.payment_request_recipients rr
            WHERE rr.payment_request_id=pr.id AND rr.user_id=$2
          )
          OR EXISTS (
            SELECT 1 FROM public.scrimmage_co_hosts ch
            WHERE ch.scrimmage_id=pr.related_scrimmage_id AND ch.user_id=$2
          )
        ) AS allowed
        FROM public.payment_requests pr WHERE pr.id=$1 LIMIT 1
      `, [requestId, viewerId]);
      if (!access.rows[0]) return res.status(404).json({ message: "Payment request not found." });
      if (!access.rows[0].allowed) return res.status(403).json({ message: "You cannot view these card payments." });
      const rows = await pool.query(`
        SELECT id, recipient_id AS "recipientId", payer_user_id AS "payerUserId",
               organizer_user_id AS "organizerUserId", base_amount_cents AS "baseAmountCents",
               service_fee_cents AS "serviceFeeCents", total_amount_cents AS "totalAmountCents",
               payment_flow AS "paymentFlow", processing_surcharge_cents AS "processingSurchargeCents",
               currency, status, receipt_url AS "receiptUrl", refund_status AS "refundStatus",
               refunded_amount_cents AS "refundedAmountCents",
               refunded_at AS "refundedAt", dispute_status AS "disputeStatus",
               created_at AS "createdAt"
        FROM public.organizer_card_payments
        WHERE payment_request_id=$1 AND (payer_user_id=$2 OR organizer_user_id=$2 OR EXISTS (
          SELECT 1 FROM public.scrimmage_co_hosts ch
          JOIN public.payment_requests pr ON pr.related_scrimmage_id=ch.scrimmage_id
          WHERE pr.id=$1 AND ch.user_id=$2
        ))
        ORDER BY created_at DESC
      `, [requestId, viewerId]);
      res.json({
        enabled: true,
        paymentFlow: "direct",
        refundReleasesSpot: access.rows[0].refund_releases_spot,
        webhookReady: (() => {
          try {
            assertOrganizerCardWebhooksReady();
            assertDirectCollectionEnabled();
            return true;
          } catch {
            return false;
          }
        })(),
        cardEnabled: access.rows[0].card_enabled,
        amountPerPerson: access.rows[0].amount_per_person,
        ...(access.rows[0].card_enabled ? (() => {
          const baseAmountCents = parseBaseAmountCents(access.rows[0].amount_per_person);
          const serviceFeeCents = 0;
          return {
            baseAmountCents,
            serviceFeeCents,
            totalAmountCents: baseAmountCents + serviceFeeCents,
          };
        })() : {}),
        title: access.rows[0].title,
        payments: rows.rows,
      });
    } catch (error) {
      sendPaymentError(res, error);
    }
  });

  app.get("/api/organizer-card-payments/scrimmages/:scrimmageId/settings", isAuthenticated, async (req: any, res) => {
    const viewerId = userIdFromRequest(req);
    if (!viewerId) return res.status(401).json({ message: "Authentication required" });
    if (!isOrganizerCardPaymentsActiveInCurrentRuntime()) {
      return res.json({ enabled: false, cardPaymentEnabled: false });
    }
    try {
      if (!await isOrganizerCardPilotUser(viewerId)) {
        return res.json({ enabled: false, cardPaymentEnabled: false });
      }
      const result = await pool.query<{ creator_id: string; card_payment_enabled: boolean; is_co_host: boolean }>(`
        SELECT s.creator_id, s.card_payment_enabled,
               EXISTS (SELECT 1 FROM public.scrimmage_co_hosts ch
                       WHERE ch.scrimmage_id=s.id AND ch.user_id=$2) AS is_co_host
        FROM public.scrimmages s WHERE s.id=$1 LIMIT 1
      `, [String(req.params.scrimmageId), viewerId]);
      const scrimmage = result.rows[0];
      if (!scrimmage) return res.status(404).json({ message: "Scrimmage not found." });
      if (scrimmage.creator_id !== viewerId && !scrimmage.is_co_host) {
        return res.status(403).json({ message: "You cannot manage this scrimmage." });
      }
      res.json({ enabled: true, cardPaymentEnabled: scrimmage.card_payment_enabled });
    } catch (error) {
      sendPaymentError(res, error);
    }
  });

  app.post("/api/organizer-card-payments/:paymentId/refund", isAuthenticated, async (req: any, res) => {
    const organizerUserId = userIdFromRequest(req);
    if (!organizerUserId) return res.status(401).json({ message: "Authentication required" });
    try {
      await assertOrganizerCardPilotUser(organizerUserId);
      assertOrganizerCardWebhooksReady();
      const stripe = getOrganizerCardStripe();
      const result = await pool.query<PaymentRow>(
        `SELECT p.* FROM public.organizer_card_payments p
         WHERE p.id=$1 AND (
           p.organizer_user_id=$2
           OR EXISTS (
             SELECT 1 FROM public.payment_requests pr
             JOIN public.scrimmage_co_hosts ch ON ch.scrimmage_id=pr.related_scrimmage_id
             WHERE pr.id=p.payment_request_id AND ch.user_id=$2 AND ch.can_manage_payments=true
           )
         )
         LIMIT 1`,
        [String(req.params.paymentId), organizerUserId],
      );
      const payment = result.rows[0];
      if (!payment) throw new OrganizerCardPaymentError("Card payment not found.", 404, "payment_not_found");
      if (payment.payment_flow === "direct") {
        return res.json(await requestDirectInvoiceRefund(stripe, payment));
      }
      if (payment.status === "refund_pending") {
        return res.json({ status: "refund_pending" });
      }
      if (payment.status === "refunded") {
        return res.json({ status: "refunded" });
      }
      if (payment.status !== "paid" || !payment.stripe_payment_intent_id) {
        throw new OrganizerCardPaymentError("Only a fully paid card transaction can be refunded.", 409, "payment_not_refundable");
      }
      await pool.query(
        `UPDATE public.organizer_card_payments SET status='refund_pending', refund_status='pending', updated_at=now()
         WHERE id=$1 AND status='paid'`,
        [payment.id],
      );
      try {
        const refund = await stripe.refunds.create(organizerInvoiceRefundParams({
          stripe_payment_intent_id: payment.stripe_payment_intent_id,
          base_amount_cents: payment.base_amount_cents,
        }), { idempotencyKey: `organizer-card-refund:${payment.id}` });
        await pool.query(organizerRefundAccountingUpdate(payment.id, refund));
        res.json({ status: "refund_pending", refundStatus: refund.status });
      } catch (error) {
        await pool.query(
          `UPDATE public.organizer_card_payments SET status='paid', refund_status='failed', updated_at=now()
           WHERE id=$1 AND status='refund_pending'`,
          [payment.id],
        );
        throw error;
      }
    } catch (error) {
      sendPaymentError(res, error);
    }
  });

  const handleWebhook = (scope: "platform" | "connect"): RequestHandler => async (req: any, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).send("Missing stripe-signature header");
    try {
      const stripe = getOrganizerCardStripe();
      const webhookSecret = scope === "platform"
        ? getOrganizerCardPaymentsWebhookSecret()
        : getOrganizerCardConnectWebhookSecret();
      const event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        Array.isArray(signature) ? signature[0] : signature,
        webhookSecret,
      );
      if (event.livemode !== isVerifiedProductionRuntime()) {
        return res.status(400).send("Webhook mode does not match this environment");
      }
      if (scope === "platform" && event.account) {
        return res.status(400).send("Connected account events are not accepted on the payment endpoint");
      }
      if (scope === "connect") {
        if (!event.account) return res.status(400).send("Missing connected-account scope");
        if (event.type === "account.updated" && (event.data.object as Stripe.Account).id !== event.account) {
          return res.status(400).send("Account scope mismatch");
        }
        if (event.type !== "account.updated") {
          await applyDirectOrganizerEvent(stripe, event, onInvoiceRefundCommitted);
          return res.json({ received: true });
        }
      }
      await applyStripeEvent(stripe, event, scope, onInvoiceRefundCommitted);
      res.json({ received: true });
    } catch (error: any) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        return res.status(400).send("Invalid webhook signature");
      }
      sendPaymentError(res, error);
    }
  };
  app.post("/api/stripe-card-payments-webhook", handleWebhook("platform"));
  app.post("/api/stripe-connect-webhook", handleWebhook("connect"));

  app.get("/api/admin/organizer-card-payments/report", isAuthenticated, requireFounder, async (req: any, res) => {
    if (!isOrganizerCardPaymentsActiveInCurrentRuntime()) {
      return res.status(503).json({ message: "Organizer card payment reporting is disabled in this environment." });
    }
    try {
      let filters;
      try {
        filters = organizerReportFilters(req.query);
      } catch (error) {
        return res.status(400).json({ message: (error as Error).message });
      }
      const report = await loadOrganizerPaymentReport(pool, filters);
      if (req.query.format === "csv") {
        if (report.summary.payments_count > report.payments.length) {
          return res.status(400).json({ message: "Narrow the date or payment-type filters to export at most 5,000 complete rows." });
        }
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="organizer-card-payments.csv"');
        return res.send(organizerReportCsv(report.payments));
      }
      res.json(report);
    } catch (error) {
      sendPaymentError(res, error);
    }
  });
}
