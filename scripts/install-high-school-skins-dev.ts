import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";

// Explicit owner-approved DEV migration, deliberately absent from startup and
// post-merge setup. The existing helper excludes the live database/API project.
let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined;
const report: Record<string, unknown> = { scope: "isolated nonproduction only", childActivationEnabled: false };
try {
  ({ pool } = await parentDevelopmentConnection());
  const client = await pool.connect();
  try {
    assert.ok((await client.query("SELECT to_regclass('hs_onboarding.youth_version') AS installed")).rows[0].installed);
    const before = (await client.query("SELECT count(*)::int AS count FROM hs_onboarding.children WHERE enabled")).rows[0].count;
    if (process.argv.includes("--apply")) {
      await client.query("SELECT set_config('roster.hs_skin_dev','phase1',false)");
      await client.query(await readFile(new URL("./dev-only/high-school-team-skins.sql", import.meta.url), "utf8"));
      report.applied = true;
    }
    report.installed = !!(await client.query("SELECT to_regclass('hs_onboarding.skin_version') AS installed")).rows[0].installed;
    if (report.installed) {
      report.approvedMemberships = (await client.query(`SELECT m.role,count(*)::int AS count
        FROM public.team_memberships m JOIN hs_onboarding.skin_migration_memberships x ON x.membership_id=m.id
        WHERE m.status='approved' GROUP BY m.role ORDER BY m.role`)).rows;
      report.teams = (await client.query("SELECT count(*)::int AS count FROM public.teams WHERE program_type='high_school'")).rows[0].count;
      assert.equal((await client.query("SELECT count(*)::int AS count FROM hs_onboarding.children WHERE enabled")).rows[0].count, before);
      report.childActivationUnchanged = true;
    }
  } finally { client.release(); }
} catch (error) {
  report.outcome = "isolated_dev_migration_or_verification_failed";
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) report.errorCode = code;
  process.exitCode = 1;
} finally { await pool?.end(); console.log(JSON.stringify(report, null, 2)); }
