import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { matchesOrganizerDispute, organizerDisputeTransition, lostDisputeRecipientReset } from "../organizerDisputeState";

const payment = {
  status: "paid", stripe_payment_intent_id: "pi_test", stripe_charge_id: "ch_test",
  total_amount_cents: 2150, dispute_id: null, dispute_status: null,
};
const dispute = {
  id: "dp_test", payment_intent: "pi_test", charge: "ch_test",
  amount: 2150, currency: "usd", status: "needs_response",
} as Stripe.Dispute;

test("disputes must match the stored charge, intent, currency and amount", () => {
  assert.equal(matchesOrganizerDispute(payment, dispute), true);
  for (const invalid of [
    { ...dispute, charge: "ch_other" }, { ...dispute, payment_intent: "pi_other" },
    { ...dispute, currency: "eur" }, { ...dispute, amount: 2151 }, { ...dispute, amount: 0 },
  ]) assert.equal(matchesOrganizerDispute(payment, invalid), false);
});

test("an open dispute remains distinct from a completed loss", () => {
  assert.deepEqual(organizerDisputeTransition(payment, dispute), {
    disputeStatus: "needs_response", paymentStatus: "disputed", clearRecipient: false,
  });
});

test("a stale open snapshot cannot reopen a won or lost dispute", () => {
  for (const status of ["won", "lost"]) {
    const transition = organizerDisputeTransition({
      ...payment, dispute_id: dispute.id, dispute_status: status,
    }, dispute);
    assert.equal(transition.disputeStatus, status);
    assert.equal(transition.paymentStatus, status === "won" ? "paid" : "disputed");
    assert.equal(transition.clearRecipient, false);
  }
});

test("only the first confirmed loss clears the invoice, not duplicate losses after repayment", () => {
  const lost = { ...dispute, status: "lost" } as Stripe.Dispute;
  assert.equal(organizerDisputeTransition(payment, lost).clearRecipient, true);
  assert.equal(organizerDisputeTransition({
    ...payment, dispute_id: dispute.id, dispute_status: "lost",
  }, lost).clearRecipient, false);
});

test("dispute closure never reverses an existing refund", () => {
  for (const status of ["refunded", "refund_pending"]) {
    for (const outcome of ["won", "lost"]) {
      const result = organizerDisputeTransition({ ...payment, status },
        { ...dispute, status: outcome } as Stripe.Dispute);
      assert.equal(result.paymentStatus, status);
      assert.equal(result.clearRecipient, false);
    }
  }
});

test("a closed enquiry does not leave a paid invoice blocked as an active dispute", () => {
  const result = organizerDisputeTransition(payment, { ...dispute, status: "warning_closed" });
  assert.equal(result.paymentStatus, "paid");
  assert.equal(result.clearRecipient, false);
});

test("an enquiry can escalate without being incorrectly frozen as a final won/lost outcome", () => {
  const result = organizerDisputeTransition({
    ...payment, dispute_id: dispute.id, dispute_status: "warning_closed",
  }, dispute);
  assert.equal(result.disputeStatus, "needs_response");
  assert.equal(result.paymentStatus, "disputed");
});

test("invoice reset SQL protects replacement manual payments and newer card attempts", () => {
  const query = lostDisputeRecipientReset({
    id: "payment_test", recipient_id: "recipient_test", payment_request_id: "invoice_test",
  });
  assert.deepEqual(query.values, ["recipient_test", "invoice_test", "payment_test"]);
  assert.match(query.text, /rr.payment_method IS NULL OR rr.payment_method='stripe'/);
  assert.match(query.text, /newer.created_at>disputed.created_at/);
  assert.match(query.text, /is_confirmed=false, confirmed_at=NULL/);
});
