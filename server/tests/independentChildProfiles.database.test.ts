import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { HighSchoolFamilySetup, HighSchoolFamilyReview } from "../highSchoolFamilySetup";
import { HighSchoolChildDevices } from "../highSchoolChildDevices";
import { parentDigest, type HighSchoolParentSecurity } from "../highSchoolParentSecurity";
import { HS_CONSENT_VERSION, hsPlayerDraft } from "../../shared/highSchoolOnboarding";

test("a consented child pairs before a team and the same phone receives a later approved invitation", async t => {
  const f=await createStaffFixture(),{pool,actors,ids}=f;
  const actor={...actors.applicant,productionTest:true};
  let verified=true,covered=false;
  const parent={authorized:async()=>verified,enrolled:async()=>true} as unknown as HighSchoolParentSecurity;
  const family=new HighSchoolFamilySetup(pool,parent,async()=>covered?"personal":"uncovered",true);
  const devices=new HighSchoolChildDevices(pool,parent,true,{production:true,coverage:async()=>covered});
  const review=new HighSchoolFamilyReview(pool,undefined,undefined,true);
  const child={id:randomUUID(),firstName:"Casey",lastName:"Fixture",birthYear:2012,
    position:"F" as const,jerseyNumber:"8",consent:true as const,consentVersion:HS_CONSENT_VERSION,
    photoConsent:false,publicNameConsent:false};
  let token="",deviceId="";
  try {
    await pool.query(`ALTER TABLE public.users ADD COLUMN onboarding_completed boolean DEFAULT false,
      ADD COLUMN date_of_birth varchar,ADD COLUMN IF NOT EXISTS display_id text,ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE auth.users ADD COLUMN deleted_at timestamptz;
      ALTER TABLE hs_parent_security.accounts ADD COLUMN activated_at timestamptz DEFAULT now();
      CREATE TABLE public.account_user_merges(source_user_id text);
      CREATE TABLE hs_parent_security.challenges(auth_id uuid,consumed boolean DEFAULT false);
      CREATE TABLE hs_parent_security.grants(auth_id uuid,consumed boolean DEFAULT false);
      CREATE TABLE hs_parent_security.live_version(version integer);
      CREATE TABLE hs_onboarding.production_test_version(version integer);
      CREATE UNIQUE INDEX hs_chat_family ON hs_onboarding.child_chats(parent_auth_id) WHERE kind='family';
      CREATE FUNCTION hs_onboarding.production_child_parent_allowed(parent_id uuid) RETURNS boolean
        LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.users WHERE id=parent_id::text AND display_id='U00001') $$;
      ALTER TABLE hs_onboarding.children ADD CONSTRAINT children_enabled_test_parent
        CHECK(NOT enabled OR hs_onboarding.production_child_parent_allowed(parent_auth_id));`);
    await pool.query("UPDATE public.users SET display_id='U00001',date_of_birth='1990-01-01',onboarding_completed=true WHERE id=$1",[actor.authId]);
    const db=await pool.connect();
    try{
      await db.query("SELECT set_config('roster.hs_family_dev','family-setup',false)");
      await db.query(await readFile("scripts/dev-only/high-school-family-setup.sql","utf8"));
      await db.query("SELECT set_config('roster.independent_children','owner-authorized',false)");
      const migration=await readFile("scripts/production/high-school-independent-children.sql","utf8");
      await db.query(migration.replace("-- CHILD_PROFILE_MANIFEST","INSERT INTO hs_onboarding.independent_child_version VALUES(1,repeat('a',64));"));
      await db.query(await readFile("scripts/production/high-school-parent-child-chat.sql","utf8"));
      await db.query("COMMIT");
    }finally{db.release();}
    const original=(await pool.query("SELECT * FROM public.users WHERE id=$1",[actor.authId])).rows[0];
    await family.begin(actor);
    await t.test("birth year is validated, required for new profiles and never expanded to a birthday",async()=>{
      assert.equal(hsPlayerDraft.safeParse({...child,birthYear:new Date().getFullYear()+1}).success,false);
      assert.equal(hsPlayerDraft.safeParse({...child,birthYear:2012.5}).success,false);
      const {birthYear,...missing}=child;
      await assert.rejects(()=>family.consent(actor,{revision:0,guardianConfirmed:true,players:[missing]}),(e:any)=>e.code==="BIRTH_YEAR_REQUIRED");
      assert.equal((await pool.query("SELECT 1 FROM hs_onboarding.children WHERE id=$1",[child.id])).rows.length,0);
    });
    await t.test("explicit consent creates a private profile without any team or billing change",async()=>{
      await family.consent(actor,{revision:0,guardianConfirmed:true,players:[child]});
      const row=(await pool.query("SELECT * FROM hs_onboarding.children WHERE id=$1",[child.id])).rows[0];
      assert.equal(row.player_request_id,null);assert.equal(row.enabled,false);
      assert.equal(row.profile_details.birthYear,2012);
      assert.equal("gradYear" in row.profile_details,false);
      assert.equal("dateOfBirth" in row.profile_details,false);
      const list=await devices.children(actor);
      assert.equal(list.children.find((c:any)=>c.id===child.id)?.canActivate,true);
      assert.equal((await pool.query("SELECT 1 FROM public.team_memberships WHERE child_profile_id=$1",[child.id])).rows.length,0);
      assert.deepEqual((await pool.query("SELECT * FROM public.users WHERE id=$1",[actor.authId])).rows[0],original);
    });
    await t.test("parent approval pairs the phone before membership or coverage exists",async()=>{
      const code=await devices.createCode(actor,{childId:child.id});
      const pending=await devices.start({code:code.code},"fixture-source");
      deviceId=pending.requestId!;
      await devices.decision(actor,deviceId,{approve:true});
      const approved=await devices.poll({requestId:deviceId,requestToken:pending.requestToken});
      token=approved.sessionToken!;
      const data=await devices.ownSession(token);
      assert.equal(data.teamStatus,"awaiting_team");assert.deepEqual(data.schedule,[]);
      assert.equal(data.chats.length,1);assert.equal(data.chats[0].kind,"family");
      assert.equal(data.chats[0].id,child.id);
      assert.equal((await devices.parentChats(actor)).threads[0].id,child.id);
      await devices.sendParentMessage(actor,child.id,{body:"Ready before a team is connected"});
      assert.equal((await devices.messages(token,child.id)).messages[0].body,"Ready before a team is connected");
      await devices.sendMessage(token,child.id,{body:"I can reply without team coverage"});
      assert.equal((await devices.parentMessages(actor,child.id)).messages.length,2);
      await assert.rejects(()=>devices.start({code:code.code},"second-fixture-source"),(e:any)=>e.code==="INVALID_OR_EXPIRED_CODE");
      await assert.rejects(()=>devices.createCode({...actors.otherParent,productionTest:true},{childId:child.id}));
      verified=false;await assert.rejects(()=>devices.createCode(actor,{childId:child.id}));verified=true;
    });
    await t.test("household limits include independent profiles, not only team requests",async()=>{
      const second={...child,id:randomUUID(),firstName:"Jamie"};
      await family.consent(actor,{revision:1,guardianConfirmed:true,players:[child,second]});
      const third={...child,id:randomUUID(),firstName:"Alex"};
      await assert.rejects(()=>family.consent(actor,{revision:2,guardianConfirmed:true,players:[third]}),(e:any)=>e.code==="HOUSEHOLD_LIMIT");
    });
    await t.test("a missing graduation year never merges two same-name invitation entries",async()=>{
      const stagedIds=[randomUUID(),randomUUID()],ambiguousInvitation=randomBytes(32).toString("base64url");
      for(const [index,id] of stagedIds.entries()){
        await pool.query(`INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position,jersey_number)
          VALUES($1,$2,$3,'Casey','Fixture',$4,'F','8')`,[id,ids.varsity,`ambiguous-${index}`,2030+index]);
      }
      await pool.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staged_ids,created_by)
        VALUES($1,$2,'parent',$3,$4,$5)`,[parentDigest(ambiguousInvitation),ids.varsity,actor.email,stagedIds,actors.head.authId]);
      const before=await family.state(actor);
      await assert.rejects(()=>family.intake.lookup(actor,ambiguousInvitation,before.revision),(e:any)=>e.code==="CHILD_IDENTITY_MISMATCH");
      const after=await family.state(actor);
      assert.deepEqual(after.players,before.players);assert.equal(after.revision,before.revision);
      assert.equal((await devices.ownSession(token)).child.firstName,child.firstName);
    });
    const stagedId=randomUUID(),invitation=randomBytes(32).toString("base64url");
    await pool.query(`INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position,jersey_number)
      VALUES($1,$2,'independent-fixture','Casey','Fixture',2030,'F','8')`,[stagedId,ids.varsity]);
    await pool.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staged_ids,created_by)
      VALUES($1,$2,'parent',$3,$4,$5)`,[parentDigest(invitation),ids.varsity,actor.email,[stagedId],actors.head.authId]);
    await t.test("matching a parent invitation preserves the existing child identity and phone session",async()=>{
      await family.intake.lookup(actor,invitation,2);
      const state=await family.state(actor);
      assert.equal(state.players[0].id,child.id);assert.equal(state.players[0].birthYear,2012);
      assert.equal(state.players[0].gradYear,2030);
      assert.equal(state.players[0].consent,false);
      await family.consent(actor,{revision:state.revision,guardianConfirmed:true,players:[{...state.players[0],consent:true}]});
      const consented=await family.state(actor);
      await family.intake.join(actor,{revision:consented.revision,invitation});
      assert.equal((await devices.ownSession(token)).teamStatus,"awaiting_team");
      const request=(await pool.query("SELECT * FROM hs_onboarding.player_requests WHERE auth_id=$1",[actor.authId])).rows[0];
      assert.equal(request.player_key,child.id);assert.equal(request.staged_id,stagedId);
      await review.decide(actors.head,ids.varsity,request.id,{approve:true});
      const linked=(await pool.query("SELECT * FROM hs_onboarding.children WHERE id=$1",[child.id])).rows[0];
      assert.equal(linked.player_request_id,request.id);assert.equal(linked.enabled,true);
      assert.equal((await devices.ownSession(token)).teamStatus,"coverage_pending");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children WHERE parent_auth_id=$1",[actor.authId])).rows[0].n,2);
    });
    await t.test("the original session receives only approved covered team data and loses it when access ends",async()=>{
      covered=true;
      await pool.query(`INSERT INTO hs_onboarding.staff_events(id,team_id,title,starts_at)
        VALUES($1,$2,'Approved practice',now()+interval '1 day'),($3,$4,'Other household game',now()+interval '1 day')`,
      [randomUUID(),ids.varsity,randomUUID(),ids.jv]);
      let data=await devices.ownSession(token);
      assert.equal(data.teamStatus,"connected");assert.equal(data.schedule.length,1);
      assert.equal(data.schedule[0].title,"Approved practice");
      assert.equal(data.schedule[0].teamId,ids.varsity);
      assert.equal(data.schedule[0].status,"scheduled");
      assert.equal(data.schedule.some((event:any)=>event.teamId===ids.jv),false);
      assert.equal(data.chats.filter((c:any)=>c.kind==="team").length,1);
      const teamChat=data.chats.find((c:any)=>c.kind==="team")!.id;
      covered=false;data=await devices.ownSession(token);
      assert.equal(data.teamStatus,"coverage_pending");assert.deepEqual(data.schedule,[]);
      assert.ok(!data.chats.some((c:any)=>c.id===teamChat));
      await assert.rejects(()=>devices.messages(token,teamChat),(e:any)=>e.code==="CHILD_CHAT_FORBIDDEN");
      covered=true;
      await pool.query("UPDATE public.team_memberships SET status='pending' WHERE child_profile_id=$1",[child.id]);
      data=await devices.ownSession(token);assert.equal(data.teamStatus,"awaiting_team");assert.deepEqual(data.schedule,[]);
      await devices.revokeSession(actor,child.id,deviceId);
      await assert.rejects(()=>devices.ownSession(token),(e:any)=>e.code==="INVALID_CHILD_SESSION");
    });
    await t.test("migration keeps browser access denied and rejects missing consent metadata",async()=>{
      const permissions=(await pool.query(`SELECT
        has_table_privilege('authenticated','hs_onboarding.independent_child_version','SELECT') AS marker,
        has_table_privilege('anon','hs_onboarding.children','SELECT') AS children`)).rows[0];
      assert.equal(permissions.marker,false);assert.equal(permissions.children,false);
      await assert.rejects(()=>pool.query(`INSERT INTO hs_onboarding.children(id,parent_auth_id,first_name,last_name,profile_details)
        VALUES($1,$2,'No','Consent','{}')`,[randomUUID(),actor.authId]),(e:any)=>e.code==="23514");
    });
  }finally{await f.close();}
});
