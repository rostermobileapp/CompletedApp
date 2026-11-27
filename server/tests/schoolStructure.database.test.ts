import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { SchoolLeagueManagement } from "../schoolLeagueManagement";
import { registerSchoolLeagueManagement } from "../schoolLeagueManagementHttp";
import { OnboardingError } from "../highSchoolOnboarding";
import { readParentChildMessages, writeParentChildMessage } from "../highSchoolParentChildChat";

test("school editing and confirmed linked deletion enforce authority and preserve child identities",async t=>{
  const f=await createStaffFixture(),{pool,ids,actors:a}=f,service=new SchoolLeagueManagement(pool);
  let server:ReturnType<express.Express["listen"]>|undefined;
  const deny=(work:Promise<unknown>,code:string)=>assert.rejects(work,(e:any)=>e.code===code);
  const body=(preview:any)=>({expectedName:preview.school.name,expectedTown:preview.school.town,
    programIds:preview.programIds,teamIds:preview.teamIds,confirmation:preview.school.name});
  try {
    await pool.query("ALTER TABLE public.teams ADD COLUMN league_id varchar");
    await pool.query("INSERT INTO public.leagues(id,name,commissioner_id,league_type) VALUES($1,'Fixture',$2,'high_school')",[ids.league,a.league.authId]);
    await pool.query(await readFile("migrations/0060_school_program_separation.sql","utf8"));
    const migration=await readFile("migrations/0063_school_structure_deletion.sql","utf8");
    await pool.query(migration);await pool.query(migration);
    const schoolId=ids.program;
    const app=express();app.use(express.json());
    registerSchoolLeagueManagement(app,service,async req=>{
      const actor=a[req.get("authorization")||""];if(!actor)throw new OnboardingError("INVALID_SESSION",401);return actor;
    });
    server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server!.once("listening",r));
    const base=`http://127.0.0.1:${(server.address() as any).port}/api/high-school/leagues/${ids.league}/management/schools/${schoolId}`;
    await t.test("real HTTP edit updates school identity without changing programs or teams",async()=>{
      const original=(await service.workspace(a.league,ids.league)).schools.find(s=>s.id===schoolId)!;
      const originalTeams=(await service.workspace(a.league,ids.league)).teams;
      const response=await fetch(base,{method:"POST",headers:{authorization:"league","content-type":"application/json"},
        body:JSON.stringify({name:"Renamed school",town:"New town",expectedName:original.name,expectedTown:original.town})});
      assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");
      const workspace=await service.workspace(a.league,ids.league);
      assert.equal(workspace.schools.find(s=>s.id===schoolId)?.name,"Renamed school");
      assert.deepEqual(workspace.teams,originalTeams);
      await deny(service.updateSchool(a.league,ids.league,schoolId,{name:"Stale",town:"Town",expectedName:original.name,expectedTown:original.town}),
        "SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED");
    });
    await t.test("coaches and other accounts cannot edit or delete the school",async()=>{
      for(const actor of ["head","assistant","outsider"]){
        assert.equal((await fetch(`${base}/deletion-preview`,{headers:{authorization:actor}})).status,403);
        assert.equal((await fetch(`${base}/delete`,{method:"POST",headers:{authorization:actor,"content-type":"application/json"},body:"{}"})).status,403);
      }
    });
    await t.test("a shared school cannot be changed through another league's authority",async()=>{
      const foreignLeague=randomUUID(),foreignProgram=randomUUID();
      await pool.query("INSERT INTO public.leagues VALUES($1,'Foreign',$2,'youth')",[foreignLeague,a.outsider.authId]);
      await pool.query("INSERT INTO hs_onboarding.leagues VALUES($1,'Foreign')",[foreignLeague]);
      await pool.query(`INSERT INTO hs_onboarding.programs(id,league_id,school_id,name,town,status,requested_by)
        VALUES($1,$2,$3,'Foreign program','Town','approved',$4)`,[foreignProgram,foreignLeague,schoolId,a.outsider.authId]);
      const row=(await service.workspace(a.league,ids.league)).schools.find(s=>s.id===schoolId)!;
      assert.equal(row.canDelete,false);assert.equal(row.canEdit,false);
      await deny(service.schoolDeletionPreview(a.league,ids.league,schoolId),"SCHOOL_SHARED_WITH_OTHER_LEAGUES");
      await pool.query("DELETE FROM hs_onboarding.programs WHERE id=$1",[foreignProgram]);
    });
    await t.test("preview covers every linked team and stale tree changes require renewed confirmation",async()=>{
      const response=await fetch(`${base}/deletion-preview`,{headers:{authorization:"league"}});
      assert.equal(response.status,200);
      const preview=await response.json() as any;
      assert.equal(preview.programCount,1);assert.equal(preview.teamCount,2);
      await deny(service.deleteSchool(a.league,ids.league,schoolId,{...body(preview),confirmation:"wrong"}),"SCHOOL_DELETE_CONFIRMATION_REQUIRED");
      const added=await service.team(a.league,ids.league,{programId:ids.program,name:"Additional team"});
      await deny(service.deleteSchool(a.league,ids.league,schoolId,body(preview)),"SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED");
      assert.ok((await service.workspace(a.league,ids.league)).teams.some(team=>team.id===added.id));
    });
    await t.test("an inconsistent Adult team anchor cannot be deleted through school controls",async()=>{
      await pool.query("UPDATE public.teams SET program_type='adult' WHERE id=$1",[ids.varsity]);
      try {
        await deny(service.schoolDeletionPreview(a.league,ids.league,schoolId),"SCHOOL_STRUCTURE_CHANGED_REFRESH_REQUIRED");
      } finally {await pool.query("UPDATE public.teams SET program_type='high_school' WHERE id=$1",[ids.varsity]);}
    });
    await t.test("deletion removes active organization access but retains child, consent, device and private chat data",async()=>{
      await pool.query(await readFile("scripts/production/high-school-parent-child-chat.sql","utf8"));
      await writeParentChildMessage(pool,ids.child1,a.parent.authId,"parent",{body:"Private family message",requestId:randomUUID()});
      const codeId=randomUUID(),requestId=randomUUID();
      await pool.query(`INSERT INTO hs_onboarding.device_codes(id,child_id,parent_auth_id,code_digest,expires_at)
        VALUES($1,$2,$3,'synthetic-code',now()+interval '1 day')`,[codeId,ids.child1,a.parent.authId]);
      await pool.query(`INSERT INTO hs_onboarding.device_requests(id,code_id,child_id,parent_auth_id,token_digest,device_label,status,expires_at)
        VALUES($1,$2,$3,$4,'synthetic-request','Fixture phone','redeemed',now()+interval '1 day')`,[requestId,codeId,ids.child1,a.parent.authId]);
      await pool.query(`INSERT INTO hs_onboarding.child_sessions(token_digest,child_id,request_id,parent_auth_id,approved_session_id,expires_at)
        VALUES('synthetic-child-session',$1,$2,$3,$4,now()+interval '30 days')`,[ids.child1,requestId,a.parent.authId,a.parent.sessionId]);
      const preserved=async()=> (await pool.query(`SELECT
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM hs_onboarding.children c) AS children,
        (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.token_digest) FROM hs_onboarding.child_sessions s) AS sessions,
        (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.users u) AS accounts,
        (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM hs_onboarding.player_requests r WHERE status='approved') AS consent`)).rows[0];
      const before=await preserved(),preview=await service.schoolDeletionPreview(a.league,ids.league,schoolId);
      const response=await fetch(`${base}/delete`,{method:"POST",headers:{authorization:"league","content-type":"application/json"},body:JSON.stringify(body(preview))});
      assert.equal(response.status,200);
      assert.deepEqual(await preserved(),before);
      const current=await service.workspace(a.league,ids.league);
      assert.ok(!current.schools.some(s=>s.id===schoolId));
      assert.ok(!current.programs.some(p=>p.id===ids.program));
      assert.ok(!current.teams.some(team=>preview.teamIds.includes(team.id)));
      assert.equal((await pool.query("SELECT count(*)::int n FROM public.team_memberships WHERE team_id=ANY($1::text[])",[preview.teamIds])).rows[0].n,0);
      assert.equal((await pool.query("SELECT count(*)::int n FROM public.teams WHERE league_id=$1",[ids.league])).rows[0].n,0);
      await deny(f.staff.workspace(a.head,ids.varsity),"STAFF_TEAM_FORBIDDEN");
      assert.equal((await readParentChildMessages(pool,ids.child1,a.parent.authId,"parent")).messages[0].body,"Private family message");
      await writeParentChildMessage(pool,ids.child1,a.parent.authId,"child",{body:"Still connected",requestId:randomUUID()});
      assert.equal((await readParentChildMessages(pool,ids.child1,a.parent.authId,"parent")).messages.length,2);
      await deny(service.schoolDeletionPreview(a.league,ids.league,schoolId),"SCHOOL_EDIT_FORBIDDEN");
    });
    await t.test("empty school deletion works without any dependent program or team",async()=>{
      const school=await service.school(a.league,ids.league,{name:"Empty school",town:"Town"});
      const preview=await service.schoolDeletionPreview(a.league,ids.league,school.id);
      assert.equal(preview.programCount,0);assert.equal(preview.teamCount,0);
      await service.deleteSchool(a.league,ids.league,school.id,body(preview));
      assert.ok(!(await service.workspace(a.league,ids.league)).schools.some(s=>s.id===school.id));
    });
  } finally {if(server)await new Promise<void>(r=>server!.close(()=>r()));await f.close();}
});
