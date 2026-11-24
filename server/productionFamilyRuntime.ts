import type { ParentSql } from "./highSchoolParentSecurity";

/** Protection does not depend on the enrollment flag: turning off new
 * enrollment must never reopen an already-protected adult account. */
export async function productionFamilyInstalled(pool: Pick<ParentSql, "query">): Promise<boolean> {
  const schemas = (await pool.query(`SELECT
    to_regnamespace('hs_parent_security') IS NOT NULL AS present,
    to_regclass('hs_parent_security.live_version') IS NOT NULL AS live`)).rows[0];
  if (!schemas?.present) return false;
  if (!schemas.live) throw new Error("Family security installation is incomplete");
  const ready = (await pool.query(`SELECT
    EXISTS(SELECT 1 FROM hs_parent_security.live_version WHERE version=1 AND manifest ~ '^[a-f0-9]{64}$') AS version,
    (SELECT count(*)=4 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='auth' AND t.tgenabled='O'
      AND t.tgname IN('hs_parent_security_user','hs_parent_security_delete','hs_parent_security_identity','hs_parent_security_mfa')) AS guards,
    NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN('r','p')
      AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid
        AND p.polname='roster_family_direct_guard' AND NOT p.polpermissive)) AS policies,
    EXISTS(SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole,
      unnest(s.setconfig) c WHERE r.rolname='authenticator'
      AND s.setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
      AND c='pgrst.db_pre_request=public.roster_family_api_guard') AS api_guard,
    to_regclass('hs_onboarding.family_version') IS NOT NULL AS family`)).rows[0];
  if (!ready || Object.values(ready).some(value => value !== true))
    throw new Error("Family security readiness checks failed");
  return true;
}

export function productionFamilyEnrollmentEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" && env.FAMILY_SETUP_ENABLED === "1"
    && env.NONPRODUCTION_ISOLATED !== "1" && env.PREVIEW_USE_LIVE_SECRETS !== "1";
}
