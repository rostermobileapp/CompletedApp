import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { organizerRefundAccountingUpdate } from "../organizerRefundAccounting";

test("refund SQL parameters keep status, reversal identifier and actual amount in order", () => {
  const update = organizerRefundAccountingUpdate("payment_test", {
    id: "re_test", status: "succeeded",
    transfer_reversal: { id: "trr_test", amount: 2150 },
  } as Stripe.Refund);
  assert.deepEqual(update.values, ["payment_test", "re_test", "succeeded", "trr_test", 2150]);
  assert.equal(Math.max(...Array.from(update.text.matchAll(/\$(\d+)/g), match => Number(match[1]))), update.values.length);
});

test("unexpanded reversal identifiers do not invent a monetary amount", () => {
  const update = organizerRefundAccountingUpdate("payment_test", {
    id: "re_test", status: "pending", transfer_reversal: "trr_test",
  } as Stripe.Refund);
  assert.deepEqual(update.values, ["payment_test", "re_test", "pending", "trr_test", 0]);
  assert.match(update.text, /GREATEST\(transfer_reversed_cents,\$5\)/);
});
