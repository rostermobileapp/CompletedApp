import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { familyProductionConnection } from "./lib/family-production-db";
import { productionFamilyInstalled } from "../server/productionFamilyRuntime";
import { productionOnboardingTestsInstalled } from "../server/productionOnboardingTests";

const apply=process.argv.includes("--apply-owner-authorized-tests");
let db: Awaited<ReturnType<typeof familyProductionConnection>>|undefined;
try {
  if(!apply&&!process.argv.includes("--production-read-only"))throw Error("EXPLICIT_MODE_REQUIRED");
  db=await familyProductionConnection();
  const sql=await readFile(new URL("./production/high-school-onboarding-tests.sql",import.meta.url),"utf8");
  const manifest=createHash("sha256").update(sql).digest("hex");
  await db.query("BEGIN READ ONLY");
  if(!await productionFamilyInstalled(db))throw Error("PROTECTED_FAMILY_FOUNDATION_REQUIRED");
  const exists=!!(await db.query("SELECT to_regclass('hs_onboarding.production_test_version') AS ready")).rows[0].ready;
  if(exists&&(await db.query("SELECT manifest FROM hs_onboarding.production_test_version WHERE version=1")).rows[0]?.manifest!==manifest)
    throw Error("TEST_INSTALLATION_MANIFEST_DIFFERS");
  if(!exists){
    const names=[...sql.matchAll(/CREATE TABLE (hs_onboarding\.[a-z_]+)/g)].map(match=>match[1]);
    if((await db.query("SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NOT NULL",[names])).rows.length)
      throw Error("EXISTING_TABLE_REQUIRES_RECONCILIATION");
    if((await db.query(`SELECT 1 FROM pg_constraint WHERE conrelid='hs_onboarding.children'::regclass
      AND conname='children_enabled_check' AND pg_get_constraintdef(oid)='CHECK ((NOT enabled))'`)).rows.length!==1)
      throw Error("CHILD_GUARD_REQUIRES_RECONCILIATION");
  }
  const users=(await db.query(`SELECT count(*)::int AS n FROM public.users u JOIN auth.users a ON a.id::text=u.id
    WHERE u.display_id=ANY($1::text[]) AND u.deleted_at IS NULL AND a.email_confirmed_at IS NOT NULL`,
  [["U00001","U00002","U00250"]])).rows[0].n;
  if(users!==3)throw Error("TEST_ACCOUNT_PREREQUISITES_FAILED");
  await db.query("ROLLBACK");
  let changed=false;
  if(apply&&!exists){
    await db.query("SELECT set_config('roster.onboarding_tests','owner-authorized',false)");
    await db.query(sql.replace("-- TEST_MANIFEST",`INSERT INTO hs_onboarding.production_test_version VALUES(1,'${manifest}',true);`));
    if(!await productionFamilyInstalled(db)||!await productionOnboardingTestsInstalled(db))throw Error("READINESS_FAILED");
    await db.query("COMMIT");changed=true;
  }
  await db.query("BEGIN READ ONLY");
  const installed=await productionOnboardingTestsInstalled(db);
  const privateTables=(await db.query(`SELECT bool_and(c.relrowsecurity) AS rls,
    bool_and(NOT has_table_privilege('authenticated',c.oid,'SELECT')
      AND NOT has_table_privilege('anon',c.oid,'SELECT')) AS private
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='hs_onboarding' AND c.relkind='r'`)).rows[0];
  await db.query("ROLLBACK");
  console.log(JSON.stringify({outcome:"verified",installed,changed,testAccounts:3,privateTables,
    accountsReset:0,rolesGranted:0,childrenActivated:0,originalFamilyProtectionPreserved:true}));
}catch(error){
  await db?.query("ROLLBACK").catch(()=>{});
  console.error(JSON.stringify({outcome:"stopped",code:(error as any)?.code??(error as Error).message}));process.exitCode=1;
}finally{await db?.end();}
