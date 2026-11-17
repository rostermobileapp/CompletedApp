import type Stripe from "stripe";

export async function readFinalizedOrganizerCharge(
  loadCharge: () => Promise<Stripe.Charge>,
  wait: (milliseconds: number) => Promise<void> = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<Stripe.Charge | null> {
  // Payment success can arrive before Stripe finishes creating the destination
  // transfer, application fee and balance transaction. Stay inside a short
  // webhook response budget; if still incomplete, let Stripe retry delivery.
  for (const pause of [0, 500, 1000, 2000]) {
    if (pause) await wait(pause);
    const charge = await loadCharge();
    if (charge.transfer && typeof charge.transfer === "object" &&
        charge.application_fee && typeof charge.application_fee === "object" &&
        charge.balance_transaction && typeof charge.balance_transaction === "object") {
      return charge;
    }
  }
  return null;
}
