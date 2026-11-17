import { test } from "node:test";
import assert from "node:assert/strict";
import {
  directSurchargePolicy, quoteDirectProcessing, directStripeOptions, isSafeDirectAccount, directFeePolicyFingerprint,
} from "../organizerDirectPricing";

const policy = {
  merchantCountry: "US" as const, merchantState: "NY", customerStates: ["NY"],
  brands: ["visa"], processorRateBps: 290, processorFixedCents: 30,
  maximumSurchargeBps: 300, approvedUntil: "2027-01-01T00:00:00Z",
};
const preview = { type: "card", card: { funding: "credit", country: "US", brand: "visa" },
  billing_details: { address: { country: "US", state: "NY" } } };

test("player surcharge is capped; organizer absorbs uncovered small-payment costs", () => {
  const q = quoteDirectProcessing(2000, preview, policy, "US", "NY");
  assert.equal(q.processingSurchargeCents, 60);
  assert.equal(q.totalAmountCents, 2060);
  assert.ok(Math.round(q.totalAmountCents * 0.029) + 30 > q.processingSurchargeCents);
  assert.match(q.feeExplanation, /organizer covers/i);
});
test("debit, prepaid, unknown, foreign, unapproved brands and states are never surcharged", () => {
  for (const card of [
    { ...preview.card, funding: "debit" }, { ...preview.card, funding: "prepaid" },
    { ...preview.card, funding: "unknown" }, { ...preview.card, country: "CA" },
    { ...preview.card, brand: "amex" },
  ]) assert.equal(quoteDirectProcessing(2000, { ...preview, card }, policy, "US", "NY").processingSurchargeCents, 0);
  for (const billing_details of [{ address: { country: "US", state: "CO" } }, { address: { country: "CA", state: "ON" } }, {}]) {
    assert.equal(quoteDirectProcessing(2000, { ...preview, billing_details }, policy, "US", "NY").processingSurchargeCents, 0);
  }
  assert.equal(quoteDirectProcessing(2000, preview, policy, "US", "CA").processingSurchargeCents, 0);
  assert.equal(quoteDirectProcessing(2000, preview, null, "US", "NY").processingSurchargeCents, 0);
});
test("fee math never exceeds the reviewed cap or conservatively calculated cost", () => {
  for (const amount of [50,51,99,500,2000,9999,20000,99000000]) {
    const q = quoteDirectProcessing(amount, preview, policy, "US", "NY");
    assert.equal(q.totalAmountCents, amount + q.processingSurchargeCents);
    assert.ok(q.totalAmountCents <= 99_999_999);
    assert.ok(q.processingSurchargeCents <= Math.floor(amount * 0.03));
    assert.ok(q.processingSurchargeCents <= Math.floor(q.totalAmountCents * 0.029) + 30);
  }
  const strict = quoteDirectProcessing(2000, preview, { ...policy, maximumSurchargeBps: 200 }, "US", "NY");
  assert.equal(strict.processingSurchargeCents, 40);
});
test("only a finite, reviewed account policy is usable; malformed policy fails explicitly", () => {
  const now = Date.parse("2026-11-17T00:00:00Z");
  assert.deepEqual(directSurchargePolicy("acct_owner", JSON.stringify({ acct_owner: policy }), now), policy);
  assert.equal(directSurchargePolicy("acct_other", JSON.stringify({ acct_owner: policy }), now), null);
  assert.equal(directSurchargePolicy("acct_owner", undefined, now), null);
  assert.equal(directSurchargePolicy("acct_owner", JSON.stringify({ acct_owner: { ...policy, approvedUntil: "2026-01-01" } }), now), null);
  assert.throws(() => directSurchargePolicy("acct_owner", "{", now));
  for (const patch of [{ maximumSurchargeBps: 301 }, { maximumSurchargeBps: -1 }, { processorRateBps: 10000 },
    { processorFixedCents: -1 }, { customerStates: ["*"] }, { brands: ["unknown"] }, { approvedUntil: "2099-01-01" }]) {
    assert.throws(() => directSurchargePolicy("acct_owner", JSON.stringify({ acct_owner: { ...policy, ...patch } }), now));
  }
  assert.notEqual(directFeePolicyFingerprint(undefined), directFeePolicyFingerprint(JSON.stringify({ acct_owner: policy })));
});
test("every direct Stripe request has explicit account scope; only surcharges opt into preview", () => {
  assert.deepEqual(directStripeOptions("acct_owner"), { stripeAccount: "acct_owner" });
  assert.deepEqual(directStripeOptions("acct_owner", 60), { stripeAccount: "acct_owner", apiVersion: "2026-03-25.preview" });
  assert.throws(() => directStripeOptions(""));
});
test("direct charges alone are insufficient: Stripe must own negative balances and organizer fees", () => {
  const account = { controller: { losses: { payments: "stripe" }, fees: { payer: "account" },
    stripe_dashboard: { type: "full" }, requirement_collection: "stripe" } };
  assert.equal(isSafeDirectAccount(account), true);
  assert.equal(isSafeDirectAccount({ type: "standard" }), false);
  assert.equal(isSafeDirectAccount({ ...account, deleted: true }), false);
  for (const controller of [
    { ...account.controller, losses: { payments: "application" } },
    { ...account.controller, fees: { payer: "application" } },
    { ...account.controller, stripe_dashboard: { type: "express" } },
    { ...account.controller, requirement_collection: "application" },
  ]) assert.equal(isSafeDirectAccount({ controller }), false);
});
