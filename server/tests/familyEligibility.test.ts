import test from "node:test";
import assert from "node:assert/strict";
import { familyAgeEligibility } from "../../shared/familyEligibility";
import { requireFamilyAdultAccount } from "../familyEligibility";
import { HighSchoolOnboarding, OnboardingError, type OnboardingActor } from "../highSchoolOnboarding";
import type { HighSchoolParentSecurity, ParentSql } from "../highSchoolParentSecurity";

const now = new Date("2026-11-24T17:00:00Z");
const actor: OnboardingActor = {
  authId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000002",
  email: "adult@example.com", emailVerified: true, fixture: true,
};
const denied = (code: string) => (error: unknown) => error instanceof OnboardingError && error.code === code && error.status === 403;

test("family eligibility opens at 21, not 18, and remains available at older ages", () => {
  for (const dob of ["2005-11-24", "2005-11-23", "1980-01-01"])
    assert.equal(familyAgeEligibility(dob, now).eligible, true);
  for (const dob of ["2005-11-25", "2006-01-01", "2008-11-24", "2010-01-01"])
    assert.deepEqual(familyAgeEligibility(dob, now), { eligible: false, reason: "under_21" });
});
test("one application calendar prevents UTC or caller timezone from opening a birthday early", () => {
  assert.equal(familyAgeEligibility("2005-11-25", new Date("2026-11-25T04:59:59Z")).eligible, false);
  assert.equal(familyAgeEligibility("2005-11-25", new Date("2026-11-25T05:00:00Z")).eligible, true);
});
test("missing and malformed DOBs fail closed, including impossible and future dates", () => {
  for (const dob of [null, undefined, ""])
    assert.deepEqual(familyAgeEligibility(dob, now), { eligible: false, reason: "dob_required" });
  for (const dob of [21, true, {}, new Date("1990-01-01"), "21", "11/24/1990", "1990-1-1",
    "1990-01-01T00:00:00Z", "1990-01-01 ", "1900-02-29", "2005-02-29", "2000-04-31",
    "0000-01-01", "2000-00-01", "2000-13-01", "2000-01-00", "2026-11-25", "2027-01-01"])
    assert.deepEqual(familyAgeEligibility(dob, now), { eligible: false, reason: "dob_invalid" }, String(dob));
  assert.equal(familyAgeEligibility("1990-01-01", new Date("invalid")).eligible, false);
});
test("leap-day birthdays do not reach 21 on February 28 in a non-leap year", () => {
  assert.equal(familyAgeEligibility("2004-02-29", new Date("2025-02-28T17:00:00Z")).eligible, false);
  assert.equal(familyAgeEligibility("2004-02-29", new Date("2025-03-01T05:00:00Z")).eligible, true);
  assert.equal(familyAgeEligibility("2000-02-29", now).eligible, true);
});
test("the server reads the stored DOB and imposes no role, plan, team or completed-onboarding condition", async () => {
  for (const role of ["free_tier", "player_pro", "commissioner"]) {
    const db = { async query(sql: string, values?: unknown[]) {
      assert.match(sql, /SELECT id,date_of_birth FROM public.users/);
      assert.match(sql, /FOR SHARE/);
      assert.doesNotMatch(sql, /onboarding_completed|role|subscription|memberships/);
      assert.deepEqual(values, [actor.authId, actor.email]);
      return { rows: [{ id: "existing-profile", date_of_birth: "1990-01-01", role, onboarding_completed: false }] };
    } };
    assert.deepEqual(await requireFamilyAdultAccount(db, actor, now), { id: "existing-profile" });
  }
});
test("the server rejects missing, invalid and under-21 stored DOBs, regardless of claimed age", async () => {
  for (const [date_of_birth, code] of [[null, "FAMILY_DOB_REQUIRED"], ["garbage", "FAMILY_DOB_INVALID"],
    ["2008-01-01", "FAMILY_AGE_REQUIRED"]] as const) {
    const db = { query: async () => ({ rows: [{ id: actor.authId, date_of_birth }] }) };
    await assert.rejects(() => requireFamilyAdultAccount(db, { ...actor, age: 99, dateOfBirth: "1980-01-01" } as OnboardingActor, now), denied(code));
  }
});
test("unverified and ambiguous public-profile mappings cannot enroll", async () => {
  const noQuery = { query: async () => { throw new Error("Must not query"); } };
  await assert.rejects(() => requireFamilyAdultAccount(noQuery, { ...actor, emailVerified: false }, now), denied("VERIFIED_EMAIL_REQUIRED"));
  for (const rows of [[], [{ id: "one" }, { id: "two" }]]) {
    await assert.rejects(() => requireFamilyAdultAccount({ query: async () => ({ rows }) }, actor, now), denied("EXISTING_ADULT_ACCOUNT_REQUIRED"));
  }
});
test("shared family intake fails closed without its trusted eligibility check", async () => {
  const calls: string[] = [];
  const tx = {
    async query(sql: string) { calls.push(sql); return { rows: sql.includes("FROM auth.sessions") ? [{}] : [] }; },
    release() {},
  };
  const pool = { query: tx.query, connect: async () => tx } as ParentSql;
  const intake = new HighSchoolOnboarding(pool, {} as HighSchoolParentSecurity, true);
  await assert.rejects(() => intake.lookup(actor, "a".repeat(43), 0), (e: any) => e.code === "FAMILY_ELIGIBILITY_UNAVAILABLE" && e.status === 503);
  assert.equal(calls.includes("ROLLBACK"), true);
  assert.equal(calls.some(sql => /SELECT .*family_flows|UPDATE |INSERT /.test(sql)), false);
});
test("invitation intake rechecks eligibility before reading child data or changing a draft", async () => {
  const calls: string[] = [];
  const tx = {
    async query(sql: string) { calls.push(sql); return { rows: sql.includes("FROM auth.sessions") ? [{}] : [] }; },
    release() {},
  };
  const pool = { query: tx.query, connect: async () => tx } as ParentSql;
  const intake = new HighSchoolOnboarding(pool, {} as HighSchoolParentSecurity, true,
    async () => { throw new OnboardingError("FAMILY_AGE_REQUIRED", 403); });
  await assert.rejects(() => intake.lookup(actor, "a".repeat(43), 0), denied("FAMILY_AGE_REQUIRED"));
  assert.equal(calls.includes("ROLLBACK"), true);
  assert.equal(calls.some(sql => /SELECT .*family_flows|UPDATE |INSERT /.test(sql)), false);
});
