/** Actual hosted DEV Auth proof using an owned temporary account and a
 * temporary private namespace. No real mail, live data or existing registry
 * is changed. The exact production guard SQL runs against only that account. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";
import { HighSchoolParentSecurity, type ParentSql, type ParentTransaction } from "../server/highSchoolParentSecurity";
import { parentActorFromVerifiedToken } from "../server/highSchoolParentHttp";

const marker = randomBytes(9).toString("hex");
const schema = `hs_family_proof_${marker}`;
assert.match(schema, /^hs_family_proof_[a-f0-9]{18}$/);
const report: Record<string, unknown> = { scope: "owned hosted DEV account only", productionChanged: false, realEmailSent: false };
let connection: Awaited<ReturnType<typeof parentDevelopmentConnection>> | undefined;
let admin: ReturnType<typeof createClient> | undefined;
let id: string | undefined, stage = "isolated-target";
try {
  connection = await parentDevelopmentConnection();
  stage = "construct-auth-clients";
  // Node 20 lacks native WebSocket, even though this proof uses only Auth.
  const options = { auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as any } };
  admin = createClient(connection.origin, connection.env.DEV_SUPABASE_SERVICE_ROLE_KEY!,
    options);
  const auth = createClient(connection.origin, connection.env.DEV_SUPABASE_ANON_KEY!,
    options);
  stage = "load-static-installation";
  const sql = await readFile("scripts/production/high-school-family.sql", "utf8");
  const privateTables = sql.slice(sql.indexOf("CREATE SCHEMA hs_parent_security;"), sql.indexOf("CREATE SCHEMA hs_onboarding;"));
  assert.ok(privateTables.startsWith("CREATE SCHEMA hs_parent_security;") && privateTables.includes("activated_at"));
  const guards = await readFile("scripts/sql/family-account-guards.sql", "utf8");
  stage = "connect-proof-database";
  const db = await connection.pool.connect();
  try {
    stage = "private-proof-schema";
    await db.query("BEGIN");
    await db.query(privateTables.replaceAll("hs_parent_security", schema));
    stage = "private-proof-guards";
    await db.query(guards.replaceAll("hs_parent_security", schema));
    for (const [table, event, fn, suffix] of [
      ["users", "UPDATE", "guard_user", "user"], ["users", "DELETE", "guard_delete_user", "delete"],
      ["identities", "INSERT OR UPDATE OR DELETE", "guard_factor_or_identity", "identity"],
      ["mfa_factors", "INSERT OR UPDATE OR DELETE", "guard_factor_or_identity", "mfa"],
    ]) {
      stage = `private-proof-trigger-${suffix}`;
      await db.query(`CREATE TRIGGER ${schema}_${suffix} BEFORE ${event} ON auth.${table}
        FOR EACH ROW EXECUTE FUNCTION ${schema}.${fn}()`);
    }
    await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin`);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
  const translate = (sql: string) => sql.replaceAll("hs_parent_security", schema);
  const adapter: ParentSql = {
    query: (sql, args) => connection!.pool.query(translate(sql), args),
    connect: async () => {
      const tx = await connection!.pool.connect();
      return { query: (sql, args) => tx.query(translate(sql), args), release: () => tx.release() } as ParentTransaction;
    },
  };
  let code = "";
  const parent = new HighSchoolParentSecurity(adapter, async mail => { code = mail.code; }, true);
  const email = `family-proof-${marker}@example.com`, original = `OriginalFamily1!${randomBytes(15).toString("hex")}`;
  const replacement = `RecoveredFamily2!${randomBytes(15).toString("hex")}`;
  stage = "owned-account";
  const created = await admin.auth.admin.createUser({ email, password: original, email_confirm: true,
    app_metadata: { family_provider_proof_owner: marker } });
  assert.ifError(created.error); id = created.data.user!.id;
  const signed = await auth.auth.signInWithPassword({ email, password: original });
  assert.ifError(signed.error);
  const actor = parentActorFromVerifiedToken(signed.data.session!.access_token, id, `${connection.origin}/auth/v1`);
  await adapter.query("INSERT INTO hs_parent_security.accounts(auth_id,parent_email) VALUES($1,$2)", [id, email]);
  assert.equal(await parent.enrolled(id), false);
  report.pendingEnrollmentKeptOrdinaryAccess = true;
  stage = "email-activation";
  const challenge = await parent.challenge(actor, "parent_action");
  const proof = await parent.verify(actor, challenge.challengeId, code);
  assert.equal(await parent.enrolled(id), true);
  assert.equal(await parent.authorized(actor, proof.verificationToken), true);
  stage = "existing-password-login";
  const fresh = await auth.auth.signInWithPassword({ email, password: original });
  assert.ifError(fresh.error);
  const freshActor = parentActorFromVerifiedToken(fresh.data.session!.access_token, id, `${connection.origin}/auth/v1`);
  assert.equal(await parent.authorized(freshActor, proof.verificationToken), false);
  report.existingProviderSignInAndSessionBinding = true;
  stage = "protected-password-boundary";
  const unapproved = await auth.auth.updateUser({ password: replacement });
  assert.ok(unapproved.error);
  report.providerPasswordMutationRequiredEmailApproval = true;
  stage = "actual-email-recovery-session";
  // Admin generation does not send an email; redeeming its private hash
  // exercises the provider's actual recovery/session implementation.
  const recovery = await admin.auth.admin.generateLink({ type: "recovery", email });
  assert.ifError(recovery.error);
  const recovered = await auth.auth.verifyOtp({ type: "recovery", token_hash: recovery.data.properties!.hashed_token });
  assert.ifError(recovered.error);
  const recoveryActor = parentActorFromVerifiedToken(recovered.data.session!.access_token, id, `${connection.origin}/auth/v1`);
  assert.equal(await parent.authorized(recoveryActor, proof.verificationToken), false);
  report.actualProviderRecoverySessionCreated = true;
  await adapter.query("UPDATE hs_parent_security.challenges SET created_at=now()-interval '2 minutes' WHERE auth_id=$1", [id]);
  const passwordCode = await parent.challenge(recoveryActor, "password_change");
  const approval = await parent.verify(recoveryActor, passwordCode.challengeId, code);
  stage = "approved-recovery-password-change";
  await parent.changePassword(recoveryActor, approval.verificationToken, replacement);
  assert.equal((await connection.pool.query("SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1", [id])).rows[0].n, 0);
  const oldSignIn = await auth.auth.signInWithPassword({ email, password: original });
  assert.ok(oldSignIn.error);
  const newSignIn = await auth.auth.signInWithPassword({ email, password: replacement });
  assert.ifError(newSignIn.error);
  report.approvedRecoveryChangedPasswordAndRevokedOldSessions = true;
  stage = "administrator-account-deletion";
  const removed = await admin.auth.admin.deleteUser(id);
  assert.ifError(removed.error); id = undefined;
  assert.equal((await adapter.query("SELECT count(*)::int AS n FROM hs_parent_security.accounts")).rows[0].n, 0);
  report.administratorDeletionPreserved = true;
  report.outcome = "passed";
} catch (error) {
  report.outcome = "failed"; report.failedStage = stage; process.exitCode = 1;
  report.errorCode = (error as any)?.code ?? "PROVIDER_ASSERTION_FAILED";
  report.connectionTimedOut = /timeout|timed out/i.test(String((error as any)?.message));
  if (stage.startsWith("private-proof-")) report.installationError = String((error as any)?.message).slice(0, 180);
} finally {
  if (connection) {
    try {
      if (id && admin) {
        const owned = await admin.auth.admin.getUserById(id);
        assert.equal(owned.data.user?.app_metadata.family_provider_proof_owner, marker);
        // Cleanup never depends on the behavior under test.
        await connection.pool.query(`DELETE FROM ${schema}.accounts WHERE auth_id=$1`, [id]);
        assert.ifError((await admin.auth.admin.deleteUser(id)).error);
      }
      await connection.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      report.cleanup = true;
    } catch { report.cleanup = false; process.exitCode = 1; }
    await connection.pool.end();
  }
  console.log(JSON.stringify(report, null, 2));
}
