import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";

let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"]|undefined;
const report:Record<string,unknown>={scope:"Separate DEV only",existingAccountsEnrolled:0};
try {
  ({pool}=await parentDevelopmentConnection());
  const has=(await pool.query("SELECT to_regclass('hs_onboarding.version') AS installed")).rows[0].installed;
  if(!has && process.argv.includes("--apply")){
    await pool.query(await readFile(new URL("./dev-only/high-school-onboarding.sql",import.meta.url),"utf8"));
    report.installedThisRun=true;
  }
  const installed=!!(await pool.query("SELECT to_regclass('hs_onboarding.version') AS installed")).rows[0].installed;
  report.installed=installed;
  if(installed){
    assert.equal((await pool.query("SELECT version FROM hs_onboarding.version")).rows[0].version,1);
    const access=(await pool.query(`SELECT has_schema_privilege(oid,'hs_onboarding','USAGE') AS access
      FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','supabase_auth_admin')`)).rows;
    assert.equal(access.length,4);assert.ok(access.every(r=>!r.access));
    const rls=(await pool.query("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hs_onboarding' AND c.relkind='r'")).rows;
    assert.equal(rls.length,11);assert.ok(rls.every(r=>r.relrowsecurity));
    report.privateSchemaAndRlsVerified=true;
    report.flowCount=(await pool.query("SELECT count(*)::int AS count FROM hs_onboarding.flows")).rows[0].count;
  }
}catch{report.outcome="dev_install_or_verification_failed";process.exitCode=1;}
finally{await pool?.end();console.log(JSON.stringify(report,null,2));}
