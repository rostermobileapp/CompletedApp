import type Stripe from "stripe";

export function organizerInvoiceRefundParams(payment: {
  stripe_payment_intent_id: string;
  base_amount_cents: number;
}): Stripe.RefundCreateParams {
  return {
    payment_intent: payment.stripe_payment_intent_id,
    amount: payment.base_amount_cents,
    reverse_transfer: true,
    refund_application_fee: false,
    expand: ["transfer_reversal"],
  };
}

export function isOrganizerInvoiceRefunded(baseAmountCents: number, actualRefundedCents: number) {
  return actualRefundedCents >= baseAmountCents;
}

export function organizerRefundAccountingUpdate(paymentId: string, refund: Stripe.Refund) {
  const reversal = refund.transfer_reversal;
  return {
    text: `UPDATE public.organizer_card_payments
      SET refund_id=$2, refund_status=$3,
          transfer_reversal_id=COALESCE($4, transfer_reversal_id),
          transfer_reversed_cents=GREATEST(transfer_reversed_cents,$5),
          refunded_amount_cents=GREATEST(refunded_amount_cents,$6),
          updated_at=now()
      WHERE id=$1`,
    values: [
      paymentId,
      refund.id,
      refund.status,
      typeof reversal === "string" ? reversal : reversal?.id ?? null,
      typeof reversal === "object" && reversal ? reversal.amount : 0,
      refund.status === "succeeded" ? refund.amount : 0,
    ],
  };
}
