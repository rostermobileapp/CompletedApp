/**
 * Phase 1 entry gate only. Never imports the application or changes Auth settings.
 * Default: read-only DEV preflight. --exercise creates and deletes ONE synthetic
 * Auth user and tests password mutation directly, without any parent approval.
 * Tokens/passwords/connection strings never leave process memory or enter reports.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";
import { databaseEndpoint } from "../server/testDatabaseGuard";

const outputDirectory = "generated-artifacts/high-school-auth-proof";
const report: Record<string, unknown> = {
  scope: "Separate DEV Supabase only; no application startup or provider configuration changes",
  mode: process.argv.includes("--exercise") ? "synthetic-auth-exercise" : "read-only-preflight",
  checks: [] as Record<string, unknown>[],
  outcome: "not_finished",
};
const checks = report.checks as Record<string, unknown>[];

async function main() {
  assert.notEqual(process.env.PREVIEW_USE_LIVE_SECRETS, "1", "Live preview is forbidden");
  assert.notEqual(process.env.NODE_ENV, "production", "Production execution is forbidden");
  assert.ok(process.env.DATABASE_URL, "Application database reference required for exclusion");
  assert.ok(process.env.SUPABASE_URL, "Application Auth reference required for exclusion");
  assert.notEqual(databaseEndpoint(process.env.DEV_DATABASE_URL!), databaseEndpoint(process.env.DATABASE_URL));
  const env = isolateDevelopmentEnvironment(process.env);
  const base = new URL(env.DEV_SUPABASE_URL!).origin;
  assert.notEqual(base, new URL(process.env.SUPABASE_URL).origin);
  if (process.env.VITE_SUPABASE_URL) {
    assert.notEqual(base, new URL(process.env.VITE_SUPABASE_URL).origin);
  }
  const project = new URL(base).hostname.split(".")[0];
  for (const key of [env.DEV_SUPABASE_ANON_KEY!, env.DEV_SUPABASE_SERVICE_ROLE_KEY!]) {
    if (key.split(".").length === 3) {
      const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      assert.equal(payload.ref, project, "DEV Auth credential project mismatch");
    }
  }
  checks.push({ name: "dev_sql_auth_credentials_match_and_exclude_application", passed: true });

  const sql = postgres(env.DEV_DATABASE_URL!, {
    max: 1, connect_timeout: 10, idle_timeout: 1,
    ssl: { rejectUnauthorized: true, ca: await readFile(new URL("../server/certs/supabase-ca.pem", import.meta.url), "utf8") },
  });
  try {
    await sql.begin("read only", async transaction => {
      const triggers = await transaction`
        SELECT t.tgname, n.nspname AS function_schema, p.proname AS function_name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace cn ON cn.oid=c.relnamespace
        JOIN pg_proc p ON p.oid=t.tgfoid
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE cn.nspname='auth' AND c.relname='users'
          AND NOT t.tgisinternal AND t.tgenabled <> 'D'
      `;
      checks.push({ name: "auth_user_custom_triggers", triggers });
      // An unreviewed trigger could send email or write unrelated app records.
      assert.equal(triggers.length, 0, "Review Auth user triggers before creating fixtures");
    });
  } finally {
    await sql.end({ timeout: 2 });
  }

  // Inspect only boolean security settings, never SMTP credentials or hook secrets.
  const managementToken = process.env.DEV_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;
  if (managementToken) {
    const configuration = await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`, {
      headers: { Authorization: `Bearer ${managementToken}` },
      signal: AbortSignal.timeout(20_000), redirect: "error",
    });
    checks.push({ name: "dev_auth_config_read", status: configuration.status });
    if (configuration.status === 401 || configuration.status === 403) {
      report.outcome = "blocked_dev_auth_configuration_access";
      return;
    }
    assert.equal(configuration.status, 200, "DEV Auth configuration inspection failed");
    const settings = await configuration.json() as Record<string, unknown>;
    const safeSettings = Object.fromEntries(Object.entries(settings).filter(([key, value]) =>
      typeof value === "boolean" &&
      /^(security_|hook_|mailer_.*(?:secure|notification)|.*password.*)/.test(key)));
    checks.push({ name: "dev_auth_security_settings", settings: safeSettings });
    const enabledExternalHooks = Object.entries(safeSettings)
      .filter(([key, value]) => /^hook_.*_enabled$/.test(key) && value === true);
    assert.equal(enabledExternalHooks.length, 0, "Review enabled Auth hooks before synthetic exercise");
    const enabledNotifications = Object.entries(safeSettings)
      .filter(([key, value]) => /notification/.test(key) && value === true);
    assert.equal(enabledNotifications.length, 0, "Capture Auth security notifications before synthetic exercise");
  } else {
    checks.push({ name: "dev_auth_config_read", credentialAvailable: false });
    throw new Error("DEV Auth delivery settings must be verified before synthetic exercise");
  }
  report.preflight = "passed";
  if (!process.argv.includes("--exercise")) {
    report.outcome = "preflight_passed_not_a_security_proof";
    return;
  }

  const email = `hs-auth-proof-${randomUUID()}@roster-dev.invalid`;
  const password = `HsProof1!${randomBytes(32).toString("hex")}`;
  const replacement = `HsProof2!${randomBytes(32).toString("hex")}`;
  let createdUserId: string | undefined;
  async function auth(path: string, key: string, method: string, body?: object, token = key) {
    const response = await fetch(`${base}/auth/v1/${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({})) as Record<string, any>;
    return { status: response.status, data };
  }
  const adminKey = env.DEV_SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = env.DEV_SUPABASE_ANON_KEY!;
  try {
    const created = await auth("admin/users", adminKey, "POST", {
      email, password, email_confirm: true,
      app_metadata: { synthetic_high_school_auth_proof: true },
    });
    createdUserId = created.data.id;
    assert.ok(createdUserId, "Synthetic Auth user creation did not return an ID");
    assert.equal(created.status, 200, "Synthetic Auth user creation failed");
    checks.push({ name: "created_one_confirmed_synthetic_auth_user_without_email", passed: true });
    const signedIn = await auth("token?grant_type=password", anonKey, "POST", { email, password });
    assert.equal(signedIn.status, 200, "Raw password sign-in failed");
    assert.ok(signedIn.data.access_token, "Raw sign-in returned no access token");
    assert.equal(signedIn.data.user?.id, createdUserId, "Raw sign-in identity mismatch");
    checks.push({ name: "fresh_password_login_without_parent_device", status: signedIn.status });

    const changed = await auth("user", anonKey, "PUT", {
      password: replacement, current_password: password,
    }, signedIn.data.access_token);
    checks.push({
      name: "raw_password_change_without_parent_device_or_email_nonce",
      status: changed.status,
      errorCode: typeof changed.data.error_code === "string" ? changed.data.error_code : null,
      denied: changed.status === 401 || changed.status === 403 || changed.status === 422,
    });
    if (changed.status === 200) {
      const replacementLogin = await auth("token?grant_type=password", anonKey, "POST", { email, password: replacement });
      const originalLogin = await auth("token?grant_type=password", anonKey, "POST", { email, password });
      assert.equal(replacementLogin.status, 200, "Password mutation was not confirmed by sign-in");
      assert.equal(replacementLogin.data.user?.id, createdUserId);
      assert.notEqual(originalLogin.status, 200, "Original password unexpectedly still works");
      checks.push({
        name: "password_takeover_confirmed",
        replacementPasswordAccepted: true, originalPasswordRejected: true,
      });
      report.outcome = "blocked_raw_auth_password_change";
    } else {
      report.outcome = "password_probe_denied_other_security_tests_still_required";
    }
  } finally {
    if (createdUserId) {
      const deleted = await auth(`admin/users/${encodeURIComponent(createdUserId)}`, adminKey, "DELETE");
      assert.equal(deleted.status, 200, "Synthetic Auth fixture cleanup failed; manual cleanup required");
      const verification = await auth(`admin/users/${encodeURIComponent(createdUserId)}`, adminKey, "GET");
      assert.equal(verification.status, 404, "Synthetic Auth fixture deletion could not be confirmed");
      checks.push({ name: "synthetic_auth_user_cleanup", passed: true });
    }
  }
}

try {
  await main();
} catch {
  // Deliberately omit provider error bodies/stack traces, which can include credentials.
  report.outcome = "incomplete_precondition_or_request_failed";
  report.failedAfter = checks.at(-1)?.name ?? "isolation_guard";
  process.exitCode = 1;
} finally {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "blocked_raw_auth_password_change") process.exitCode = 2;
}
