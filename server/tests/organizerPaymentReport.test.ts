import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { organizerReportFilters, organizerReportCsv } from "../organizerPaymentReport";
import { organizerDisputeAccounting } from "../organizerDisputeAccounting";

function dispute(status: string, entries: { amount: number; fee: number; net: number }[]) {
  return { status, amount: 2150, currency: "usd",
    balance_transactions: entries.map(entry => ({ ...entry, currency: "usd" })),
  } as Stripe.Dispute;
}

test("a won dispute can return principal without returning its Stripe fee", () => {
  assert.deepEqual(organizerDisputeAccounting(dispute("won", [
    { amount: -2150, fee: 1500, net: -3650 }, { amount: 2150, fee: 0, net: 2150 },
  ])), { amount: 2150, fees: 1500, net: -1500, entries: 2 });
});

test("lost disputes include principal and fees without calling the invoice paid", () => {
  assert.deepEqual(organizerDisputeAccounting(dispute("lost", [
    { amount: -2150, fee: 1500, net: -3650 },
  ])), { amount: 2150, fees: 1500, net: -3650, entries: 1 });
});

test("unfunded enquiries have no invented withdrawal or fee", () => {
  assert.deepEqual(organizerDisputeAccounting(dispute("warning_needs_response", [])),
    { amount: 2150, fees: 0, net: 0, entries: 0 });
});

test("dispute accounting refuses mixed currency or inconsistent balances", () => {
  const invalid = dispute("lost", [{ amount: -2150, fee: 1500, net: -2150 }]);
  assert.throws(() => organizerDisputeAccounting(invalid), /accounting/);
  assert.throws(() => organizerDisputeAccounting({ ...invalid, currency: "eur" }), /accounting/);
});

test("report filters accept exact dates and all supported payment types", () => {
  assert.deepEqual(organizerReportFilters({}), { from: null, to: null, eventType: "all" });
  for (const eventType of ["all", "scrimmage", "league_fee", "message"]) {
    assert.equal(organizerReportFilters({ from: "2024-02-29", to: "2026-11-17", eventType }).eventType, eventType);
  }
});

test("report filters reject impossible dates, arrays, inverted ranges and unrecognized types", () => {
  for (const input of [
    { from: "2026-02-30" }, { from: "0000-01-01" }, { to: "2026-13-01" }, { from: ["2026-11-17"] },
    { to: {} }, { eventType: ["all"] }, { eventType: "' OR true--" },
    { from: "2026-11-18", to: "2026-11-17" }, { from: "2026-11-17T00:00:00Z" },
  ]) assert.throws(() => organizerReportFilters(input));
});

test("CSV has stable accounting headers even for empty results", () => {
  const empty = organizerReportCsv([]);
  assert.match(empty, /"dispute_fee_cents","dispute_balance_net_cents","platform_net_cents"/);
  assert.equal(empty.split("\r\n").length, 1);
});

test("CSV escapes formulas, embedded quotes, commas and newlines but preserves negative money", () => {
  for (const title of ["=1+1", "  =1+1", "\t@SUM(A1)", "+cmd", "-cmd"]) {
    const csv = organizerReportCsv([{ title, platform_net_cents: -3592 }]);
    assert.ok(csv.includes(`"'${title}"`));
    assert.ok(csv.includes('"-3592"'));
  }
  assert.ok(organizerReportCsv([{ title: 'Quote "one",\nnext' }]).includes('"Quote ""one"",\nnext"'));
});
