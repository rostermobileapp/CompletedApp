/**
 * Owner-approved explicit DEV-only installation. No startup/production migration.
 * Existing accounts are NOT enrolled. Default invocation is read-only.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";

let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined;
const report: Record<string, unknown> = { scope: "Separate DEV only", accountsEnrolled: 0 };
try {
  ({ pool } = await parentDevelopmentConnection());
  const existing = await pool.query("SELECT to_regclass('hs_parent_security.version') AS installed");
  if (!existing.rows[0].installed && process.argv.includes("--apply")) {
    await pool.query(await readFile(new URL("./dev-only/high-school-parent-security.sql", import.meta.url), "utf8"));
    report.installedThisRun = true;
  }
  const installed = (await pool.query("SELECT to_regclass('hs_parent_security.version') AS installed")).rows[0].installed;
  report.installed = Boolean(installed);
  if (installed) {
    assert.equal((await pool.query("SELECT version FROM hs_parent_security.version")).rows[0].version, 1);
    const triggers = await pool.query(`SELECT tgname FROM pg_trigger WHERE tgenabled='O'
      AND tgname IN ('hs_parent_security_user','hs_parent_security_identity','hs_parent_security_mfa')`);
    assert.equal(triggers.rows.length, 3);
    const grants = await pool.query(`SELECT rolname,
      has_schema_privilege(oid,'hs_parent_security','USAGE') AS schema_access
      FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_auth_admin')`);
    assert.equal(grants.rows.length, 4);
    assert.ok(grants.rows.every(row => !row.schema_access));
    report.threeGuardsAndPrivateSchemaVerified = true;
    report.enrolledAccountCount = Number((await pool.query("SELECT count(*)::int AS count FROM hs_parent_security.accounts")).rows[0].count);
  }
} catch (error: any) {
  report.outcome = "installation_or_verification_failed";
  report.safeDatabaseCode = /^[0-9A-Z]{5}$/.test(error?.code ?? "") ? error.code : undefined;
  process.exitCode = 1;
} finally {
  await pool?.end();
  console.log(JSON.stringify(report, null, 2));
}
