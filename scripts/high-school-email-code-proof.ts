/**
 * Owner-approved DEV-only experiment. Temporarily enables secure password
 * changes, runs the direct fresh-login attack without requesting email, and
 * restores the original setting even if the attack fails.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const report: Record<string, unknown> = {
  scope: "Separate DEV Auth only; temporary setting restored; no email requested",
  outcome: "not_finished",
};
const setting = "security_update_password_require_reauthentication";
let original: boolean | undefined;
let mutationAttempted = false;
let endpoint: string;
let headers: Record<string, string>;

async function configuration(method = "GET", value?: boolean) {
  const response = await fetch(endpoint, {
    method, headers, redirect: "error", signal: AbortSignal.timeout(20_000),
    ...(method === "PATCH" ? { body: JSON.stringify({ [setting]: value }) } : {}),
  });
  assert.equal(response.status, 200, `DEV Auth configuration ${method} failed`);
  return await response.json() as Record<string, unknown>;
}

function probe(exercise: boolean) {
  const childEnv = { ...process.env };
  delete childEnv.PREVIEW_USE_LIVE_SECRETS;
  const result = spawnSync("npx", [
    "tsx", "scripts/high-school-auth-proof.ts", ...(exercise ? ["--exercise"] : []),
  ], { env: childEnv, encoding: "utf8", timeout: 120_000, maxBuffer: 128 * 1024 });
  // Do not print raw stdout/stderr or errors: only parse the probe's safe report.
  assert.ok(!result.error, "DEV probe process failed or timed out");
  const evidence = JSON.parse(result.stdout) as Record<string, any>;
  return { exitCode: result.status, evidence };
}

try {
  assert.notEqual(process.env.PREVIEW_USE_LIVE_SECRETS, "1");
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.env.DEV_SUPABASE_ACCESS_TOKEN, "DEV management token required");
  const preflight = probe(false);
  assert.equal(preflight.exitCode, 0);
  assert.equal(preflight.evidence.preflight, "passed");
  report.preflight = "passed";
  const dev = new URL(process.env.DEV_SUPABASE_URL!);
  assert.notEqual(dev.origin, new URL(process.env.SUPABASE_URL!).origin);
  endpoint = `https://api.supabase.com/v1/projects/${dev.hostname.split(".")[0]}/config/auth`;
  headers = {
    Authorization: `Bearer ${process.env.DEV_SUPABASE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
  const initial = await configuration();
  assert.equal(typeof initial[setting], "boolean");
  original = initial[setting] as boolean;
  report.originalReauthenticationSetting = original;
  if (!original) {
    mutationAttempted = true; // Restore even if PATCH succeeds but its response is lost.
    await configuration("PATCH", true);
  }
  assert.equal((await configuration())[setting], true);
  report.reauthenticationEnabledForTest = true;
  await setTimeout(10_000);
  const tested = probe(true);
  report.probe = tested.evidence;
  report.probeExitCode = tested.exitCode;
  report.outcome = tested.evidence.outcome === "blocked_raw_auth_password_change"
    ? "secure_password_change_does_not_require_email_code_for_fresh_login"
    : "inconclusive_review_probe_evidence";
} catch {
  report.outcome = "experiment_incomplete";
  process.exitCode = 1;
} finally {
  if (original !== undefined) {
    try {
      if (mutationAttempted) await configuration("PATCH", original);
      assert.equal((await configuration())[setting], original);
      report.originalSettingRestoredAndVerified = true;
    } catch {
      report.originalSettingRestoredAndVerified = false;
      report.outcome = "urgent_dev_setting_restoration_not_verified";
      process.exitCode = 1;
    }
  }
  await mkdir("generated-artifacts/high-school-auth-proof", { recursive: true });
  await writeFile("generated-artifacts/high-school-auth-proof/email-code-result.json",
    JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
