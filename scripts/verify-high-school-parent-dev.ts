/**
 * Owner-approved DEV operational verification using only synthetic accounts.
 * Tests the SAME service, HTTP handlers and authorization function as the app.
 * The email sink is process-private. No live delivery, UI bypass or public code API.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import express from "express";
import type { Server } from "node:http";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";
import { enrollSyntheticParent } from "./lib/enroll-high-school-parent-dev-fixture";
import { verifyParentBrowser } from "./lib/high-school-parent-browser";
import { HighSchoolParentSecurity, ParentSecurityError, parentDigest } from "../server/highSchoolParentSecurity";
import {
  PARENT_API, parentActorFromVerifiedToken, parentErrorResponse,
  registerParentVerificationRoutes, requireDevParentAuthority,
} from "../server/highSchoolParentHttp";

const report: Record<string, any> = {
  scope: "Separate DEV only; persistent installed guard; synthetic fixtures",
  realEmailDeliveryVerified: false,
  applicationUiVerified: false,
  checks: [],
  outcome: "not_finished",
};
const check = (name: string) => report.checks.push({ name, passed: true });
let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined;
let server: Server | undefined;
let base: string, adminKey: string, anonKey: string;
const fixtures: string[] = [];
const marker = randomUUID();

async function auth(path: string, admin: boolean, method: string, body?: object, token?: string) {
  const key = admin ? adminKey : anonKey;
  const response = await fetch(`${base}/auth/v1/${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as any };
}

try {
  const connection = await parentDevelopmentConnection();
  pool = connection.pool;
  const db = pool;
  base = connection.origin;
  adminKey = connection.env.DEV_SUPABASE_SERVICE_ROLE_KEY!;
  anonKey = connection.env.DEV_SUPABASE_ANON_KEY!;
  check("separate_dev_sql_auth_and_credentials_verified");
  assert.ok(process.env.DEV_SUPABASE_ACCESS_TOKEN);
  const configResponse = await fetch(`https://api.supabase.com/v1/projects/${new URL(base).hostname.split(".")[0]}/config/auth`, {
    headers: { Authorization: `Bearer ${process.env.DEV_SUPABASE_ACCESS_TOKEN}` },
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json() as Record<string, unknown>;
  assert.equal(Object.entries(config).filter(([key, value]) => value === true &&
    (/^hook_.*_enabled$/.test(key) || /notification/.test(key))).length, 0);
  const triggers = await db.query(`SELECT t.tgname,n.nspname,p.proname FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE cn.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal AND t.tgenabled<>'D'`);
  assert.equal(triggers.rows.length, 1);
  assert.deepEqual(triggers.rows[0], {
    tgname: "hs_parent_security_user", nspname: "hs_parent_security", proname: "guard_user",
  });
  check("auth_delivery_and_reviewed_trigger_preflight_passed");

  const familyEmail = `hs-parent-dev-${randomUUID()}@example.com`;
  const adultEmail = `hs-parent-dev-${randomUUID()}@example.com`;
  const password = `HsProof1!${randomBytes(20).toString("hex")}`;
  const replacement = `HsProof2!${randomBytes(20).toString("hex")}`;
  for (const email of [familyEmail, adultEmail]) {
    const created = await auth("admin/users", true, "POST", {
      email, password, email_confirm: true, app_metadata: { synthetic_high_school_parent_dev: marker },
    });
    if (typeof created.body.id === "string") fixtures.push(created.body.id);
    assert.equal(created.status, 200);
    assert.ok(created.body.id);
  }
  const [family, adult] = fixtures;
  await enrollSyntheticParent(db, family, marker);
  const login = (email: string, value: string) =>
    auth("token?grant_type=password", false, "POST", { email, password: value });
  const first = await login(familyEmail, password);
  const second = await login(familyEmail, password);
  const adultSession = await login(adultEmail, password);
  for (const signed of [first, second, adultSession]) assert.equal(signed.status, 200);
  const t1 = first.body.access_token;
  const t2 = second.body.access_token;
  const issuer = `${base}/auth/v1`;
  const actor1 = parentActorFromVerifiedToken(t1, family, issuer);
  const actor2 = parentActorFromVerifiedToken(t2, family, issuer);
  assert.notEqual(actor1.sessionId, actor2.sessionId);
  check("enrolled_family_preserves_shared_login_and_distinct_sessions");

  const mailbox: { to: string; code: string; purpose: string }[] = [];
  let deliveryWorks = false;
  const security = new HighSchoolParentSecurity(db, async mail => {
    if (!deliveryWorks) throw new Error("Synthetic delivery failure");
    mailbox.push(mail);
  });
  assert.equal(await security.installed(), true);
  const app = express();
  app.use(express.json());
  const verified = async (req: express.Request) => {
    const header = req.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new ParentSecurityError("INVALID_SESSION", 401);
    const token = header.slice(7);
    const result = await auth("user", false, "GET", undefined, token);
    if (result.status !== 200) throw new ParentSecurityError("INVALID_SESSION", 401);
    return parentActorFromVerifiedToken(token, result.body.id, issuer);
  };
  registerParentVerificationRoutes(app, security, verified);
  // Same function called by isAuthenticated before existing adult API handlers.
  app.all("/api/parent-only-fixture", async (req, res) => {
    try {
      const actor = await verified(req);
      await requireDevParentAuthority(security, actor.authId, req.get("authorization")!.slice(7), issuer, req.get("x-parent-verification"));
      res.json({ allowed: true });
    } catch (error) { parentErrorResponse(res, error); }
  });
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const local = `http://127.0.0.1:${address.port}`;
  const request = async (path: string, token?: string, body?: object, grant?: string) => {
    const result = await fetch(`${local}${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json",
        ...(grant ? { "x-parent-verification": grant } : {}),
        // These forged client choices must grant no authority.
        "x-profile-type": "parent", "x-parent-verified": "true",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() as any, cache: result.headers.get("cache-control") };
  };
  const route = (suffix: string) => `${PARENT_API}/${suffix}`;
  const advanceFixtureRateClock = async () => {
    // Only this run's synthetic account is changed, never an existing account.
    await db.query("UPDATE hs_parent_security.challenges SET created_at=now()-interval '2 hours' WHERE auth_id=$1", [family]);
  };
  const advanceFixtureFailureClock = async () => {
    // Simulate the rolling failure window elapsing for this synthetic account only.
    await db.query(`UPDATE hs_parent_security.audit SET created_at=now()-interval '16 minutes'
      WHERE auth_id=$1 AND event='code_rejected'`, [family]);
  };
  assert.equal((await request("/api/parent-only-fixture", t1)).status, 403);
  assert.equal((await request("/api/parent-only-fixture", t2)).status, 403);
  assert.equal((await request("/api/parent-only-fixture", adultSession.body.access_token)).status, 200);
  assert.equal((await request(route("status"))).status, 401);
  check("parent_api_denies_unverified_sessions_and_forged_profile_headers_without_affecting_adults");

  const bypass = await auth("user", false, "PUT", {
    password: replacement, current_password: password, data: { parent_verified: true },
  }, t1);
  assert.notEqual(bypass.status, 200);
  assert.equal((await login(familyEmail, password)).status, 200);
  assert.notEqual((await login(familyEmail, replacement)).status, 200);
  check("direct_auth_password_mutation_blocked_and_original_password_still_works");
  const adultChange = await auth("user", false, "PUT", { password: replacement, current_password: password }, adultSession.body.access_token);
  assert.equal(adultChange.status, 200);
  assert.equal((await login(adultEmail, replacement)).status, 200);
  check("normal_adult_password_change_remains_unchanged");

  const failedMail = await request(route("challenge"), t1, { purpose: "parent_action", email: "untrusted@example.com" });
  assert.equal(failedMail.status, 503);
  assert.equal(mailbox.length, 0);
  assert.equal((await request("/api/parent-only-fixture", t1)).status, 403);
  check("mail_delivery_failure_does_not_grant_authority_or_claim_success");
  await advanceFixtureRateClock();
  deliveryWorks = true;
  const challenge = await request(route("challenge"), t1, { purpose: "parent_action", email: "untrusted@example.com" });
  assert.equal(challenge.status, 200);
  assert.equal(challenge.cache, "no-store");
  assert.equal(mailbox.at(-1)!.to, familyEmail);
  assert.equal(challenge.body.code, undefined);
  assert.equal(challenge.body.email, undefined);
  assert.equal((await request(route("challenge"), t2, { purpose: "password_change" })).status, 429);
  check("email_recipient_is_server_owned_and_send_limit_spans_sessions_and_purposes");
  const challengeId = challenge.body.challengeId;
  const code = mailbox.at(-1)!.code;
  assert.match(code, /^\d{4}$/);
  assert.equal(challenge.body.expiresInSeconds, 120);
  assert.equal(Number((await db.query(`SELECT extract(epoch FROM expires_at-created_at) AS seconds
    FROM hs_parent_security.challenges WHERE id=$1`, [challengeId])).rows[0].seconds), 120);
  for (const invalid of ["123", "12345", "12345678", 1234]) {
    assert.equal((await request(route("verify"), t1, { challengeId, code: invalid })).status, 400);
  }
  assert.equal((await request(route("verify"), t2, { challengeId, code })).status, 403);
  const wrongCode = code === "0000" ? "0001" : "0000";
  assert.equal((await request(route("verify"), t1, { challengeId, code: wrongCode })).status, 403);
  assert.equal((await db.query("SELECT attempts FROM hs_parent_security.challenges WHERE id=$1", [challengeId])).rows[0].attempts, 1);
  const verifiedCode = await request(route("verify"), t1, { challengeId, code });
  assert.equal(verifiedCode.status, 200);
  const grant = verifiedCode.body.verificationToken;
  assert.equal((await request(route("verify"), t1, { challengeId, code })).status, 403);
  assert.equal((await request("/api/parent-only-fixture", t1, undefined, grant)).status, 200);
  assert.equal((await request("/api/parent-only-fixture", t2, undefined, grant)).status, 403);
  assert.equal((await request(route("password"), t1, { password: replacement }, grant)).status, 403);
  check("code_attempts_commit_and_parent_authority_is_single_code_session_bound_and_purpose_limited");

  await db.query("UPDATE hs_parent_security.grants SET expires_at=now()-interval '1 second' WHERE token_digest=$1", [parentDigest(grant)]);
  assert.equal((await request("/api/parent-only-fixture", t1, undefined, grant)).status, 403);
  await advanceFixtureFailureClock();
  await advanceFixtureRateClock();
  const exhausted = await request(route("challenge"), t1, { purpose: "parent_action" });
  const exhaustedCode = mailbox.at(-1)!.code;
  const incorrect = exhaustedCode === "0000" ? "0001" : "0000";
  assert.equal((await request(route("verify"), t1, { challengeId: exhausted.body.challengeId, code: incorrect })).status, 403);
  // Resending must not erase the first failure.
  await advanceFixtureRateClock();
  const resent = await request(route("challenge"), t1, { purpose: "parent_action" });
  assert.equal(resent.status, 200);
  const resentCode = mailbox.at(-1)!.code;
  await advanceFixtureRateClock();
  const otherPurpose = await request(route("challenge"), t2, { purpose: "password_change" });
  assert.equal(otherPurpose.status, 200);
  const otherCode = mailbox.at(-1)!.code;
  const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => {
    const selected = i % 2 ? otherPurpose : resent;
    const selectedCode = i % 2 ? otherCode : resentCode;
    return request(route("verify"), i % 2 ? t2 : t1, {
      challengeId: selected.body.challengeId, code: selectedCode === "0000" ? "0001" : "0000",
    });
  }));
  assert.equal(burst.filter(result => result.status === 403).length, 2);
  assert.equal(burst.filter(result => result.status === 429).length, 3);
  const failures = await db.query(`SELECT count(*)::int AS count FROM hs_parent_security.audit
    WHERE auth_id=$1 AND event='code_rejected' AND created_at>now()-interval '15 minutes'`, [family]);
  assert.equal(failures.rows[0].count, 3);
  assert.equal((await request(route("verify"), t1, { challengeId: resent.body.challengeId, code: resentCode })).status, 429);
  assert.equal((await request(route("verify"), t2, { challengeId: otherPurpose.body.challengeId, code: otherCode })).status, 429);
  const fresh = await login(familyEmail, password);
  assert.equal(fresh.status, 200);
  await advanceFixtureRateClock();
  const deliveriesBeforeLockCheck = mailbox.length;
  assert.equal((await request(route("challenge"), fresh.body.access_token, { purpose: "parent_action" })).status, 429);
  assert.equal((await request(route("challenge"), t2, { purpose: "password_change" })).status, 429);
  assert.equal(mailbox.length, deliveriesBeforeLockCheck);
  // Existing failures 11 minutes old must STILL block; a resend/session switch
  // cannot turn the new 15-minute policy into the former ten-minute window.
  await db.query(`UPDATE hs_parent_security.audit SET created_at=now()-interval '11 minutes'
    WHERE auth_id=$1 AND event='code_rejected' AND created_at>now()-interval '15 minutes'`, [family]);
  assert.equal((await request(route("verify"), t1, { challengeId: resent.body.challengeId, code: resentCode })).status, 429);
  await advanceFixtureFailureClock();
  assert.equal((await request(route("verify"), t1, { challengeId: resent.body.challengeId, code: resentCode })).status, 200);
  check("four_digit_two_minute_codes_and_three_failure_window_survive_resends_sessions_purposes_and_concurrency");
  await advanceFixtureRateClock();
  const expired = await request(route("challenge"), t1, { purpose: "parent_action" });
  assert.equal(expired.status, 200);
  await db.query("UPDATE hs_parent_security.challenges SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.body.challengeId]);
  assert.equal((await request(route("verify"), t1, { challengeId: expired.body.challengeId, code: mailbox.at(-1)!.code })).status, 403);
  check("expired_grants_and_two_minute_codes_fail_closed");
  // Isolate and exercise the hour-wide cap (not just the minute-wide cap).
  await advanceFixtureRateClock();
  let fifth: Awaited<ReturnType<typeof request>>;
  for (let i = 0; i < 5; i++) {
    fifth = await request(route("challenge"), t1, { purpose: "parent_action" });
    assert.equal(fifth.status, 200);
    await db.query("UPDATE hs_parent_security.challenges SET created_at=now()-interval '2 minutes' WHERE auth_id=$1 AND created_at>now()-interval '1 hour'", [family]);
  }
  const fifthCode = mailbox.at(-1)!.code;
  await db.query("UPDATE hs_parent_security.challenges SET created_at=now()-interval '2 minutes' WHERE auth_id=$1", [family]);
  assert.equal((await request(route("challenge"), t2, { purpose: "password_change" })).status, 429);
  await db.query(`INSERT INTO hs_parent_security.audit(auth_id,session_id,event)
    SELECT $1,$2,'code_verified' FROM generate_series(1,25)`, [family, actor1.sessionId]);
  assert.equal((await request(route("verify"), t1, { challengeId: fifth!.body.challengeId, code: fifthCode })).status, 429);
  await db.query("UPDATE hs_parent_security.audit SET created_at=now()-interval '16 minutes' WHERE auth_id=$1", [family]);
  assert.equal((await request(route("verify"), t1, { challengeId: fifth!.body.challengeId, code: fifthCode })).status, 200);
  check("hourly_send_cap_and_aggregate_verification_cap_persist_across_requests");

  for (const assignment of [
    "email='hs-redirection@example.com'", "email_change='hs-redirection@example.com'",
    "phone='+12025550123'", "recovery_token='synthetic-forbidden-recovery'",
  ]) {
    let denied = false;
    try { await db.query(`UPDATE auth.users SET ${assignment} WHERE id=$1`, [family]); }
    catch (error: any) { denied = error.code === "42501" && error.message === "parent_verification_required"; }
    assert.equal(denied, true);
  }
  const mfa = await auth("factors", false, "POST", { factor_type: "totp", friendly_name: "synthetic denied" }, t1);
  assert.notEqual(mfa.status, 200);
  assert.equal((await db.query("SELECT 1 FROM auth.mfa_factors WHERE user_id=$1", [family])).rows.length, 0);
  let identityDenied = false;
  try {
    await db.query("UPDATE auth.identities SET identity_data=identity_data || '{\"email\":\"hs-redirection@example.com\"}'::jsonb WHERE user_id=$1", [family]);
  } catch (error: any) { identityDenied = error.code === "42501" && error.message === "parent_verification_required"; }
  assert.equal(identityDenied, true);
  check("email_phone_recovery_and_identity_writes_blocked_and_direct_mfa_enrollment_denied");

  await advanceFixtureRateClock();
  const pwdChallenge = await request(route("challenge"), t1, { purpose: "password_change" });
  const pwdVerified = await request(route("verify"), t1, { challengeId: pwdChallenge.body.challengeId, code: mailbox.at(-1)!.code });
  assert.equal(pwdVerified.status, 200);
  const pwdGrant = pwdVerified.body.verificationToken;
  assert.equal((await request("/api/parent-only-fixture", t1, undefined, pwdGrant)).status, 403);
  assert.equal((await request(route("password"), t2, { password: replacement }, pwdGrant)).status, 403);
  const changes = await Promise.all([
    request(route("password"), t1, { password: replacement }, pwdGrant),
    request(route("password"), t1, { password: replacement }, pwdGrant),
  ]);
  assert.equal(changes.filter(result => result.status === 200).length, 1);
  assert.ok(changes.filter(result => result.status !== 200).every(result => [401, 403].includes(result.status)));
  assert.equal((await login(familyEmail, password)).status === 200, false);
  const newLogin = await login(familyEmail, replacement);
  assert.equal(newLogin.status, 200);
  assert.equal((await request(route("status"), t1)).status, 401);
  assert.equal((await request(route("status"), t2)).status, 401);
  const refreshed = await auth("token?grant_type=refresh_token", false, "POST", { refresh_token: first.body.refresh_token });
  assert.notEqual(refreshed.status, 200);
  assert.equal((await request(route("password"), newLogin.body.access_token, { password }, pwdGrant)).status, 403);
  check("password_code_is_one_use_under_concurrency_and_all_prior_sessions_and_refresh_tokens_are_revoked");

  const newToken = newLogin.body.access_token;
  const deniedAgain = await auth("user", false, "PUT", { password, current_password: replacement }, newToken);
  assert.notEqual(deniedAgain.status, 200);
  await advanceFixtureRateClock();
  const logoutChallenge = await request(route("challenge"), newToken, { purpose: "parent_action" });
  const logoutVerified = await request(route("verify"), newToken, { challengeId: logoutChallenge.body.challengeId, code: mailbox.at(-1)!.code });
  assert.equal(logoutVerified.status, 200);
  const logoutGrant = logoutVerified.body.verificationToken;
  assert.equal((await request("/api/parent-only-fixture", newToken, undefined, logoutGrant)).status, 200);
  assert.equal((await request(route("revoke"), newToken, {})).status, 200);
  assert.equal((await request("/api/parent-only-fixture", newToken, undefined, logoutGrant)).status, 403);
  const loggedOut = await auth("logout?scope=local", false, "POST", undefined, newToken);
  assert.ok([200, 204].includes(loggedOut.status));
  assert.equal((await request(route("status"), newToken, undefined, logoutGrant)).status, 401);
  check("explicit_parent_lock_and_logout_remove_parent_authority_and_direct_auth_stays_blocked");
  if (process.argv.includes("--browser")) {
    const browserLogin = await login(familyEmail, replacement);
    assert.equal(browserLogin.status, 200);
    const browserPassword = `HsBrowser3!${randomBytes(20).toString("hex")}`;
    report.browserChecks = await verifyParentBrowser({
      app, origin: local, accessToken: browserLogin.body.access_token, newPassword: browserPassword,
      lastCode: () => { assert.ok(mailbox.at(-1)); return mailbox.at(-1)!.code; },
      async prepareDelivery(works) { deliveryWorks = works; await advanceFixtureRateClock(); },
      onProgress(value) { report.lastBrowserCheck = value; },
    });
    assert.equal((await login(familyEmail, browserPassword)).status, 200);
    assert.notEqual((await login(familyEmail, replacement)).status, 200);
    check("browser_password_change_confirmed_by_real_dev_auth_sign_in");
    report.applicationUiVerified = true;
    report.browserAuthPlumbing = "injected synthetic session; actual page and actual DEV service; private captured email";
  }
  report.outcome = "dev_guard_and_server_http_verification_passed_with_captured_email";
} catch (error: any) {
  report.outcome = "verification_incomplete";
  report.failedAfter = report.checks.at(-1)?.name ?? "isolation";
  report.safeDatabaseCode = /^[0-9A-Z]{5}$/.test(error?.code ?? "") ? error.code : undefined;
  report.assertion = error?.code === "ERR_ASSERTION" ? "failed" : undefined;
  report.failureKind = ["TimeoutError", "AssertionError", "Error"].includes(error?.name) ? error.name : undefined;
  process.exitCode = 1;
} finally {
  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
  try {
    if (pool) {
      for (const id of fixtures) {
        const user = await auth(`admin/users/${id}`, true, "GET");
        assert.equal(user.body.app_metadata?.synthetic_high_school_parent_dev, marker);
        await pool.query("DELETE FROM hs_parent_security.accounts WHERE auth_id=$1", [id]);
        await pool.query("DELETE FROM hs_parent_security.audit WHERE auth_id=$1", [id]);
        assert.equal((await auth(`admin/users/${id}`, true, "DELETE")).status, 200);
        assert.equal((await auth(`admin/users/${id}`, true, "GET")).status, 404);
      }
      report.cleanupVerified = true;
      report.syntheticAccountsDeletedAndVerified = fixtures.length;
      report.enrolledAccountsRemaining = Number((await pool.query("SELECT count(*)::int AS count FROM hs_parent_security.accounts")).rows[0].count);
    }
  } catch {
    report.cleanupVerified = false;
    report.outcome = "urgent_dev_fixture_cleanup_incomplete";
    report.cleanupFixtureIds = fixtures;
    process.exitCode = 1;
  }
  await pool?.end();
  await mkdir("generated-artifacts/high-school-auth-proof", { recursive: true });
  await writeFile("generated-artifacts/high-school-auth-proof/implemented-dev-result.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
