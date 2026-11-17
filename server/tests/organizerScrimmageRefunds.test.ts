import { test } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "@neondatabase/serverless";
import {
  lockInvoiceRefundScrimmage, releaseRefundedScrimmageRequest, type RefundScrimmage,
} from "../organizerScrimmageRefunds";

const future: RefundScrimmage = {
  id: "scrimmage_test", join_mode: "first_pay", status: "open",
  date_time: "2036-01-01T20:00:00", timezone: "America/New_York", time_tbd: false,
};
const now = new Date("2026-11-17T12:00:00Z");

function fixture(responses: unknown[][] = []) {
  const calls: { text: string; values: unknown[] }[] = [];
  const client = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      return { rows: responses.shift() ?? [] };
    },
  } as unknown as Pick<PoolClient, "query">;
  return { client, calls };
}

test("refund locks derive the scrimmage from an organizer-owned invoice before locking its row", async () => {
  const { client, calls } = fixture([[{ related_scrimmage_id: future.id }], [], [future]]);
  assert.deepEqual(await lockInvoiceRefundScrimmage(client, "invoice_test", "organizer_test"), future);
  assert.deepEqual(calls[0].values, ["invoice_test", "organizer_test"]);
  assert.match(calls[0].text, /creator_id=\$2/);
  assert.deepEqual(calls[1].values, ["scrimmage-payment:scrimmage_test"]);
  assert.match(calls[2].text, /FOR UPDATE/);
});

test("league-fee refunds have no scrimmage lock or roster mutation", async () => {
  const { client, calls } = fixture([[{ related_scrimmage_id: null }]]);
  assert.equal(await lockInvoiceRefundScrimmage(client, "invoice_test", "organizer_test"), null);
  assert.equal(calls.length, 1);
});

test("an approved Pay-to-Play request is removed only for its specific player and scrimmage", async () => {
  const { client, calls } = fixture([[{ status: "approved" }]]);
  assert.deepEqual(await releaseRefundedScrimmageRequest(client, future, "payer_test", now),
    { removedRequest: true, releasedApprovedSpot: true });
  assert.deepEqual(calls[0].values, ["scrimmage_test", "payer_test"]);
  assert.match(calls[0].text, /DELETE FROM public.scrimmage_requests/);
});

test("pending and backup refunds do not claim to have opened an approved spot", async () => {
  for (const status of ["pending", "backup"]) {
    const { client } = fixture([[{ status }]]);
    assert.deepEqual(await releaseRefundedScrimmageRequest(client, future, "payer_test", now),
      { removedRequest: true, releasedApprovedSpot: false });
  }
});

test("an already-removed request cannot trigger a second backup promotion", async () => {
  const { client } = fixture([[]]);
  assert.deepEqual(await releaseRefundedScrimmageRequest(client, future, "payer_test", now),
    { removedRequest: false, releasedApprovedSpot: false });
});

test("other join modes, cancelled scrimmages and historical attendance remain untouched", async () => {
  for (const scrimmage of [
    null,
    { ...future, join_mode: "approval" },
    { ...future, join_mode: "first_come" },
    { ...future, status: "cancelled" },
    { ...future, date_time: "2020-01-01T20:00:00" },
  ]) {
    const { client, calls } = fixture();
    assert.deepEqual(await releaseRefundedScrimmageRequest(client, scrimmage, "payer_test", now),
      { removedRequest: false, releasedApprovedSpot: false });
    assert.equal(calls.length, 0);
  }
});

test("release eligibility uses the scrimmage's local time, not UTC", async () => {
  const localNow = new Date("2026-11-17T12:00:00Z");
  const upcoming = fixture([[{ status: "approved" }]]);
  assert.equal((await releaseRefundedScrimmageRequest(upcoming.client,
    { ...future, date_time: "2026-11-17 08:00:00" }, "payer_test", localNow)).releasedApprovedSpot, true);
  const started = fixture();
  assert.equal((await releaseRefundedScrimmageRequest(started.client,
    { ...future, date_time: "2026-11-17 06:00:00" }, "payer_test", localNow)).releasedApprovedSpot, false);
  assert.equal(started.calls.length, 0);
});
