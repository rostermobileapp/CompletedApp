import { z } from "zod";
import { schoolStructureDeleteInput, type SchoolStructureDeletionPreview } from "../shared/schoolLeagueManagement";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import type { ParentTransaction } from "./highSchoolParentSecurity";
import { deactivateSchoolStructure, requireSchoolStructure } from "./schoolStructureManagement";

type Kind = SchoolStructureDeletionPreview["kind"];
const changed = () => new OnboardingError("SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED",409);

// The caller must first verify active ownership of this School/Youth league.
export async function structureDeletionPreview(
  db: ParentTransaction, leagueId: string, kind: Kind, id: string,
): Promise<SchoolStructureDeletionPreview> {
  z.string().uuid().parse(id);
  await requireSchoolStructure(db);
  const missing = () => new OnboardingError(kind==="program"?"PROGRAM_LEAGUE_MISMATCH":"TEAM_LEAGUE_MISMATCH",403);
  const locator=(await db.query(`SELECT p.id,p.school_id FROM hs_onboarding.programs p
    WHERE p.league_id=$1 AND p.deleted_at IS NULL AND ${kind==="program"?"p.id=$2":"EXISTS(SELECT 1 FROM hs_onboarding.teams t WHERE t.program_id=p.id AND t.id=$2 AND t.deleted_at IS NULL)"}`,
    [leagueId,id])).rows[0];
  if(!locator)throw missing();
  // Match school -> program -> private team -> canonical team lock ordering.
  // A shared school need not be editable to remove this league's own program.
  if(locator.school_id) {
    const school=(await db.query(`SELECT id FROM hs_onboarding.schools
      WHERE id=$1 AND deleted_at IS NULL FOR SHARE`,[locator.school_id])).rows[0];
    if(!school)throw changed();
  }
  const program=(await db.query(`SELECT id,name,school_id FROM hs_onboarding.programs
    WHERE id=$1 AND league_id=$2 AND deleted_at IS NULL FOR UPDATE`,[locator.id,leagueId])).rows[0];
  if(!program)throw missing();
  if(program.school_id!==locator.school_id)throw changed();
  const teams=(await db.query(`SELECT id,name,program_id FROM hs_onboarding.teams
    WHERE program_id=$1 AND deleted_at IS NULL ${kind==="team"?"AND id=$2":""}
    ORDER BY id FOR UPDATE`,kind==="team"?[program.id,id]:[program.id])).rows;
  if(kind==="team"&&!teams.length)throw missing();
  const teamIds=teams.map(t=>String(t.id)).sort();
  if(teamIds.length) {
    const canonical=(await db.query(`SELECT id,program_id,program_type,league_id FROM public.teams
      WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,[teamIds])).rows;
    if(canonical.some(t=>t.program_id!==program.id||!["high_school","youth"].includes(t.program_type)||
      (t.league_id&&t.league_id!==leagueId)))throw changed();
  }
  return {kind,id,name:kind==="program"?program.name:teams[0].name,schoolId:program.school_id,
    programId:program.id,teamIds,teamCount:teamIds.length};
}

export async function deleteProgramOrTeam(
  db: ParentTransaction, actor: OnboardingActor, leagueId: string, kind: Kind, id: string, input: unknown,
) {
  const data=schoolStructureDeleteInput.parse(input);
  const preview=await structureDeletionPreview(db,leagueId,kind,id);
  if(data.expectedName!==preview.name||data.schoolId!==preview.schoolId||data.programId!==preview.programId||
    JSON.stringify([...data.teamIds].sort())!==JSON.stringify(preview.teamIds))throw changed();
  if(data.confirmation!==preview.name)throw new OnboardingError("STRUCTURE_DELETE_CONFIRMATION_REQUIRED",400);
  await deactivateSchoolStructure(db,kind==="program"?[preview.programId]:[],preview.teamIds);
  await db.query("INSERT INTO hs_onboarding.audit(auth_id,event,target_id) VALUES($1,$2,$3)",
    [actor.authId,`${kind}_deleted`,id]);
  return {saved:true};
}
