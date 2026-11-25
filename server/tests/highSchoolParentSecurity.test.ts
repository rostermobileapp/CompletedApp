import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  HighSchoolParentSecurity, ParentSecurityError, isParentSecurityDevelopment,
  parentDigest, unavailableParentMailer, validParentPassword, type ParentSql,
} from "../highSchoolParentSecurity";
import { parentActorFromVerifiedToken, parentErrorResponse, requireDevParentAuthority } from "../highSchoolParentHttp";
import { nonproductionHttpGuard } from "../nonproductionHttp";

const actor = {
  authId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000002",
};
const issuer = "https://synthetic-dev.supabase.co/auth/v1";
const payload = () => ({
  sub: actor.authId, session_id: actor.sessionId, iss: issuer, aud: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 600,
});
const token = (claims: unknown) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

test("activation is confined to isolated DEV, never production, test, or live preview", () => {
  assert.equal(isParentSecurityDevelopment({ NODE_ENV: "development", NONPRODUCTION_ISOLATED: "1" }), true);
  for (const env of [
    { NODE_ENV: "production", NONPRODUCTION_ISOLATED: "1" },
    { NODE_ENV: "test", NONPRODUCTION_ISOLATED: "1" },
    { NODE_ENV: "development" },
    { NODE_ENV: "development", NONPRODUCTION_ISOLATED: "1", PREVIEW_USE_LIVE_SECRETS: "1" },
  ]) assert.equal(isParentSecurityDevelopment(env), false);
});
test("the verified-token adapter binds subject, issuer, audience, expiry and session", () => {
  assert.deepEqual(parentActorFromVerifiedToken(token(payload()), actor.authId, issuer), actor);
  for (const delta of [
    { sub: "30000000-0000-4000-8000-000000000003" },
    { iss: "https://other.example/auth/v1" }, { aud: "anon" },
    { exp: 0 }, { exp: "99999999999" }, { session_id: "forged-profile" },
  ]) assert.throws(() => parentActorFromVerifiedToken(token({ ...payload(), ...delta }), actor.authId, issuer),
    (error: any) => error.code === "INVALID_SESSION");
  assert.throws(() => parentActorFromVerifiedToken("invalid", actor.authId, issuer));
});
test("normal account reads validate the active login without granting parent authority", async () => {
  const queries: string[] = [];
  const pool = { query: async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM hs_parent_security.accounts") || sql.includes("FROM auth.sessions")) return {rows:[{}]};
    return {rows:[]};
  }} as unknown as ParentSql;
  const security = new HighSchoolParentSecurity(pool);
  await requireDevParentAuthority(security, actor.authId, token(payload()), issuer, undefined, "account_read");
  assert.ok(queries.some(sql => sql.includes("FROM auth.sessions")));
  assert.equal(queries.some(sql => sql.includes("INSERT") || sql.includes("UPDATE")), false);
  // The read exception is opt-in by server code; all default callers still
  // require a grant, including mutations and real-time message transports.
  await assert.rejects(() => requireDevParentAuthority(security, actor.authId, token(payload()), issuer),
    (error: any) => error.code === "PARENT_VERIFICATION_REQUIRED");
});
test("account reads reject revoked sessions and invalid tokens even without parent controls", async () => {
  const pool = {query:async(sql:string)=>({rows:sql.includes("FROM hs_parent_security.accounts")?[{}]:[]})} as unknown as ParentSql;
  const security = new HighSchoolParentSecurity(pool);
  await assert.rejects(() => requireDevParentAuthority(security, actor.authId, token(payload()), issuer, undefined, "account_read"),
    (error:any)=>error.code==="INVALID_SESSION");
  await assert.rejects(() => requireDevParentAuthority(security, actor.authId, token({...payload(),sub:"wrong-account"}), issuer, undefined, "account_read"),
    (error:any)=>error.code==="INVALID_SESSION");
});
test("password policy rejects bcrypt truncation rather than accepting two equivalent passwords", () => {
  assert.equal(validParentPassword("ValidDevPassword1!"), true);
  for (const value of ["short1!", "longwithoutuppercase1!", "LongWithoutNumbers!", "A1!" + "z".repeat(70), "A1!" + "猫".repeat(24), undefined, {}]) {
    assert.equal(validParentPassword(value), false);
  }
});
test("unknown database/provider failures return a generic error without leaking details", () => {
  let body: any, status: number | undefined;
  const res = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
  parentErrorResponse(res, new Error("synthetic-private-provider-detail"));
  assert.equal(status, 503);
  assert.equal(body.code, "PARENT_SECURITY_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("synthetic-private-provider-detail"), false);
  parentErrorResponse(res, new ParentSecurityError("PARENT_VERIFICATION_REQUIRED", 403));
  assert.equal(status, 403);
});
test("delivery is explicitly unavailable by default, never a fake success", async () => {
  await assert.rejects(() => unavailableParentMailer({ to: "synthetic@example.com", code: "0000", purpose: "parent_action" }),
    (error: any) => error.status === 503);
});
test("failed code checks commit their attempt instead of rolling it back", async () => {
  const calls: string[] = [];
  const id = "30000000-0000-4000-8000-000000000003";
  const tx = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("FROM auth.sessions")) return { rows: [{}] };
      if (sql.includes("FROM hs_parent_security.accounts")) return { rows: [{}] };
      if (sql.includes("FROM hs_parent_security.audit")) return { rows: [{ failures: 0, aggregate: 0 }] };
      if (sql.includes("SET attempts=attempts+1")) return {
        rows: [{ code_digest: parentDigest(`${id}:1234`), purpose: "parent_action" }],
      };
      return { rows: [] };
    },
    release() { calls.push("RELEASE"); },
  };
  const pool = { query: tx.query, connect: async () => tx } as ParentSql;
  await assert.rejects(() => new HighSchoolParentSecurity(pool).verify(actor, id, "4321"),
    (error: any) => error.code === "INVALID_OR_EXPIRED_CODE");
  assert.ok(calls.includes("COMMIT"));
  assert.equal(calls.includes("ROLLBACK"), false);
  assert.equal(calls.at(-1), "RELEASE");
});
test("four-digit challenges preserve leading zeros, use a two-minute lifetime and reject obsolete code shapes", async () => {
  const id = "30000000-0000-4000-8000-000000000003";
  const calls: { sql: string; args?: any[] }[] = [];
  let sent: string | undefined;
  const tx = {
    async query(sql: string, args?: any[]) {
      calls.push({ sql, args });
      if (sql.includes("FROM auth.sessions")) return { rows: [{}] };
      if (sql.includes("FROM hs_parent_security.accounts")) return { rows: [{ parent_email: "synthetic@example.com" }] };
      if (sql.includes("FROM hs_parent_security.audit")) return { rows: [{ failures: 0, aggregate: 0 }] };
      if (sql.includes("AS recent")) return { rows: [{ recent: 0, hourly: 0 }] };
      if (sql.includes("SET attempts=attempts+1")) return { rows: [{ code_digest: parentDigest(`${id}:0123`), purpose: "parent_action" }] };
      return { rows: [] };
    }, release() {},
  };
  const service = new HighSchoolParentSecurity({ query: tx.query, connect: async () => tx },
    async mail => { sent = mail.code; });
  const challenge = await service.challenge(actor, "parent_action");
  assert.equal(challenge.expiresInSeconds, 120);
  assert.match(sent!, /^\d{4}$/);
  assert.equal(calls.find(call => call.sql.includes("(id,auth_id,session_id,purpose,code_digest,expires_at)"))?.args?.[5], 120);
  const grant = await service.verify(actor, id, "0123");
  assert.equal(grant.purpose, "parent_action");
  for (const code of ["123", "12345", "12345678", " 1234", 1234]) {
    await assert.rejects(() => service.verify(actor, id, code), (error: any) => error.code === "INVALID_CODE");
  }
});
test("account-wide failure lock blocks both purposes before delivery or code matching, under the account lock", async () => {
  for (const budget of [{ failures: 3, aggregate: 3 }, { failures: 0, aggregate: 25 }]) {
    const sqlCalls: string[] = [];
    let sends = 0;
    const tx = {
      async query(sql: string) {
        sqlCalls.push(sql);
        if (sql.includes("FROM auth.sessions")) return { rows: [{}] };
        if (sql.includes("FROM hs_parent_security.accounts")) return { rows: [{ parent_email: "synthetic@example.com" }] };
        if (sql.includes("FROM hs_parent_security.audit")) {
          assert.match(sql, /15 minutes/);
          assert.doesNotMatch(sql, /session_id|purpose|challenge_id/);
          return { rows: [budget] };
        }
        return { rows: [] };
      }, release() {},
    };
    const service = new HighSchoolParentSecurity({ query: tx.query, connect: async () => tx }, async () => { sends++; });
    for (const purpose of ["parent_action", "password_change"] as const) {
      await assert.rejects(() => service.challenge(actor, purpose), (error: any) => error.code === "CODE_RATE_LIMIT");
    }
    await assert.rejects(() => service.verify(actor, "30000000-0000-4000-8000-000000000003", "0123"),
      (error: any) => error.code === "CODE_RATE_LIMIT");
    assert.equal(sends, 0);
    assert.ok(sqlCalls.findIndex(sql => sql.includes("FOR UPDATE")) < sqlCalls.findIndex(sql => sql.includes("FROM hs_parent_security.audit")));
    assert.equal(sqlCalls.some(sql => sql.includes("SET attempts=") || sql.includes("INSERT INTO hs_parent_security.challenges")), false);
  }
});
test("unprotected adults skip parent checks; family registry failures never fail open", async () => {
  let queried = 0;
  const pool = { query: async () => { queried++; return { rows: [] }; } } as unknown as ParentSql;
  await requireDevParentAuthority(new HighSchoolParentSecurity(pool), actor.authId, "not-needed-for-adult", issuer);
  assert.equal(queried, 1);
  const unavailable = { query: async () => { throw new Error("synthetic outage"); } } as unknown as ParentSql;
  await assert.rejects(() => requireDevParentAuthority(new HighSchoolParentSecurity(unavailable), actor.authId, "", issuer));
});
test("isolated DEV HTTP exception is exact and does not enable legacy password or delivery paths", () => {
  const before = { ...process.env };
  try {
    process.env.NONPRODUCTION_ISOLATED = "1";
    process.env.SUPABASE_URL = "https://synthetic-dev.supabase.co";
    const allowed: string[] = [], denied: string[] = [];
    for (const path of [
      "/api/high-school/parent-verification/password",
      "/api/high-school/parent-verification/challenge",
      "/api/high-school/parent-verification/password/extra",
      "/api/auth/reset-password", "/api/send-email",
    ]) {
      const res = { setHeader() {}, status() { return this; }, json() { denied.push(path); } };
      nonproductionHttpGuard({ method: "POST", path } as any, res as any, () => { allowed.push(path); });
    }
    assert.deepEqual(allowed, ["/api/high-school/parent-verification/password", "/api/high-school/parent-verification/challenge"]);
    assert.equal(denied.length, 3);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});
test("explicit DEV SQL has no client-accessible approval function or global account enrollment", () => {
  const sql = readFileSync(new URL("../../scripts/dev-only/high-school-parent-security.sql", import.meta.url), "utf8");
  assert.match(sql, /transaction_id=pg_catalog\.txid_current\(\)/);
  assert.match(sql, /password_hash=NEW\.encrypted_password/);
  assert.match(sql, /REVOKE ALL ON ALL FUNCTIONS/);
  assert.match(sql, /ALTER TABLE hs_parent_security\.grants ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /INSERT INTO hs_parent_security\.accounts/i);
  assert.doesNotMatch(sql, /GRANT .+ TO (?:anon|authenticated)/i);
});
test("parent verification responses are excluded from application response-body logging", () => {
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(source, /!path\.startsWith\('\/api\/high-school\/parent-verification\/'\)/);
});
