import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";

let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined;
const report: Record<string, unknown> = { scope: "isolated DEV staff installation only", childActivationEnabled: false };
try {
  ({ pool } = await parentDevelopmentConnection());
  const db = await pool.connect();
  try {
    assert.ok((await db.query("SELECT to_regclass('hs_onboarding.skin_version') AS installed")).rows[0].installed);
    const before = (await db.query("SELECT count(*)::int AS count FROM hs_onboarding.children WHERE enabled")).rows[0].count;
    if (process.argv.includes("--apply")) {
      await db.query("SELECT set_config('roster.hs_staff_dev','phase2',false)");
      await db.query(await readFile(new URL("./dev-only/high-school-staff-operations.sql", import.meta.url), "utf8"));
      report.applied = true;
    }
    report.installed = !!(await db.query("SELECT to_regclass('hs_onboarding.staff_version') AS installed")).rows[0].installed;
    assert.equal((await db.query("SELECT count(*)::int AS count FROM hs_onboarding.children WHERE enabled")).rows[0].count, before);
    report.childActivationUnchanged = true;
    report.approvedStaff = (await db.query(`SELECT count(*)::int AS count FROM public.team_memberships m
      JOIN public.teams t ON t.id=m.team_id WHERE t.program_type='high_school' AND m.status='approved'
      AND m.role IN('head_coach','assistant_coach','team_manager','athletic_director')`)).rows[0].count;
  } finally { db.release(); }
} catch (error) {
  report.outcome = "isolated_dev_staff_install_or_verification_failed";
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) report.errorCode = code;
  process.exitCode = 1;
} finally { await pool?.end(); console.log(JSON.stringify(report, null, 2)); }
