import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { SchoolLeagueManagement } from "../schoolLeagueManagement";
import { registerSchoolLeagueManagement } from "../schoolLeagueManagementHttp";
import { OnboardingError } from "../highSchoolOnboarding";

test("school league renaming preserves identity and requires actual league ownership", async t => {
  const f=await createStaffFixture(),{pool,ids,actors:a}=f;
  const service=new SchoolLeagueManagement(pool);
  let server:ReturnType<express.Express["listen"]>|undefined;
  try {
    await pool.query("INSERT INTO public.leagues(id,name,commissioner_id,league_type) VALUES($1,'Old league',$2,'high_school')",[ids.league,a.league.authId]);
    const app=express();app.use(express.json());
    registerSchoolLeagueManagement(app,service,async req=>{
      const actor=a[req.get("authorization")||""];
      if(!actor)throw new OnboardingError("INVALID_SESSION",401);
      return actor;
    });
    server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server!.once("listening",r));
    const origin=`http://127.0.0.1:${(server.address() as any).port}`;
    const request=(who:string,body:unknown,id=ids.league)=>fetch(`${origin}/api/high-school/leagues/${id}/management/name`,{
      method:"POST",headers:{authorization:who,"content-type":"application/json"},body:JSON.stringify(body),
    });
    await t.test("HTTP trims names and changes only names in both mirrors",async()=>{
      const before=(await pool.query(`SELECT
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM hs_onboarding.programs p) AS programs,
        (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM hs_onboarding.teams t) AS teams,
        (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.team_memberships m) AS memberships,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM hs_onboarding.children c) AS children`)).rows[0];
      const response=await request("league",{name:"  New league  ",expectedName:"Old league"});
      assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");
      assert.equal((await pool.query("SELECT name FROM public.leagues WHERE id=$1",[ids.league])).rows[0].name,"New league");
      assert.equal((await pool.query("SELECT name FROM hs_onboarding.leagues WHERE id=$1",[ids.league])).rows[0].name,"New league");
      const after=(await pool.query(`SELECT
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM hs_onboarding.programs p) AS programs,
        (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM hs_onboarding.teams t) AS teams,
        (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.team_memberships m) AS memberships,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM hs_onboarding.children c) AS children`)).rows[0];
      assert.deepEqual(after,before);
      assert.equal((await pool.query("SELECT commissioner_id,league_type FROM public.leagues WHERE id=$1",[ids.league])).rows[0].commissioner_id,a.league.authId);
    });
    await t.test("coaches, outsiders, paid labels and other league IDs do not grant editing",async()=>{
      await pool.query("UPDATE public.users SET role='commissioner' WHERE id=$1",[a.outsider.authId]);
      for(const actor of ["head","assistant","outsider"])
        assert.equal((await request(actor,{name:"Forbidden",expectedName:"New league"})).status,403);
      assert.equal((await request("unknown",{name:"Forbidden",expectedName:"New league"})).status,401);
      assert.equal((await request("league",{name:"Forbidden",expectedName:"New league"},randomUUID())).status,403);
    });
    await t.test("empty, overlong and extra settings payloads are rejected",async()=>{
      for(const body of [
        {name:"  ",expectedName:"New league"},
        {name:"X".repeat(101),expectedName:"New league"},
        {name:"Valid",expectedName:"New league",commissionerId:a.head.authId},
        {name:"Valid",expectedName:"New league",leagueType:"adult"},
      ])assert.equal((await request("league",body)).status,400);
    });
    await t.test("stale and concurrent edits cannot overwrite newer names",async()=>{
      assert.equal((await request("league",{name:"Stale",expectedName:"Old league"})).status,409);
      const results=await Promise.all(["One","Two"].map(name=>request("league",{name,expectedName:"New league"})));
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    });
    await t.test("renaming before any program exists does not create private setup records",async()=>{
      const id=randomUUID();
      await pool.query("INSERT INTO public.leagues(id,name,commissioner_id,league_type) VALUES($1,'Empty Youth',$2,'youth')",[id,a.league.authId]);
      assert.equal((await request("league",{name:"Youth renamed",expectedName:"Empty Youth"},id)).status,200);
      assert.equal((await pool.query("SELECT count(*)::int n FROM hs_onboarding.leagues WHERE id=$1",[id])).rows[0].n,0);
    });
  } finally {
    if(server)await new Promise<void>(r=>server!.close(()=>r()));
    await f.close();
  }
});
