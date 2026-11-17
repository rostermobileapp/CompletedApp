import type Stripe from "stripe";

export function organizerRefundAccountingUpdate(paymentId: string, refund: Stripe.Refund) {
  const reversal = refund.transfer_reversal;
  return {
    text: `UPDATE public.organizer_card_payments
      SET refund_id=$2, refund_status=$3,
          transfer_reversal_id=COALESCE($4, transfer_reversal_id),
          transfer_reversed_cents=GREATEST(transfer_reversed_cents,$5),
          updated_at=now()
      WHERE id=$1`,
    values: [
      paymentId,
      refund.id,
      refund.status,
      typeof reversal === "string" ? reversal : reversal?.id ?? null,
      typeof reversal === "object" && reversal ? reversal.amount : 0,
    ],
  };
}
