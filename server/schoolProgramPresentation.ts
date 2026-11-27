import type { ParentSql } from "./highSchoolParentSecurity";

/** Fixed SQL fragments only; supports the explicitly staged database upgrade.
 * Callers alias programs as p. No user input enters these fragments. */
export async function schoolProgramPresentation(db: Pick<ParentSql, "query">) {
  const installed = !!(await db.query("SELECT to_regclass('hs_onboarding.schools') AS installed")).rows[0]?.installed;
  return installed ? {
    join: "LEFT JOIN hs_onboarding.schools school ON school.id=p.school_id",
    name: "coalesce(school.name,p.name)",
    town: "coalesce(school.town,p.town)",
  } : { join: "", name: "p.name", town: "p.town" };
}
