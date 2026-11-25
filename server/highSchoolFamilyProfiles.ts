import { HS_CONSENT_TEXT, HS_CONSENT_VERSION, HS_MAX_FAMILY_PLAYERS, type HsPlayerDraft } from "../shared/highSchoolOnboarding";
import type { ParentSql, ParentTransaction } from "./highSchoolParentSecurity";
import { productionOnboardingTester } from "./productionOnboardingTests";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";

export async function independentChildSetupInstalled(db: Pick<ParentSql, "query">) {
  return !!(await db.query("SELECT to_regclass('hs_onboarding.independent_child_version') AS ready")).rows[0]?.ready;
}

/** Called only inside the authenticated, verified-parent consent transaction.
 * Existing installations continue to use their original behavior until migrated. */
export async function saveIndependentChildProfiles(
  db: ParentTransaction, actor: OnboardingActor, players: HsPlayerDraft[], production: boolean,
) {
  if (!await independentChildSetupInstalled(db)) return;
  if (production && !await productionOnboardingTester(db, actor)) return;
  const existing = (await db.query(`SELECT c.*,r.player_key FROM hs_onboarding.children c
    LEFT JOIN hs_onboarding.player_requests r ON r.id=c.player_request_id
    WHERE c.parent_auth_id=$1 FOR UPDATE OF c`, [actor.authId])).rows;
  const requests = (await db.query("SELECT player_key FROM hs_onboarding.player_requests WHERE auth_id=$1", [actor.authId])).rows;
  const keys = new Set([...existing.map(c => c.profile_details?.id ?? c.player_key ?? c.id),
    ...requests.map(r => r.player_key), ...players.map(p => p.id)]);
  if (keys.size > HS_MAX_FAMILY_PLAYERS) throw new OnboardingError("HOUSEHOLD_LIMIT",409);
  for (const player of players) {
    const child = existing.find(c => c.profile_details?.id === player.id || c.player_key === player.id || c.id === player.id);
    if (!player.birthYear) throw new OnboardingError("BIRTH_YEAR_REQUIRED");
    if (child?.revoked_at) throw new OnboardingError("CHILD_ACCESS_UNAVAILABLE",403);
    // A child profile's stable identity must survive invitation claims and phone sessions.
    if (child && (child.first_name !== player.firstName || child.last_name !== player.lastName ||
      (child.profile_details?.birthYear && child.profile_details.birthYear !== player.birthYear)))
      throw new OnboardingError("CHILD_IDENTITY_MISMATCH",409);
    const details = { ...player, consentText: HS_CONSENT_TEXT };
    if (child) await db.query(`UPDATE hs_onboarding.children SET profile_details=$2,
      profile_consent_version=$3,profile_consented_at=now() WHERE id=$1`, [child.id, details, HS_CONSENT_VERSION]);
    else await db.query(`INSERT INTO hs_onboarding.children
      (id,parent_auth_id,first_name,last_name,enabled,profile_details,profile_consent_version,profile_consented_at)
      VALUES($1,$2,$3,$4,false,$5,$6,now())`, [player.id, actor.authId, player.firstName, player.lastName, details, HS_CONSENT_VERSION]);
    await db.query("INSERT INTO hs_onboarding.audit(auth_id,event,target_id) VALUES($1,$2,$3)",
      [actor.authId, "independent_child_consent_saved", child?.id ?? player.id]);
  }
}
