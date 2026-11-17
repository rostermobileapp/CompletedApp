import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { readFinalizedOrganizerCharge } from "../organizerChargeAccounting";

const pending = { transfer: null, application_fee: null, balance_transaction: null } as unknown as Stripe.Charge;
const finalized = {
  transfer: { id: "tr_test" },
  application_fee: { id: "fee_test" },
  balance_transaction: { id: "txn_test" },
} as unknown as Stripe.Charge;

test("complete accounting is returned immediately without a delay", async () => {
  const waits: number[] = [];
  assert.equal(await readFinalizedOrganizerCharge(async () => finalized, async ms => { waits.push(ms); }), finalized);
  assert.deepEqual(waits, []);
});

test("accounting that arrives after payment success is read again within a bounded budget", async () => {
  let reads = 0;
  const waits: number[] = [];
  const result = await readFinalizedOrganizerCharge(
    async () => ++reads < 3 ? pending : finalized,
    async ms => { waits.push(ms); },
  );
  assert.equal(result, finalized);
  assert.deepEqual(waits, [500, 1000]);
});

test("missing transfer or fee details are never accepted as finalized accounting", async () => {
  let reads = 0;
  const waits: number[] = [];
  assert.equal(await readFinalizedOrganizerCharge(async () => {
    reads++;
    return pending;
  }, async ms => { waits.push(ms); }), null);
  assert.equal(reads, 4);
  assert.equal(waits.reduce((a, b) => a + b, 0), 3500);
});
