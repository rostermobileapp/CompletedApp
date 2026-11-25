import type { OnboardingActor } from "./highSchoolOnboarding";
import { ParentSecurityError, type ParentSql } from "./highSchoolParentSecurity";

/** Server-owned rollout list. Never accept display IDs or fixture flags from a request. */
export const PRODUCTION_ONBOARDING_TESTERS = ["U00001", "U00002", "U00250"] as const;

export async function productionOnboardingTestsInstalled(db: Pick<ParentSql, "query">) {
  if (!(await db.query("SELECT to_regclass('hs_onboarding.production_test_version') AS ready")).rows[0]?.ready) return false;
  return !!(await db.query(`SELECT 1 FROM hs_onboarding.production_test_version
    WHERE version=1 AND enabled AND manifest ~ '^[a-f0-9]{64}$'`)).rows.length;
}

export async function productionOnboardingTester(db: Pick<ParentSql, "query">, actor: OnboardingActor) {
  if (!actor.emailVerified) return false;
  const result = await db.query(`SELECT u.display_id FROM public.users u
    JOIN auth.users a ON a.id::text=u.id
    JOIN auth.sessions s ON s.user_id=a.id AND s.id=$2
    WHERE a.id=$1 AND u.deleted_at IS NULL AND a.email_confirmed_at IS NOT NULL
      AND lower(trim(a.email))=lower(trim($3)) AND a.deleted_at IS NULL
      AND (s.not_after IS NULL OR s.not_after>now())
      AND NOT EXISTS(SELECT 1 FROM public.account_user_merges m WHERE m.source_user_id=u.id)
      AND u.display_id=ANY($4::text[])`,
  [actor.authId, actor.sessionId, actor.email, [...PRODUCTION_ONBOARDING_TESTERS]]);
  return result.rows.length === 1;
}

export async function requireProductionOnboardingTester(db: Pick<ParentSql, "query">, actor: OnboardingActor) {
  if (!await productionOnboardingTester(db, actor)) throw new ParentSecurityError("ONBOARDING_TEST_ACCESS_DENIED", 403);
}

/** Mirror real league commissioner authority; never invent schools, teams or staff roles. */
export async function syncProductionSchoolLeagues(db: Pick<ParentSql,"query">) {
  await db.query(`WITH source AS MATERIALIZED(
    SELECT l.id,l.name,l.commissioner_id FROM public.leagues l JOIN public.users u ON u.id=l.commissioner_id
    WHERE u.deleted_at IS NULL AND u.display_id=ANY($1::text[])
      AND l.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    INSERT INTO hs_onboarding.leagues(id,name) SELECT id::uuid,name FROM source
    ON CONFLICT(id) DO UPDATE SET name=excluded.name`,[[...PRODUCTION_ONBOARDING_TESTERS]]);
  await db.query(`DELETE FROM hs_onboarding.league_approvers a WHERE NOT EXISTS(
    SELECT 1 FROM public.leagues l JOIN public.users u ON u.id=l.commissioner_id
    WHERE l.id=a.league_id::text AND l.commissioner_id=a.auth_id::text AND u.deleted_at IS NULL
      AND u.display_id=ANY($1::text[]))`,[[...PRODUCTION_ONBOARDING_TESTERS]]);
  await db.query(`INSERT INTO hs_onboarding.league_approvers(league_id,auth_id)
    SELECT h.id,a.id FROM hs_onboarding.leagues h JOIN public.leagues l ON l.id=h.id::text
    JOIN auth.users a ON a.id::text=l.commissioner_id JOIN public.users u ON u.id=a.id::text
    WHERE u.deleted_at IS NULL AND u.display_id=ANY($1::text[]) AND a.email_confirmed_at IS NOT NULL
    ON CONFLICT DO NOTHING`,[[...PRODUCTION_ONBOARDING_TESTERS]]);
}
