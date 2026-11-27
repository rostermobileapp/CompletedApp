/** Explicit owner-authorized external Supabase operation; never startup DDL. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { familyProductionConnection } from "./lib/family-production-db";

const tables = ["league_player_eligibility", "team_player_eligibility", "player_eligibility_audit"];
const apply = process.argv.includes("--apply-owner-authorized-eligibility");
let db: Awaited<ReturnType<typeof familyProductionConnection>> | undefined;
type Connection = NonNullable<typeof db>;

async function installed(connection: Connection) {
  const result = (await connection.query(`SELECT count(*)::int AS n FROM pg_tables
    WHERE schemaname='hs_onboarding' AND tablename=ANY($1::text[])`, [tables])).rows[0].n;
  assert.ok(result === 0 || result === 3, "PARTIAL_ELIGIBILITY_SCHEMA");
  return result === 3;
}

async function verify(connection: Connection) {
  const rows = (await connection.query(`SELECT c.relname AS name,c.relrowsecurity AS rls,
    NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role','supabase_auth_admin']) role_name
      WHERE has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) WHERE grantee=0) AS private,
    (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND contype='p') AS primary_keys,
    (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND contype='f' AND convalidated) AS foreign_keys,
    EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND contype='f'
      AND confrelid='hs_onboarding.children'::regclass AND confdeltype='c' AND convalidated) AS child_cleanup
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='hs_onboarding' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tables])).rows;
  assert.equal(rows.length,3,"ELIGIBILITY_TABLES_REQUIRED");
  for (const row of rows) {
    assert.equal(row.rls,true,"ELIGIBILITY_RLS_REQUIRED");
    assert.equal(row.private,true,"ELIGIBILITY_PRIVATE_ACCESS_REQUIRED");
    assert.equal(row.primary_keys,1,"ELIGIBILITY_PRIMARY_KEY_REQUIRED");
    assert.equal(row.foreign_keys,row.name==="player_eligibility_audit"?3:2,"ELIGIBILITY_REFERENCES_REQUIRED");
    assert.equal(row.child_cleanup,true,"ELIGIBILITY_CHILD_CLEANUP_REQUIRED");
  }
  const columns=(await connection.query(`SELECT table_name,array_agg(column_name::text ORDER BY ordinal_position) AS names
    FROM information_schema.columns WHERE table_schema='hs_onboarding' AND table_name=ANY($1::text[])
    GROUP BY table_name`,[tables])).rows;
  for(const row of columns) {
    const expected=row.table_name==="player_eligibility_audit"
      ? ["id","league_id","team_id","child_id","scope","restricted","reason","actor_id","created_at"]
      : [row.table_name==="league_player_eligibility"?"league_id":"team_id","child_id","restricted","reason","version","updated_by","updated_at"];
    assert.deepEqual(row.names,expected,"ELIGIBILITY_COLUMNS_REQUIRED");
  }
  return rows;
}

async function preservedRecords(connection: Connection) {
  // Hash within PostgreSQL: never export child records, account data or device
  // credentials. Repeatable-read avoids confusing other users' concurrent writes
  // with changes made by this installation's own transaction.
  const names=(await connection.query(`SELECT schemaname,tablename FROM pg_tables
    WHERE (schemaname IN('hs_onboarding','hs_parent_security') AND NOT
      (schemaname='hs_onboarding' AND tablename=ANY($1::text[])))
    OR (schemaname='public' AND tablename IN('users','teams','team_memberships'))
    ORDER BY schemaname,tablename`,[tables])).rows;
  const result: Record<string, unknown> = {};
  for(const {schemaname,tablename} of names) {
    assert.match(schemaname,/^[a-z_]+$/);assert.match(tablename,/^[a-z0-9_]+$/);
    result[`${schemaname}.${tablename}`]=(await connection.query(`SELECT count(*)::int AS n,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS fingerprint
      FROM "${schemaname}"."${tablename}" t`)).rows[0];
  }
  return result;
}

try {
  if (!apply && !process.argv.includes("--production-read-only")) throw Error("EXPLICIT_MODE_REQUIRED");
  db=await familyProductionConnection();
  await db.query("BEGIN READ ONLY");
  await db.query("SET LOCAL statement_timeout='30s'");
  const prerequisites=(await db.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='hs_onboarding'
    AND tablename IN('leagues','teams','children','staff_events','staff_lineup')`)).rows[0].n;
  assert.equal(prerequisites,5,"SCHOOL_RUNTIME_SCHEMA_REQUIRED");
  const existing=await installed(db);
  if(existing)await verify(db);
  await db.query("ROLLBACK");

  if(apply&&!existing) {
    const migration=await readFile(new URL("../migrations/0061_school_player_eligibility.sql",import.meta.url),"utf8");
    assert.match(migration,/BEGIN;/);assert.match(migration,/COMMIT;\s*$/);
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await db.query("SET LOCAL statement_timeout='30s'");
    const before=await preservedRecords(db);
    await db.query(migration.replace(/\bBEGIN;/,"").replace(/COMMIT;\s*$/,""));
    await verify(db);
    assert.ok(isDeepStrictEqual(before,await preservedRecords(db)),"EXISTING_RECORDS_CHANGED");
    for(const table of tables) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM hs_onboarding."${table}"`)).rows[0].n,0,"UNEXPECTED_INITIAL_RESTRICTIONS");
    }
    await db.query("COMMIT");
  }
  await db.query("BEGIN READ ONLY");
  const present=await installed(db);
  const integrity=present?await verify(db):null;
  await db.query("ROLLBACK");
  console.log(JSON.stringify({outcome:"verified",target:"validated_external_production",installed:present,
    changed:apply&&!existing,integrity,existingRecordsPreserved:apply&&!existing?true:null,appPublished:false}));
} catch(error) {
  await db?.query("ROLLBACK").catch(()=>{});
  console.error(JSON.stringify({outcome:"stopped",code:(error as {code?:string}).code??(error as Error).message}));
  process.exitCode=1;
} finally {await db?.end();}
