import type Stripe from "stripe";

type DisputePayment = {
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id?: string | null;
  total_amount_cents: number;
  dispute_id?: string | null;
  dispute_status?: string | null;
};

const finalStatuses = new Set(["won", "lost"]);
const identifier = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

export function matchesOrganizerDispute(payment: DisputePayment, dispute: Stripe.Dispute) {
  return !!payment.stripe_payment_intent_id && !!payment.stripe_charge_id &&
    identifier(dispute.payment_intent) === payment.stripe_payment_intent_id &&
    identifier(dispute.charge) === payment.stripe_charge_id &&
    dispute.currency === "usd" &&
    dispute.amount > 0 && dispute.amount <= payment.total_amount_cents;
}

export function organizerDisputeTransition(payment: DisputePayment, dispute: Stripe.Dispute) {
  // Even a current-provider read can race a terminal delivery before obtaining
  // our row lock. Final states for the same dispute must not be reopened.
  const sameDispute = payment.dispute_id === dispute.id;
  const status = sameDispute && finalStatuses.has(payment.dispute_status ?? "")
    ? payment.dispute_status!
    : dispute.status;
  const protectedRefund = ["refunded", "refund_pending"].includes(payment.status);
  return {
    disputeStatus: status,
    paymentStatus: protectedRefund ? payment.status
      : status === "won" || status === "warning_closed" ? "paid" : "disputed",
    // A replay of a previous loss must never clear a later manual/card payment.
    clearRecipient: !protectedRefund && status === "lost" &&
      !(sameDispute && payment.dispute_status === "lost"),
  };
}

export function lostDisputeRecipientReset(payment: {
  id: string; recipient_id: string; payment_request_id: string;
}) {
  return {
    text: `UPDATE public.payment_request_recipients rr
      SET is_paid=false, payment_method=NULL, paid_at=NULL,
          is_confirmed=false, confirmed_at=NULL, updated_at=now()
      WHERE rr.id=$1 AND rr.payment_request_id=$2
        AND (rr.payment_method IS NULL OR rr.payment_method='stripe')
        AND NOT EXISTS (
          SELECT 1 FROM public.organizer_card_payments newer
          JOIN public.organizer_card_payments disputed ON disputed.id=$3
          WHERE newer.recipient_id=rr.id AND newer.id<>disputed.id
            AND newer.created_at>disputed.created_at
            AND newer.status IN ('paid','refund_pending','disputed')
        )
      RETURNING rr.id`,
    values: [payment.recipient_id, payment.payment_request_id, payment.id],
  };
}
