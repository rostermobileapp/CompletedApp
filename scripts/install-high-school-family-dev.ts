import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";

let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined;
const report: Record<string, unknown> = { scope: "isolated DEV family setup only", activationAvailable: false };
try {
  ({ pool } = await parentDevelopmentConnection());
  const db = await pool.connect();
  try {
    const before = (await db.query("SELECT count(*)::int AS n FROM hs_onboarding.children WHERE enabled")).rows[0].n;
    if (process.argv.includes("--apply")) {
      await db.query("SELECT set_config('roster.hs_family_dev','family-setup',false)");
      await db.query(await readFile(new URL("./dev-only/high-school-family-setup.sql", import.meta.url), "utf8"));
      report.applied = true;
    }
    report.installed = !!(await db.query("SELECT to_regclass('hs_onboarding.family_version') AS installed")).rows[0].installed;
    assert.equal((await db.query("SELECT count(*)::int AS n FROM hs_onboarding.children WHERE enabled")).rows[0].n, before);
    report.existingChildActivationUnchanged = true;
  } finally { db.release(); }
} catch {
  report.outcome = "isolated_dev_family_install_failed";
  process.exitCode = 1;
} finally { await pool?.end(); console.log(JSON.stringify(report, null, 2)); }
