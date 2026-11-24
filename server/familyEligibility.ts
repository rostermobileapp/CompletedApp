import { familyAgeEligibility } from "../shared/familyEligibility";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import type { ParentSql } from "./highSchoolParentSecurity";

/** Called only after provider/session authentication. Use the stored account
 * DOB and the existing verified public-user mapping, never request fields.
 * No plan, role, team-membership or completed-onboarding prerequisite. */
export async function requireFamilyAdultAccount(
  db: Pick<ParentSql, "query">, actor: OnboardingActor, now = new Date(),
): Promise<{ id: string }> {
  if (!actor.emailVerified) throw new OnboardingError("VERIFIED_EMAIL_REQUIRED", 403);
  const adults = (await db.query(`SELECT id,date_of_birth FROM public.users
    WHERE id=$1 OR lower(trim(email))=lower(trim($2)) LIMIT 2 FOR SHARE`, [actor.authId, actor.email])).rows;
  if (adults.length !== 1) throw new OnboardingError("EXISTING_ADULT_ACCOUNT_REQUIRED", 403);
  const eligibility = familyAgeEligibility(adults[0].date_of_birth, now);
  if (!eligibility.eligible) {
    const codes = { dob_required: "FAMILY_DOB_REQUIRED", dob_invalid: "FAMILY_DOB_INVALID", under_21: "FAMILY_AGE_REQUIRED" };
    throw new OnboardingError(codes[eligibility.reason as keyof typeof codes], 403);
  }
  return { id: adults[0].id };
}
