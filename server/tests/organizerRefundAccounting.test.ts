import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { isOrganizerInvoiceRefunded, organizerInvoiceRefundParams, organizerRefundAccountingUpdate } from "../organizerRefundAccounting";

test("refund SQL parameters keep status, reversal identifier and actual amount in order", () => {
  const update = organizerRefundAccountingUpdate("payment_test", {
    id: "re_test", status: "succeeded", amount: 2000,
    transfer_reversal: { id: "trr_test", amount: 2000 },
  } as Stripe.Refund);
  assert.deepEqual(update.values, ["payment_test", "re_test", "succeeded", "trr_test", 2000, 2000]);
  assert.equal(Math.max(...Array.from(update.text.matchAll(/\$(\d+)/g), match => Number(match[1]))), update.values.length);
});

test("unexpanded reversal identifiers do not invent a monetary amount", () => {
  const update = organizerRefundAccountingUpdate("payment_test", {
    id: "re_test", status: "pending", transfer_reversal: "trr_test",
  } as Stripe.Refund);
  assert.deepEqual(update.values, ["payment_test", "re_test", "pending", "trr_test", 0, 0]);
  assert.match(update.text, /GREATEST\(transfer_reversed_cents,\$5\)/);
});

test("refunds return only the invoice amount and never refund the application fee", () => {
  assert.deepEqual(organizerInvoiceRefundParams({
    stripe_payment_intent_id: "pi_test", base_amount_cents: 2000,
  }), {
    payment_intent: "pi_test", amount: 2000, reverse_transfer: true,
    refund_application_fee: false, expand: ["transfer_reversal"],
  });
});

test("returning the base amount completes the invoice refund, not a smaller partial refund", () => {
  assert.equal(isOrganizerInvoiceRefunded(2000, 1999), false);
  assert.equal(isOrganizerInvoiceRefunded(2000, 2000), true);
  assert.equal(isOrganizerInvoiceRefunded(2000, 2150), true);
});
