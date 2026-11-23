/**
 * Approved DEV-only fixture verification. No outgoing email/push or purchases.
 * Uses only marked synthetic accounts and private onboarding records.
 */
import assert from "node:assert/strict";
import { randomBytes,randomUUID } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import express from "express";
import type { Server } from "node:http";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";
import { HighSchoolParentSecurity,parentDigest,ParentSecurityError } from "../server/highSchoolParentSecurity";
import { parentActorFromVerifiedToken,registerParentVerificationRoutes,requireDevParentAuthority,parentErrorResponse } from "../server/highSchoolParentHttp";
import { HighSchoolOnboarding } from "../server/highSchoolOnboarding";
import { registerHighSchoolOnboarding,HS_ONBOARDING_API as API } from "../server/highSchoolOnboardingHttp";
import { HS_CONSENT_VERSION } from "../shared/highSchoolOnboarding";

// The old combined onboarding UI was retired. Reject its former switch before
// connecting to DEV services rather than silently claiming browser coverage.
if(process.argv.includes("--browser")){
  throw new Error("The legacy onboarding browser harness was retired. Run scripts/verify-high-school-youth-preview.ts and scripts/verify-high-school-onboarding-router.ts for current UI coverage; run this script without --browser for service checks.");
}

const report:Record<string,any>={scope:"Separate DEV only; synthetic fixture accounts",checks:[],outcome:"not_finished",realMailSent:false};
const check=(name:string)=>report.checks.push({name,passed:true});
let pool:Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"]|undefined,server:Server|undefined;
let base:string,admin:string,anon:string;
const marker=randomUUID(),fixtures:string[]=[],fixtureEmails:string[]=[],programs:string[]=[],teams:string[]=[],leagues:string[]=[];
type Fixture={id:string;email:string;token:string};
const mailbox:{to:string;code:string}[]=[];
async function auth(path:string,method:string,body?:object,token?:string){
  const key=path.startsWith("admin/")?admin:anon;
  const response=await fetch(`${base}/auth/v1/${path}`,{method,redirect:"error",signal:AbortSignal.timeout(20000),
    headers:{apikey:key,Authorization:`Bearer ${token??key}`,"Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json() as any};
}
try{
  const connection=await parentDevelopmentConnection();pool=connection.pool;
  base=connection.origin;admin=connection.env.DEV_SUPABASE_SERVICE_ROLE_KEY!;anon=connection.env.DEV_SUPABASE_ANON_KEY!;
  const db=pool;
  assert.equal((await db.query("SELECT version FROM hs_onboarding.version")).rows[0].version,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM hs_onboarding.flows")).rows[0].n,0,"Run only in an empty synthetic onboarding environment.");
  check("separate_dev_target_and_private_install_verified");
  const password=`HsOnboarding1!${randomBytes(20).toString("hex")}`;
  async function create(label:string,fixture=true):Promise<Fixture>{
    const email=`hs-onboard-${marker}-${label}@example.com`;
    const made=await auth("admin/users","POST",{email,password,email_confirm:true,
      app_metadata:{synthetic_high_school_onboarding_cleanup:marker,...fixture?{synthetic_high_school_onboarding_dev:marker}:{}}});
    assert.ok([200,201].includes(made.status));fixtures.push(made.body.id);fixtureEmails.push(email);
    const login=await auth("token?grant_type=password","POST",{email,password});assert.equal(login.status,200);
    return {id:made.body.id,email,token:login.body.access_token};
  }
  const head=await create("head"),assistant=await create("assistant"),ad=await create("ad"),manager=await create("manager"),
    adminActor=await create("league-admin"),parent1=await create("parent1"),parent2=await create("parent2"),
    returning=await create("returning"),unmarked=await create("unmarked",false),invitedStaff=await create("invited-staff");
  const parent=new HighSchoolParentSecurity(db,async mail=>{mailbox.push({to:mail.to,code:mail.code});});
  const onboarding=new HighSchoolOnboarding(db,parent);
  const app=express();app.use(express.json({limit:"64kb"}));
  const authenticate=async(req:express.Request)=>{
    const token=req.get("authorization")?.replace(/^Bearer /,"")??"";
    const user=await auth("user","GET",undefined,token);
    if(user.status!==200)throw new ParentSecurityError("INVALID_SESSION",401);
    return {...parentActorFromVerifiedToken(token,user.body.id,`${base}/auth/v1`),email:user.body.email,
      emailVerified:!!user.body.email_confirmed_at,fixture:!!user.body.app_metadata?.synthetic_high_school_onboarding_dev};
  };
  // Use production handlers; sanitize all errors and never log request/response bodies.
  registerHighSchoolOnboarding(app,onboarding,parent,authenticate);
  registerParentVerificationRoutes(app,parent,authenticate);
  app.get("/api/legacy-adult-fixture",async(req,res)=>{
    try{
      const actor=await authenticate(req);
      if(await onboarding.blocksLegacy(actor.authId,actor.email,actor.emailVerified))return res.status(403).json({code:"HS_ONBOARDING_PENDING"});
      await requireDevParentAuthority(parent,actor.authId,req.get("authorization")!.slice(7),`${base}/auth/v1`,req.get("x-parent-verification"));
      res.json({allowed:true});
    }catch(e){parentErrorResponse(res,e);}
  });
  await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});
  const local=`http://127.0.0.1:${(server!.address() as any).port}`;
  async function request(actor:Fixture|undefined,path:string,body?:unknown,grant?:string){
    const result=await fetch(`${local}${path}`,{method:body===undefined?"GET":"POST",signal:AbortSignal.timeout(20000),
      headers:{"Content-Type":"application/json",...(actor?{Authorization:`Bearer ${actor.token}`}:{ }),...(grant?{"x-parent-verification":grant}:{})},
      ...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:result.status,body:await result.json() as any,cache:result.headers.get("cache-control")};
  }
  async function state(actor:Fixture,grant?:string){const r=await request(actor,`${API}/state`,undefined,grant);assert.equal(r.status,200);return r.body;}
  async function choose(actor:Fixture,path:string){const r=await request(actor,`${API}/choose`,{path,adultConfirmed:true});assert.equal(r.status,200);return state(actor);}
  async function unlock(actor:Fixture){
    const challenge=await request(actor,"/api/high-school/parent-verification/challenge",{purpose:"parent_action"});assert.equal(challenge.status,200);
    assert.equal(mailbox.at(-1)!.to,actor.email);
    const approval=await request(actor,"/api/high-school/parent-verification/verify",{challengeId:challenge.body.challengeId,code:mailbox.at(-1)!.code});
    assert.equal(approval.status,200);return approval.body.verificationToken as string;
  }
  assert.equal((await request(undefined,`${API}/state`)).status,401);
  assert.equal((await request(head,`${API}/choose`,{path:"staff",adultConfirmed:false})).status,400);
  assert.equal((await request(unmarked,`${API}/choose`,{path:"parent",adultConfirmed:true})).status,403);
  assert.equal((await request(head,"/api/legacy-adult-fixture")).status,403);
  await choose(unmarked,"player");
  assert.equal((await request(unmarked,"/api/legacy-adult-fixture")).status,200);
  check("unauthenticated_underage_and_unmarked_hs_requests_fail_without_enrollment");
  // Existing adult behavior is measured on this run's synthetic returning adult only.
  const migratedAdultId=randomUUID();
  await db.query("INSERT INTO users(id,email,first_name,last_name,onboarding_completed) VALUES($1,$2,'Synthetic','Returning',true)",[migratedAdultId,returning.email]);
  assert.equal((await state(returning)).active,false);
  assert.equal((await request(returning,`${API}/choose`,{path:"parent",adultConfirmed:true})).status,409);
  await choose(returning,"staff");
  assert.equal((await request(returning,"/api/legacy-adult-fixture")).status,200);
  assert.equal((await state(returning)).active,false);
  check("returning_adult_access_survives_staff_intake_and_family_context_is_not_silently_changed");
  await choose(head,"staff");await choose(assistant,"staff");await choose(ad,"staff");await choose(manager,"staff");
  assert.equal((await request(head,"/api/legacy-adult-fixture")).status,403);
  const league=randomUUID();leagues.push(league);
  await db.query("INSERT INTO hs_onboarding.leagues VALUES($1,'Synthetic DEV League')",[league]);
  await db.query("INSERT INTO hs_onboarding.league_approvers VALUES($1,$2)",[league,adminActor.id]);
  const forbiddenSchool=await request(assistant,`${API}/draft`,{kind:"staff",revision:0,role:"assistant_coach",newSchool:{leagueId:league,name:"Synthetic School",town:"Fixture Town"}});
  assert.equal(forbiddenSchool.status,403);
  assert.equal((await request(head,`${API}/draft`,{kind:"staff",revision:0,role:"head_coach",newSchool:{leagueId:league,name:`Synthetic School ${marker}`,town:"Fixture Town"}})).status,200);
  const waiting=await state(head);assert.equal(waiting.status,"waiting_approval");programs.push(waiting.draft.programId);
  assert.equal((await request(head,`${API}/decision`,{id:waiting.draft.requestId,approve:true})).status,403);
  assert.equal((await request(assistant,`${API}/decision`,{id:waiting.draft.requestId,approve:true})).status,403);
  assert.equal((await request(adminActor,`${API}/approvals`)).body.length,1);
  assert.equal((await request(adminActor,`${API}/decision`,{id:waiting.draft.requestId,approve:true})).status,200);
  assert.equal((await state(head)).status,"team_setup_pending");
  assert.equal((await request(head,"/api/legacy-adult-fixture")).status,403);
  check("only_head_or_ad_can_request_school_and_initial_authority_needs_league_approval_without_roster_access");
  const team=randomUUID(),otherTeam=randomUUID();teams.push(team,otherTeam);
  // Private test provisioner, not a public creation path. This phase never
  // claims that approval creates the missing protected chats or active team.
  await db.query("INSERT INTO hs_onboarding.teams VALUES($1,$2,'Synthetic Varsity',$3),($4,$2,'Synthetic JV',$5)",[team,programs[0],parentDigest("DEV-TEAM"),otherTeam,parentDigest("DEV-JV")]);
  await db.query("UPDATE hs_onboarding.staff_requests SET team_id=$2 WHERE id=$1",[waiting.draft.requestId,team]);
  await db.query("UPDATE hs_onboarding.flows SET status='coverage_pending' WHERE auth_id=$1",[head.id]);
  for(const [actor,role,teamId] of [[assistant,"assistant_coach",team],[ad,"athletic_director",team],[manager,"team_manager",otherTeam]] as const){
    assert.equal((await request(actor,`${API}/draft`,{kind:"staff",revision:0,role,programId:programs[0],teamId})).status,200);
  }
  const ar=await state(assistant),dr=await state(ad),mr=await state(manager);
  assert.equal((await request(head,`${API}/decision`,{id:dr.draft.requestId,approve:true})).status,403);
  assert.equal((await request(head,`${API}/decision`,{id:mr.draft.requestId,approve:true})).status,403);
  assert.equal((await request(head,`${API}/decision`,{id:ar.draft.requestId,approve:true})).status,200);
  assert.equal((await request(adminActor,`${API}/decision`,{id:dr.draft.requestId,approve:true})).status,200);
  assert.equal((await request(ad,`${API}/decision`,{id:mr.draft.requestId,approve:true})).status,200);
  assert.equal((await request(head,`${API}/decision`,{id:ar.draft.requestId,approve:true})).status,409);
  check("staff_approval_hierarchy_team_scope_self_approval_and_duplicate_decisions_are_enforced");
  await choose(invitedStaff,"staff");
  const staffInvitation=randomBytes(32).toString("base64url"),overpoweredInvitation=randomBytes(32).toString("base64url");
  await db.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staff_role,created_by)
    VALUES($1,$2,'staff',$3,'assistant_coach',$4),($5,$2,'staff',$3,'head_coach',$4)`,
    [parentDigest(staffInvitation),team,invitedStaff.email,head.id,parentDigest(overpoweredInvitation)]);
  assert.equal((await request(invitedStaff,`${API}/lookup`,{invitation:overpoweredInvitation,revision:0})).status,403);
  assert.equal((await request(invitedStaff,`${API}/lookup`,{invitation:staffInvitation,revision:0,role:"athletic_director"})).status,200);
  const invited=await state(invitedStaff);
  assert.equal(invited.status,"waiting_approval");assert.equal(invited.draft.role,"assistant_coach");assert.equal(invited.draft.teamId,team);
  check("staff_invitation_skips_search_without_self_approval_or_client_selected_role_escalation");
  await choose(parent1,"parent");await choose(parent2,"parent");
  assert.equal((await state(parent1)).status,"parent_verification_required");
  assert.equal((await state(parent1)).draft,undefined);
  const grant1=await unlock(parent1),grant2=await unlock(parent2);
  const kid=(firstName="Synthetic")=>({id:randomUUID(),firstName,lastName:"Player",gradYear:2029,position:"F",jerseyNumber:"",
    consent:true,consentVersion:HS_CONSENT_VERSION,photoConsent:false,publicNameConsent:false});
  const child=kid();
  const parentDraft={kind:"parent",revision:0,guardianConfirmed:true,players:[child]};
  assert.equal((await request(parent1,`${API}/draft`,parentDraft)).status,403);
  assert.equal((await request(parent2,`${API}/draft`,parentDraft,grant1)).status,403);
  assert.equal((await request(parent1,`${API}/draft`,{...parentDraft,players:[{...child,consent:false}]},grant1)).status,400);
  assert.equal((await request(parent1,`${API}/draft`,{...parentDraft,players:[{...child,dateOfBirth:"2008-01-01"}]},grant1)).status,400);
  assert.equal((await request(parent1,`${API}/draft`,{...parentDraft,players:Array.from({length:5},(_,i)=>kid(`Synthetic ${i}`))},grant1)).status,400);
  assert.equal((await request(parent1,`${API}/draft`,{...parentDraft,players:[child,child]},grant1)).status,400);
  check("parent_intake_requires_email_grant_consent_minimal_fields_and_server_enforced_four_player_limit");
  const staged=randomUUID();const invitation=randomBytes(32).toString("base64url");
  await db.query("INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position) VALUES($1,$2,$3,'Imported','Fixture',2029,'D')",[staged,team,marker]);
  await db.query("INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staged_ids,created_by) VALUES($1,$2,'parent',$3,$4,$5)",[parentDigest(invitation),team,parent1.email,[staged],head.id]);
  assert.equal((await request(parent2,`${API}/lookup`,{invitation,revision:0},grant2)).status,403);
  await db.query("UPDATE hs_onboarding.staged_players SET expires_at=now()-interval '1 second' WHERE id=$1",[staged]);
  assert.equal((await request(parent1,`${API}/lookup`,{invitation,revision:0},grant1)).status,403);
  await db.query("UPDATE hs_onboarding.staged_players SET expires_at=now()+interval '1 day' WHERE id=$1",[staged]);
  await db.query("UPDATE hs_onboarding.staff_requests SET status='denied' WHERE id=$1",[waiting.draft.requestId]);
  assert.equal((await request(parent1,`${API}/lookup`,{invitation,revision:0},grant1)).status,403);
  await db.query("UPDATE hs_onboarding.staff_requests SET status='approved' WHERE id=$1",[waiting.draft.requestId]);
  check("expired_staging_and_revoked_invitation_creator_authority_fail_closed");
  assert.equal((await request(parent1,`${API}/lookup`,{invitation,revision:0},grant1)).status,200);
  const imported=await state(parent1,grant1);assert.equal(imported.draft.players[0].id,staged);
  assert.equal(imported.draft.invitationDigest,undefined);
  const consented=imported.draft.players.map((p:any)=>({...p,consent:true}));
  assert.equal((await request(parent1,`${API}/draft`,{...parentDraft,revision:imported.revision,players:[{...consented[0],firstName:"Tampered"}]},grant1)).status,400);
  assert.equal((await request(parent1,`${API}/draft`,{...parentDraft,revision:imported.revision,players:consented},grant1)).status,200);
  assert.equal((await request(parent1,`${API}/draft`,{...parentDraft,revision:imported.revision,players:consented},grant1)).status,409);
  const ready=await state(parent1,grant1);
  assert.equal(ready.draft.consentRecords[0].playerId,staged);
  assert.equal(ready.draft.consentRecords[0].version,HS_CONSENT_VERSION);
  assert.equal((await request(parent1,`${API}/join`,{revision:ready.revision,invitation},grant1)).status,200);
  assert.equal((await state(parent1,grant1)).status,"coverage_pending");
  assert.equal((await request(parent1,`${API}/join`,{revision:ready.revision,invitation},grant1)).status,409);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM hs_onboarding.player_requests WHERE staged_id=$1",[staged])).rows[0].n,1);
  assert.equal((await db.query("SELECT consented_at FROM hs_onboarding.player_requests WHERE staged_id=$1",[staged])).rows[0].consented_at.toISOString(),ready.draft.consentRecords[0].recordedAt);
  const invitation2=randomBytes(32).toString("base64url");
  await db.query("INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staged_ids,created_by) VALUES($1,$2,'parent',$3,$4,$5)",[parentDigest(invitation2),team,parent2.email,[staged],head.id]);
  assert.equal((await request(parent2,`${API}/lookup`,{invitation:invitation2,revision:0},grant2)).status,409);
  check("coach_invitation_is_recipient_bound_import_identity_is_immutable_and_claims_do_not_duplicate");
  const manualChild=kid("Manual");
  assert.equal((await request(parent2,`${API}/draft`,{...parentDraft,players:[manualChild]},grant2)).status,200);
  const manual=await state(parent2,grant2);
  assert.equal((await request(parent2,`${API}/join`,{revision:manual.revision,teamCode:"DEV-TEAM"},grant2)).status,200);
  assert.equal((await state(parent2,grant2)).status,"waiting_staff_review");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM hs_onboarding.player_requests WHERE auth_id=$1 AND status='pending_staff'",[parent2.id])).rows[0].n,1);
  check("manual_entry_resumes_privately_and_stops_for_staff_review_without_entitlement_or_child_activation");
  const expired=randomBytes(32).toString("base64url");
  await db.query("INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staff_role,created_by,expires_at) VALUES($1,$2,'staff',$3,'assistant_coach',$4,now()-interval '1 second')",[parentDigest(expired),team,returning.email,head.id]);
  assert.equal((await request(returning,`${API}/lookup`,{invitation:expired,revision:0})).status,403);
  check("expired_invitations_fail_closed_and_private_parent_state_never_leaks_without_verification");
  report.outcome="guarded_dev_onboarding_verified_no_activation";
}catch(e:any){
  report.outcome="verification_incomplete";report.failedAfter=report.checks.at(-1)?.name??"isolation";
  report.safeFailureKind=e?.code==="ERR_ASSERTION"?"AssertionError":e?.name==="TimeoutError"?"TimeoutError":"SafeFailure";
  process.exitCode=1;
}finally{
  await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());
  try{
    if(pool){
      for(const id of fixtures){
        const user=await auth(`admin/users/${id}`,"GET");assert.equal(user.body.app_metadata?.synthetic_high_school_onboarding_cleanup,marker);
      }
      // Dependency order; every delete is scoped to this run's exact IDs.
      await pool.query("DELETE FROM hs_onboarding.player_requests WHERE auth_id=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM hs_onboarding.invitations WHERE team_id=ANY($1::uuid[])",[teams]);
      await pool.query("DELETE FROM hs_onboarding.staged_players WHERE team_id=ANY($1::uuid[])",[teams]);
      await pool.query("DELETE FROM hs_onboarding.staff_requests WHERE auth_id=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM hs_onboarding.teams WHERE id=ANY($1::uuid[])",[teams]);
      await pool.query("DELETE FROM hs_onboarding.programs WHERE requested_by=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM hs_onboarding.league_approvers WHERE auth_id=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM hs_onboarding.leagues WHERE id=ANY($1::uuid[])",[leagues]);
      await pool.query("DELETE FROM hs_onboarding.audit WHERE auth_id=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM hs_onboarding.flows WHERE auth_id=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM hs_parent_security.accounts WHERE auth_id=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM hs_parent_security.audit WHERE auth_id=ANY($1::uuid[])",[fixtures]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[]) OR email=ANY($2::text[])",[fixtures,fixtureEmails]);
      assert.equal((await pool.query("SELECT 1 FROM users WHERE id=ANY($1::varchar[]) OR email=ANY($2::text[])",[fixtures,fixtureEmails])).rows.length,0);
      for(const id of fixtures){assert.equal((await auth(`admin/users/${id}`,"DELETE")).status,200);assert.equal((await auth(`admin/users/${id}`,"GET")).status,404);}
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.flows")).rows[0].n,0);
      report.cleanupVerified=true;report.syntheticAccountsDeleted=fixtures.length;
      report.enrolledFamilyAccountsRemaining=(await pool.query("SELECT count(*)::int AS n FROM hs_parent_security.accounts")).rows[0].n;
    }
  }catch{report.cleanupVerified=false;report.outcome="dev_fixture_cleanup_incomplete";process.exitCode=1;}
  await pool?.end();
  await mkdir("generated-artifacts/high-school-onboarding",{recursive:true});
  await writeFile("generated-artifacts/high-school-onboarding/result.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
