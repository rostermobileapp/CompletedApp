/** Run only after explicit owner approval; never part of startup or publishing. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { familyProductionConnection } from "./lib/family-production-db";

const apply=process.argv.includes("--apply-owner-authorized-school-deletion");
let db:Awaited<ReturnType<typeof familyProductionConnection>>|undefined;
const columnCount=async()=>Number((await db!.query(`SELECT count(*)::int n FROM information_schema.columns
  WHERE table_schema='hs_onboarding' AND table_name IN('schools','programs','teams')
    AND column_name='deleted_at' AND data_type='timestamp with time zone'
    AND is_nullable='YES' AND column_default IS NULL`)).rows[0].n);
async function structureFingerprint(){
  const rows=[];
  for(const table of ["schools","programs","teams"])
    rows.push((await db!.query(`SELECT count(*)::int n,
      md5(coalesce(jsonb_agg(to_jsonb(t)-'deleted_at' ORDER BY t.id)::text,'[]')) fingerprint
      FROM hs_onboarding.${table} t`)).rows[0]);
  return JSON.stringify(rows);
}
try {
  db=await familyProductionConnection();
  await db.query("BEGIN READ ONLY");
  const existing=await columnCount();
  if(existing!==0&&existing!==3)throw Error("PARTIAL_SCHOOL_DELETION_SCHEMA_REQUIRES_RECONCILIATION");
  const before=await structureFingerprint();
  await db.query("ROLLBACK");
  if(apply&&!existing){
    const sql=await readFile(new URL("../migrations/0063_school_structure_deletion.sql",import.meta.url),"utf8");
    assert.match(sql,/COMMIT;\s*$/);
    await db.query(sql.replace(/COMMIT;\s*$/,""));
    if(await columnCount()!==3)throw Error("SCHOOL_DELETION_SCHEMA_INCOMPLETE");
    if(await structureFingerprint()!==before)throw Error("EXISTING_STRUCTURE_RECORDS_CHANGED");
    await db.query("COMMIT");
  }
  await db.query("BEGIN READ ONLY");
  const installed=await columnCount()===3;
  await db.query("ROLLBACK");
  console.log(JSON.stringify({outcome:"verified",target:"validated_external_production",
    installed,changed:apply&&!existing,existingRecordsPreserved:true,accountsChanged:0,appPublished:false}));
}catch(error){
  await db?.query("ROLLBACK").catch(()=>{});
  const e=error as {code?:string;message?:string};
  console.error(JSON.stringify({outcome:"stopped",code:e.code||
    (/^[A-Z0-9_]+$/.test(e.message||"")?e.message:"SCHOOL_STRUCTURE_UPDATE_FAILED")}));
  process.exitCode=1;
}finally{await db?.end();}
