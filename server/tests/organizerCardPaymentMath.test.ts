import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateOrganizerServiceFeeCents,
  OrganizerCardPaymentError,
  parseBaseAmountCents,
} from "../organizerCardPaymentMath";

test("parses positive USD amounts into exact integer cents", () => {
  assert.equal(parseBaseAmountCents("20"), 2000);
  assert.equal(parseBaseAmountCents("20.5"), 2050);
  assert.equal(parseBaseAmountCents("0.01"), 1);
});

test("calculates the 5 percent plus 50 cent service fee in integer cents", () => {
  assert.equal(calculateOrganizerServiceFeeCents(2000), 150);
  assert.equal(calculateOrganizerServiceFeeCents(1001), 100);
  assert.equal(calculateOrganizerServiceFeeCents(1), 50);
  assert.equal(calculateOrganizerServiceFeeCents(10), 51);
});

test("rejects invalid, zero, negative, and over-precision invoice amounts", () => {
  for (const value of ["0", "-1.00", "1.001", "1e3", "NaN", ""]) {
    assert.throws(() => parseBaseAmountCents(value), OrganizerCardPaymentError);
  }
  assert.throws(() => calculateOrganizerServiceFeeCents(0), OrganizerCardPaymentError);
  assert.throws(() => calculateOrganizerServiceFeeCents(1.2), OrganizerCardPaymentError);
});
