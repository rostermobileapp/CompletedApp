import { z } from "zod";
import { schoolDeleteInput, schoolUpdateInput, type SchoolDeletionPreview } from "../shared/schoolLeagueManagement";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import type { ParentTransaction } from "./highSchoolParentSecurity";

export async function requireSchoolStructure(db: ParentTransaction) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema='hs_onboarding' AND table_name IN('schools','programs','teams') AND column_name='deleted_at'`);
  if (rows[0].n !== 3) throw new OnboardingError("SCHOOL_STRUCTURE_EDIT_UPDATE_REQUIRED",503);
}

// A league capability cannot be used to modify another league's school tree.
// Callers must first verify the current active league owner in the transaction.
async function schoolScope(db: ParentTransaction, actor: OnboardingActor, id: string) {
  z.string().uuid().parse(id);
  await requireSchoolStructure(db);
  const school=(await db.query(`SELECT id,name,town,created_by FROM hs_onboarding.schools
    WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[id])).rows[0];
  if(!school)throw new OnboardingError("SCHOOL_EDIT_FORBIDDEN",403);
  const programs=(await db.query(`SELECT p.id,p.league_id,l.commissioner_id,l.league_type
    FROM hs_onboarding.programs p LEFT JOIN public.leagues l ON l.id=p.league_id::text
    WHERE p.school_id=$1 AND p.deleted_at IS NULL ORDER BY p.id FOR UPDATE OF p`,[id])).rows;
  if(programs.some(p=>p.commissioner_id!==actor.authId))
    throw new OnboardingError("SCHOOL_SHARED_WITH_OTHER_LEAGUES",403);
  if(programs.some(p=>!["high_school","youth"].includes(p.league_type)))
    throw new OnboardingError("SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED",409);
  if(school.created_by!==actor.authId&&!programs.length)
    throw new OnboardingError("SCHOOL_EDIT_FORBIDDEN",403);
  const leagueIds=Array.from(new Set(programs.map(p=>String(p.league_id))));
  if(leagueIds.length) {
    const owners=(await db.query(`SELECT id,commissioner_id FROM public.leagues WHERE id=ANY($1::text[])
      ORDER BY id FOR SHARE`,[leagueIds])).rows;
    if(owners.length!==leagueIds.length||owners.some(l=>l.commissioner_id!==actor.authId))
      throw new OnboardingError("SCHOOL_SHARED_WITH_OTHER_LEAGUES",403);
  }
  const programIds=programs.map(p=>String(p.id)).sort();
  const teams=(await db.query(`SELECT t.id,t.program_id FROM hs_onboarding.teams t
    WHERE t.program_id=ANY($1::uuid[]) AND t.deleted_at IS NULL ORDER BY t.id FOR UPDATE`,[programIds])).rows;
  const teamIds=teams.map(t=>String(t.id)).sort();
  if(teamIds.length) {
    const canonical=(await db.query(`SELECT id,program_id,program_type,league_id FROM public.teams WHERE id=ANY($1::text[])
      ORDER BY id FOR UPDATE`,[teamIds])).rows;
    if(canonical.some(t=>!["high_school","youth"].includes(t.program_type)||
      !teams.some(source=>source.id===t.id&&source.program_id===t.program_id)||
      (t.league_id&&t.league_id!==programs.find(p=>p.id===t.program_id)?.league_id)))
      throw new OnboardingError("SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED",409);
  }
  return {school,programIds,teamIds};
}

export async function schoolDeletionPreview(db: ParentTransaction, actor: OnboardingActor, id: string): Promise<SchoolDeletionPreview> {
  const {school,programIds,teamIds}=await schoolScope(db,actor,id);
  return {school:{id:school.id,name:school.name,town:school.town},
    programCount:programIds.length,teamCount:teamIds.length,programIds,teamIds};
}

export async function updateSchool(db: ParentTransaction, actor: OnboardingActor, id: string, input: unknown) {
  const data=schoolUpdateInput.parse(input);
  const {school}=await schoolScope(db,actor,id);
  if(school.name!==data.expectedName||school.town!==data.expectedTown)
    throw new OnboardingError("SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED",409);
  await db.query("UPDATE hs_onboarding.schools SET name=$2,town=$3 WHERE id=$1",[id,data.name,data.town]);
  await db.query("INSERT INTO hs_onboarding.audit(auth_id,event,target_id) VALUES($1,'school_updated',$2)",[actor.authId,id]);
  return {saved:true};
}

export async function deleteSchool(db: ParentTransaction, actor: OnboardingActor, id: string, input: unknown) {
  const data=schoolDeleteInput.parse(input);
  const {school,programIds,teamIds}=await schoolScope(db,actor,id);
  if(school.name!==data.expectedName||school.town!==data.expectedTown||
    JSON.stringify([...data.programIds].sort())!==JSON.stringify(programIds)||
    JSON.stringify([...data.teamIds].sort())!==JSON.stringify(teamIds))
    throw new OnboardingError("SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED",409);
  if(data.confirmation!==school.name)throw new OnboardingError("SCHOOL_DELETE_CONFIRMATION_REQUIRED",400);

  // Existing child identities, approved consent requests, private chats, devices,
  // paid accounts and historical records must survive organization deletion.
  // Retain their FK anchors, but remove the whole tree from active operation.
  await db.query("DELETE FROM hs_onboarding.invitations WHERE team_id=ANY($1::uuid[])",[teamIds]);
  await db.query("UPDATE hs_onboarding.staff_requests SET status='denied' WHERE program_id=ANY($1::uuid[])",[programIds]);
  await db.query(`UPDATE hs_onboarding.player_requests SET status='denied'
    WHERE team_id=ANY($1::uuid[]) AND status='pending_staff'`,[teamIds]);
  await db.query("DELETE FROM public.team_memberships WHERE team_id=ANY($1::text[])",[teamIds]);
  await db.query("UPDATE public.teams SET league_id=NULL,program_id=NULL WHERE id=ANY($1::text[])",[teamIds]);
  await db.query(`UPDATE hs_onboarding.staff_events SET deleted_at=coalesce(deleted_at,now())
    WHERE team_id=ANY($1::uuid[])`,[teamIds]);
  await db.query("DELETE FROM hs_onboarding.staff_dispatch WHERE team_id=ANY($1::uuid[]) AND delivered_at IS NULL",[teamIds]);
  if((await db.query("SELECT to_regclass('hs_onboarding.eligibility_alerts') AS installed")).rows[0]?.installed)
    await db.query("UPDATE hs_onboarding.eligibility_alerts SET cancelled_at=coalesce(cancelled_at,now()) WHERE team_id=ANY($1::uuid[])",[teamIds]);
  await db.query(`UPDATE hs_onboarding.teams SET deleted_at=now(),code_digest='deleted:'||id::text
    WHERE id=ANY($1::uuid[])`,[teamIds]);
  await db.query("UPDATE hs_onboarding.programs SET deleted_at=now(),status='pending' WHERE id=ANY($1::uuid[])",[programIds]);
  await db.query("UPDATE hs_onboarding.schools SET deleted_at=now() WHERE id=$1",[id]);
  await db.query("INSERT INTO hs_onboarding.audit(auth_id,event,target_id) VALUES($1,'school_deleted',$2)",[actor.authId,id]);
  return {saved:true};
}
