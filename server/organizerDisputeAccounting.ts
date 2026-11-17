import type Stripe from "stripe";

export function organizerDisputeAccounting(dispute: Stripe.Dispute) {
  let fees = 0;
  let net = 0;
  if (dispute.currency !== "usd" || !Number.isSafeInteger(dispute.amount)) {
    throw new Error("Unsupported dispute accounting.");
  }
  for (const entry of dispute.balance_transactions) {
    if (entry.currency !== "usd" ||
        ![entry.amount, entry.fee, entry.net].every(Number.isSafeInteger) ||
        entry.net !== entry.amount - entry.fee) {
      throw new Error("Dispute balance entries are not finalized USD accounting.");
    }
    fees += entry.fee;
    net += entry.net;
  }
  return {
    amount: dispute.amount,
    fees,
    net,
    entries: dispute.balance_transactions.length,
  };
}
