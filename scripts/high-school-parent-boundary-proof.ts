/**
 * DEV-only feasibility test, NOT application protection or a migration.
 * Creates two synthetic Auth users and a uniquely named private probe schema.
 * A temporary Auth trigger affects ONLY the marked synthetic family fixture.
 * No email is sent. The in-memory mailbox tests code logic, not email delivery.
 * Deletes fixtures, trigger and schema and verifies cleanup even on failure.
 */
import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";
import { databaseEndpoint } from "../server/testDatabaseGuard";

const report: Record<string, any> = {
  scope: "Separate DEV only; synthetic fixtures; temporary database boundary",
  implementedInApplication: false,
  realEmailDeliveryVerified: false,
  checks: [],
  outcome: "not_finished",
};
const check = (name: string) => report.checks.push({ name, passed: true });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const suffix = randomBytes(6).toString("hex");
const schema = `hs_parent_probe_${suffix}`;
const trigger = `hs_parent_probe_${suffix}`;
let sql: ReturnType<typeof postgres> | undefined;
let schemaCreated = false;
const fixtureIds: string[] = [];
let base: string, adminKey: string, anonKey: string;

async function auth(path: string, admin: boolean, method: string, body?: object, token?: string) {
  const key = admin ? adminKey : anonKey;
  const response = await fetch(`${base}/auth/v1/${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({})) as any;
  return { status: response.status, data };
}

async function run() {
  assert.notEqual(process.env.PREVIEW_USE_LIVE_SECRETS, "1");
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.env.DATABASE_URL && process.env.SUPABASE_URL);
  assert.notEqual(databaseEndpoint(process.env.DEV_DATABASE_URL!), databaseEndpoint(process.env.DATABASE_URL));
  const env = isolateDevelopmentEnvironment(process.env);
  base = new URL(env.DEV_SUPABASE_URL!).origin;
  assert.notEqual(base, new URL(process.env.SUPABASE_URL!).origin);
  adminKey = env.DEV_SUPABASE_SERVICE_ROLE_KEY!;
  anonKey = env.DEV_SUPABASE_ANON_KEY!;

  // Reuse the existing read-only preflight, including notification/hook checks.
  const childEnv = { ...process.env };
  delete childEnv.PREVIEW_USE_LIVE_SECRETS;
  const preflight = spawnSync("npx", ["tsx", "scripts/high-school-auth-proof.ts"], {
    env: childEnv, encoding: "utf8", timeout: 90_000, maxBuffer: 128 * 1024,
  });
  assert.ok(!preflight.error);
  assert.equal(preflight.status, 0);
  assert.equal(JSON.parse(preflight.stdout).preflight, "passed");
  check("read_only_dev_isolation_and_no_auth_notifications_preflight");

  sql = postgres(env.DEV_DATABASE_URL!, {
    max: 1, connect_timeout: 10, idle_timeout: 1,
    ssl: { rejectUnauthorized: true, ca: await readFile(new URL("../server/certs/supabase-ca.pem", import.meta.url), "utf8") },
    onnotice: () => {},
  });
  const db = sql;
  const privileges = await db`
    SELECT has_table_privilege(current_user, 'auth.users', 'TRIGGER') AS can_trigger
  `;
  assert.equal(privileges[0].can_trigger, true, "DEV database role cannot install the boundary");
  check("dev_database_can_install_scoped_auth_trigger");
  const familyEmail = `hs-boundary-${randomUUID()}@example.com`;
  const adultEmail = `hs-boundary-${randomUUID()}@example.com`;
  const password = `HsProof1!${randomBytes(20).toString("hex")}`;
  const replacement = `HsProof2!${randomBytes(20).toString("hex")}`;
  const adultReplacement = `HsProof3!${randomBytes(20).toString("hex")}`;
  for (const email of [familyEmail, adultEmail]) {
    const result = await auth("admin/users", true, "POST", {
      email, password, email_confirm: true,
      app_metadata: { synthetic_high_school_parent_boundary_probe: suffix },
    });
    if (typeof result.data.id === "string") fixtureIds.push(result.data.id);
    assert.equal(result.status, 200);
    assert.ok(result.data.id);
  }
  const [family, adult] = fixtureIds;
  await db.unsafe(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  // No public-schema objects or API grants. Functions are private to the trusted
  // DB connection; neither API role nor Auth's SQL role can mint an approval.
  await db.unsafe(`
    REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
    CREATE TABLE "${schema}".accounts (id uuid PRIMARY KEY, email text NOT NULL);
    CREATE TABLE "${schema}".challenges (
      id uuid PRIMARY KEY, account_id uuid NOT NULL, session_id uuid NOT NULL,
      purpose text NOT NULL CHECK (purpose IN ('parent_action','password_change')),
      code_hash text NOT NULL, attempts int NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false
    );
    CREATE TABLE "${schema}".proofs (
      id uuid PRIMARY KEY, account_id uuid NOT NULL, session_id uuid NOT NULL,
      purpose text NOT NULL, expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false
    );
    CREATE TABLE "${schema}".writes (
      transaction_id bigint NOT NULL, account_id uuid NOT NULL, password_hash text NOT NULL,
      PRIMARY KEY(transaction_id, account_id)
    );
    CREATE FUNCTION "${schema}".guard_auth_write() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
    BEGIN
      IF EXISTS (SELECT 1 FROM "${schema}".accounts WHERE id = OLD.id) THEN
        IF NEW.email IS DISTINCT FROM OLD.email
           OR NEW.email_change IS DISTINCT FROM OLD.email_change
           OR NEW.phone IS DISTINCT FROM OLD.phone
           OR NEW.phone_change IS DISTINCT FROM OLD.phone_change THEN
          RAISE EXCEPTION 'parent_verification_required' USING ERRCODE = '42501';
        END IF;
        IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
          DELETE FROM "${schema}".writes
            WHERE transaction_id = pg_catalog.txid_current()
              AND account_id = OLD.id AND password_hash = NEW.encrypted_password;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'parent_verification_required' USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
      RETURN NEW;
    END $fn$;
    REVOKE ALL ON FUNCTION "${schema}".guard_auth_write() FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
    CREATE TRIGGER "${trigger}" BEFORE UPDATE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION "${schema}".guard_auth_write();
  `);
  await db.unsafe(`INSERT INTO "${schema}".accounts VALUES ($1, $2)`, [family, familyEmail]);
  check("private_trigger_scoped_only_to_synthetic_family");

  async function login(email: string, value: string) {
    return auth("token?grant_type=password", false, "POST", { email, password: value });
  }
  const familyLogin = await login(familyEmail, password);
  const secondLogin = await login(familyEmail, password);
  const adultLogin = await login(adultEmail, password);
  for (const result of [familyLogin, secondLogin, adultLogin]) {
    assert.equal(result.status, 200);
    assert.ok(result.data.access_token);
  }
  const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  // These tokens are received from DEV Auth in this probe, never from a client.
  // Production code MUST verify the signature/issuer and session existence.
  const session = claims(familyLogin.data.access_token).session_id;
  const otherSession = claims(secondLogin.data.access_token).session_id;
  assert.notEqual(session, otherSession);
  check("shared_credentials_still_allow_two_distinct_sessions");
  const attempt = await auth("user", false, "PUT", {
    password: replacement, current_password: password,
    data: { parent_verified: true, role: "parent" },
  }, familyLogin.data.access_token);
  assert.notEqual(attempt.status, 200);
  assert.equal((await login(familyEmail, password)).status, 200);
  assert.notEqual((await login(familyEmail, replacement)).status, 200);
  report.rawAuthDeniedStatus = attempt.status;
  check("fresh_shared_password_session_cannot_change_password_even_with_forged_parent_metadata");

  // Bypass the app with the trusted SQL connection. The hosted postgres role
  // cannot SET ROLE supabase_auth_admin; do not alter managed-role grants.
  // No email endpoint is invoked, avoiding accidental external delivery.
  for (const assignment of ["email = 'hs-redirection@example.com'", "email_change = 'hs-redirection@example.com'"]) {
    let denied = false;
    try {
      await db.begin(async tx => {
        await tx.unsafe(`UPDATE auth.users SET ${assignment} WHERE id = $1`, [family]);
      });
    } catch (error: any) {
      const underlying = error.cause ?? error;
      report.lastAuthRoleProbe = {
        code: /^[0-9A-Z]{5}$/.test(underlying.code ?? "") ? underlying.code : "not_postgres",
        parentGuardRaised: String(underlying.message).includes("parent_verification_required"),
        roleSwitchDenied: /(?:set role|set parameter "role")/.test(String(underlying.message)),
        tablePermissionDenied: /permission denied for table/.test(String(underlying.message)),
        schemaPermissionDenied: /permission denied for schema/.test(String(underlying.message)),
      };
      denied = underlying.code === "42501" && String(underlying.message).includes("parent_verification_required");
    }
    assert.equal(denied, true);
  }
  check("database_trigger_denies_direct_email_and_pending_email_writes");
  report.emailHttpEndpointTested = false;

  const adultChange = await auth("user", false, "PUT", {
    password: adultReplacement, current_password: password,
  }, adultLogin.data.access_token);
  assert.equal(adultChange.status, 200);
  assert.equal((await login(adultEmail, adultReplacement)).status, 200);
  check("unprotected_adult_password_behavior_unchanged");

  // In-memory delivery sink for this synthetic fixture ONLY. Never exposed as
  // an API, written to a report, or usable as a real email-verification proof.
  const mailbox = new Map<string, { to: string; code: string }>();
  async function issue(sessionId: string, purpose = "parent_action") {
    const id = randomUUID();
    const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
    const accounts = await db.unsafe(`SELECT email FROM "${schema}".accounts WHERE id=$1`, [family]);
    assert.equal(accounts.length, 1);
    await db.unsafe(`INSERT INTO "${schema}".challenges
      (id, account_id, session_id, purpose, code_hash, expires_at)
      VALUES ($1,$2,$3,$4,$5,now()+interval '5 minutes')`,
    [id, family, sessionId, purpose, digest(`${id}:${code}`)]);
    mailbox.set(id, { to: accounts[0].email, code });
    return id;
  }
  async function verify(id: string, actor: string, sessionId: string, code: string) {
    return db.begin(async tx => {
      const rows = await tx.unsafe(`UPDATE "${schema}".challenges SET attempts=attempts+1
        WHERE id=$1 AND account_id=$2 AND session_id=$3
          AND NOT consumed AND attempts<5 AND expires_at>now()
        RETURNING code_hash,purpose`, [id, actor, sessionId]);
      if (!rows.length || rows[0].code_hash !== digest(`${id}:${code}`)) return null;
      await tx.unsafe(`UPDATE "${schema}".challenges SET consumed=true WHERE id=$1`, [id]);
      const proof = randomUUID();
      await tx.unsafe(`INSERT INTO "${schema}".proofs
        (id,account_id,session_id,purpose,expires_at)
        VALUES ($1,$2,$3,$4,now()+interval '10 minutes')`, [proof, actor, sessionId, rows[0].purpose]);
      return proof;
    });
  }
  async function allowed(proof: string, actor: string, sessionId: string) {
    const rows = await db.unsafe(`SELECT 1 FROM "${schema}".proofs
      WHERE id=$1 AND account_id=$2 AND session_id=$3 AND purpose='parent_action'
        AND NOT consumed AND expires_at>now()`, [proof, actor, sessionId]);
    return rows.length === 1;
  }
  assert.equal(await allowed(randomUUID(), family, session), false);
  const id = await issue(session);
  assert.equal(mailbox.get(id)!.to, familyEmail);
  assert.equal(await verify(id, family, otherSession, mailbox.get(id)!.code), null);
  assert.equal(await verify(id, adult, session, mailbox.get(id)!.code), null);
  assert.equal(await verify(id, family, session, "wrong"), null);
  const proof = await verify(id, family, session, mailbox.get(id)!.code);
  assert.ok(proof);
  assert.equal(await allowed(proof, family, session), true);
  assert.equal(await allowed(proof, family, otherSession), false);
  assert.equal(await verify(id, family, session, mailbox.get(id)!.code), null);
  check("captured_code_is_recipient_bound_single_use_and_session_bound");
  check("parent_action_proof_required_and_other_session_denied");
  await db.unsafe(`UPDATE "${schema}".proofs SET expires_at=now()-interval '1 second' WHERE id=$1`, [proof]);
  assert.equal(await allowed(proof, family, session), false);
  const expired = await issue(session);
  await db.unsafe(`UPDATE "${schema}".challenges SET expires_at=now()-interval '1 second' WHERE id=$1`, [expired]);
  assert.equal(await verify(expired, family, session, mailbox.get(expired)!.code), null);
  const limited = await issue(session);
  for (let i = 0; i < 5; i++) assert.equal(await verify(limited, family, session, "wrong"), null);
  assert.equal(await verify(limited, family, session, mailbox.get(limited)!.code), null);
  check("expired_codes_and_proofs_and_exhausted_attempts_denied");

  const passwordId = await issue(session, "password_change");
  const passwordProof = await verify(passwordId, family, session, mailbox.get(passwordId)!.code);
  assert.ok(passwordProof);
  assert.equal(await allowed(passwordProof, family, session), false);
  async function changePassword(verification: string, sessionId: string) {
    const hash = await bcrypt.hash(replacement, 10);
    return db.begin(async tx => {
      const approval = await tx.unsafe(`UPDATE "${schema}".proofs SET consumed=true
        WHERE id=$1 AND account_id=$2 AND session_id=$3 AND purpose='password_change'
          AND NOT consumed AND expires_at>now() RETURNING id`, [verification, family, sessionId]);
      if (approval.length !== 1) return false;
      await tx.unsafe(`INSERT INTO "${schema}".writes VALUES (txid_current(),$1,$2)`, [family, hash]);
      await tx.unsafe(`UPDATE auth.users SET encrypted_password=$1,updated_at=now() WHERE id=$2`, [hash, family]);
      return true;
    });
  }
  assert.equal(await changePassword(passwordProof, otherSession), false);
  assert.equal(await changePassword(proof, session), false);
  const results = await Promise.all([
    changePassword(passwordProof, session), changePassword(passwordProof, session),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal((await login(familyEmail, replacement)).status, 200);
  assert.notEqual((await login(familyEmail, password)).status, 200);
  const stillDenied = await auth("user", false, "PUT", {
    password, current_password: replacement,
  }, familyLogin.data.access_token);
  assert.notEqual(stillDenied.status, 200);
  check("password_change_requires_separate_single_use_session_bound_code");
  check("password_proof_replay_denied_and_raw_auth_bypass_remains_closed");
  report.outcome = "temporary_boundary_feasibility_passed_not_application_implementation";
}

try {
  await run();
} catch (error: any) {
  report.outcome = "probe_failed";
  report.failedAfter = report.checks.at(-1)?.name ?? "preflight";
  // Never expose provider bodies, SQL, parameters, error stacks or credentials.
  report.safeDatabaseErrorCode = /^[0-9A-Z]{5}$/.test(error?.code ?? "") ? error.code : undefined;
  process.exitCode = 1;
} finally {
  try {
    if (sql && schemaCreated) {
      await sql.unsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON auth.users`);
      await sql.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
      const remains = await sql`
        SELECT 1 FROM pg_namespace WHERE nspname=${schema}
        UNION ALL SELECT 1 FROM pg_trigger WHERE tgname=${trigger}
      `;
      assert.equal(remains.length, 0);
      check("temporary_trigger_and_private_schema_removed_and_verified");
    }
    for (const id of fixtureIds) {
      assert.equal((await auth(`admin/users/${id}`, true, "DELETE")).status, 200);
      assert.equal((await auth(`admin/users/${id}`, true, "GET")).status, 404);
    }
    report.fixturesDeletedAndVerified = fixtureIds.length;
    report.cleanupVerified = true;
  } catch {
    report.cleanupVerified = false;
    report.outcome = "urgent_dev_probe_cleanup_incomplete";
    // Identifiers are not credentials and are needed to recover cleanup.
    report.cleanupSchema = schema;
    report.cleanupTrigger = trigger;
    report.cleanupFixtureIds = fixtureIds;
    process.exitCode = 1;
  }
  await sql?.end({ timeout: 3 });
  await mkdir("generated-artifacts/high-school-auth-proof", { recursive: true });
  await writeFile("generated-artifacts/high-school-auth-proof/parent-boundary-result.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
