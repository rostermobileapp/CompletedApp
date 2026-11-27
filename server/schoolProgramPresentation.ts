import type { ParentSql } from "./highSchoolParentSecurity";

/** Fixed SQL fragments only; supports the explicitly staged database upgrade.
 * Callers alias programs as p. No user input enters these fragments. */
export async function schoolProgramPresentation(db: Pick<ParentSql, "query">) {
  const metadata = (await db.query(`SELECT to_regclass('hs_onboarding.schools') AS installed,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hs_onboarding'
      AND table_name='programs' AND column_name='deleted_at') AS deletion_installed`)).rows[0];
  const installed = !!metadata?.installed;
  return installed ? {
    join: "LEFT JOIN hs_onboarding.schools school ON school.id=p.school_id",
    name: "coalesce(school.name,p.name)",
    town: "coalesce(school.town,p.town)",
    active: metadata?.deletion_installed ? "p.deleted_at IS NULL" : "true",
    teamActive: metadata?.deletion_installed ? "t.deleted_at IS NULL" : "true",
  } : { join: "", name: "p.name", town: "p.town", active:"true", teamActive:"true" };
}
