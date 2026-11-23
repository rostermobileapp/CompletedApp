import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";

/** Explicit DEV installer; never imported by server startup or post-merge. */
let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined;
const report: Record<string, unknown> = { scope: "Separate DEV only", childActivationEnabled: false, realFamiliesEnrolled: 0 };
try {
  ({ pool } = await parentDevelopmentConnection());
  assert.ok((await pool.query("SELECT to_regclass('hs_onboarding.version') AS installed")).rows[0]?.installed);
  assert.ok((await pool.query("SELECT to_regclass('hs_parent_security.version') AS installed")).rows[0]?.installed);
  const has = !!(await pool.query("SELECT to_regclass('hs_onboarding.youth_version') AS installed")).rows[0]?.installed;
  if (!has && process.argv.includes("--apply")) {
    await pool.query(await readFile(new URL("./dev-only/high-school-youth-onboarding.sql", import.meta.url), "utf8"));
    report.installedThisRun = true;
  }
  report.installed = !!(await pool.query("SELECT to_regclass('hs_onboarding.youth_version') AS installed")).rows[0]?.installed;
  if (report.installed) {
    assert.equal((await pool.query("SELECT version FROM hs_onboarding.youth_version")).rows[0].version, 1);
    const access = (await pool.query(`SELECT has_schema_privilege(oid,'hs_onboarding','USAGE') AS access
      FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','supabase_auth_admin')`)).rows;
    assert.equal(access.length, 4); assert.ok(access.every(r => !r.access));
    const tables = (await pool.query(`SELECT c.relname,c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hs_onboarding' AND c.relkind='r'`)).rows;
    assert.ok(tables.length >= 23); assert.ok(tables.every(r => r.relrowsecurity));
    report.privateSchemaAndRlsVerified = true;
  }
} catch {
  report.outcome = "dev_install_or_verification_failed";
  process.exitCode = 1;
} finally {
  await pool?.end();
  console.log(JSON.stringify(report, null, 2));
}
