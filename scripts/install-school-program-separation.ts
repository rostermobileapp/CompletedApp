/** Explicit, owner-authorized external Supabase operation; never run at startup. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { familyProductionConnection } from "./lib/family-production-db";

const apply = process.argv.includes("--apply-owner-authorized-schools");
let db: Awaited<ReturnType<typeof familyProductionConnection>> | undefined;

async function preservedRecords(connection: NonNullable<typeof db>) {
  // Compare existing records in memory only. Never export names or child data.
  return (await connection.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(p)-'school_id' ORDER BY p.id),'[]'::jsonb)
      FROM hs_onboarding.programs p) AS programs,
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)
      FROM hs_onboarding.teams t) AS teams,
    (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb)
      FROM hs_onboarding.staff_requests r) AS staff,
    (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb)
      FROM hs_onboarding.children c) AS children,
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)
      FROM public.teams t WHERE t.program_type IN('high_school','youth')) AS canonical_teams,
    (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb)
      FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
      WHERE t.program_type IN('high_school','youth')) AS memberships`)).rows[0];
}

async function verify(connection: NonNullable<typeof db>) {
  const integrity = (await connection.query(`SELECT
    (SELECT count(*)::int FROM hs_onboarding.schools) AS schools,
    (SELECT count(*)::int FROM hs_onboarding.programs) AS programs,
    (SELECT count(*)::int FROM hs_onboarding.programs p
      LEFT JOIN hs_onboarding.schools s ON s.id=p.school_id
      WHERE s.id IS NULL) AS unlinked,
    (SELECT relrowsecurity FROM pg_class WHERE oid='hs_onboarding.schools'::regclass) AS rls,
    NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role','supabase_auth_admin']) AS role_name
      WHERE has_table_privilege(role_name,'hs_onboarding.schools','SELECT,INSERT,UPDATE,DELETE')) AS private,
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hs_onboarding.programs'::regclass
      AND confrelid='hs_onboarding.schools'::regclass AND contype='f') AS school_reference,
    to_regclass('hs_onboarding.programs_league_school_name_unique') IS NOT NULL AS unique_program_names`)).rows[0];
  assert.equal(integrity.unlinked, 0, "UNLINKED_PROGRAMS");
  assert.equal(integrity.rls, true, "SCHOOL_RLS_REQUIRED");
  assert.equal(integrity.private, true, "SCHOOL_PRIVACY_REQUIRED");
  assert.equal(integrity.school_reference, true, "SCHOOL_REFERENCE_REQUIRED");
  assert.equal(integrity.unique_program_names, true, "PROGRAM_UNIQUENESS_REQUIRED");
  return integrity;
}

try {
  if (!apply && !process.argv.includes("--production-read-only")) throw Error("EXPLICIT_MODE_REQUIRED");
  db = await familyProductionConnection(); // Validates production vs DEV and CA.
  await db.query("BEGIN READ ONLY");
  await db.query("SET LOCAL statement_timeout='30s'");
  const existing = (await db.query("SELECT to_regclass('hs_onboarding.schools') IS NOT NULL AS installed")).rows[0].installed;
  const column = (await db.query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema='hs_onboarding' AND table_name='programs' AND column_name='school_id'`)).rows.length > 0;
  assert.equal(existing, column, "PARTIAL_SCHOOL_SCHEMA_REQUIRES_RECONCILIATION");
  if (existing) await verify(db);
  const before = await preservedRecords(db);
  await db.query("ROLLBACK");

  if (apply && !existing) {
    const migration = await readFile(new URL("../migrations/0060_school_program_separation.sql", import.meta.url), "utf8");
    assert.match(migration, /COMMIT;\s*$/);
    // Leave the approved migration's transaction open until checks pass.
    await db.query(migration.replace(/COMMIT;\s*$/, ""));
    await verify(db);
    if (!isDeepStrictEqual(await preservedRecords(db), before)) throw Error("EXISTING_RECORDS_CHANGED");
    await db.query("COMMIT");
  }

  await db.query("BEGIN READ ONLY");
  const installed = (await db.query("SELECT to_regclass('hs_onboarding.schools') IS NOT NULL AS installed")).rows[0].installed;
  const integrity = installed ? await verify(db) : null;
  await db.query("ROLLBACK");
  console.log(JSON.stringify({
    outcome: "verified", target: "validated_external_production",
    installed, changed: apply && !existing, integrity,
    existingRecordsPreserved: true, accountsChanged: 0, rolesGranted: 0, appPublished: false,
  }));
} catch (error) {
  await db?.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ outcome: "stopped", code: (error as { code?: string }).code ?? (error as Error).message }));
  process.exitCode = 1;
} finally {
  await db?.end();
}
