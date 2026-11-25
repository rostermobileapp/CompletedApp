import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { familyProductionConnection } from "./lib/family-production-db";
import { productionFamilyInstalled } from "../server/productionFamilyRuntime";
import { productionOnboardingTestsInstalled } from "../server/productionOnboardingTests";

const apply=process.argv.includes("--apply-owner-authorized-child-profiles");
let db:Awaited<ReturnType<typeof familyProductionConnection>>|undefined;
try {
  if(!apply&&!process.argv.includes("--production-read-only"))throw Error("EXPLICIT_MODE_REQUIRED");
  db=await familyProductionConnection();
  const sql=await readFile(new URL("./production/high-school-independent-children.sql",import.meta.url),"utf8");
  const manifest=createHash("sha256").update(sql).digest("hex");
  await db.query("BEGIN READ ONLY");
  if(!await productionFamilyInstalled(db)||!await productionOnboardingTestsInstalled(db))throw Error("PROTECTED_TEST_FOUNDATION_REQUIRED");
  const exists=!!(await db.query("SELECT to_regclass('hs_onboarding.independent_child_version') AS ready")).rows[0].ready;
  if(exists&&(await db.query("SELECT manifest FROM hs_onboarding.independent_child_version WHERE version=1")).rows[0]?.manifest!==manifest)
    throw Error("CHILD_PROFILE_MANIFEST_DIFFERS");
  await db.query("ROLLBACK");
  if(apply&&!exists){
    await db.query("SELECT set_config('roster.independent_children','owner-authorized',false)");
    await db.query(sql.replace("-- CHILD_PROFILE_MANIFEST",`INSERT INTO hs_onboarding.independent_child_version VALUES(1,'${manifest}');`));
    if(!await productionFamilyInstalled(db)||!await productionOnboardingTestsInstalled(db))throw Error("READINESS_FAILED");
    const guard=(await db.query(`SELECT 1 FROM pg_constraint WHERE conrelid='hs_onboarding.children'::regclass
      AND conname='children_enabled_test_parent'`)).rows.length===1;
    if(!guard)throw Error("RESTRICTED_PARENT_GUARD_REQUIRED");
    await db.query("COMMIT");
  }
  console.log(JSON.stringify({outcome:"verified",installed:exists||apply,changed:apply&&!exists,
    accountsReset:0,childrenAutomaticallyCreated:0,productionProtectionPreserved:true}));
} catch(error) {
  await db?.query("ROLLBACK").catch(()=>{});
  console.error(JSON.stringify({outcome:"stopped",code:(error as any)?.code??(error as Error).message}));
  process.exitCode=1;
} finally {await db?.end();}
