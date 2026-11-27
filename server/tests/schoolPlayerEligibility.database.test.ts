import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { SchoolPlayerEligibilityService } from "../schoolPlayerEligibility";
import { SchoolLeagueManagement } from "../schoolLeagueManagement";
import { registerSchoolLeagueManagement } from "../schoolLeagueManagementHttp";
import { registerHighSchoolStaffRoutes } from "../highSchoolStaffHttp";
import { HighSchoolStaffEvents } from "../highSchoolStaffEvents";
import { HighSchoolStaffChat } from "../highSchoolStaffChat";
import { OnboardingError } from "../highSchoolOnboarding";
import { adultTeamOperationsAllowed } from "../schoolTeamBoundary";
import ts from "typescript";
import vm from "node:vm";
import { z } from "zod";
import { insertMessageSchema } from "../../shared/schema";

test("school permissions and independent playing restrictions are enforced by actual SQL and HTTP", async t => {
  const f = await createStaffFixture(), { pool, ids, actors: a, staff, events, chat } = f;
  const eligibility = new SchoolPlayerEligibilityService(pool);
  const league = new SchoolLeagueManagement(pool);
  const deny = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (e: any) => e.code === code);
  let server: ReturnType<express.Express["listen"]> | undefined;
  try {
    await pool.query("ALTER TABLE public.teams ADD COLUMN league_id varchar");
    await pool.query("INSERT INTO public.leagues(id,name,league_type,commissioner_id) VALUES($1,'Fixture','high_school',$2)", [ids.league, a.league.authId]);
    await pool.query(await readFile("migrations/0061_school_player_eligibility.sql", "utf8"));
    const event = await events.create(a.head, ids.varsity, { title: "Upcoming", startsAt: new Date(Date.now()+86400000).toISOString() });
    const input = (restricted: boolean, version: number, reason = restricted ? "Review required" : "") => ({ restricted, version, reason });
    let leagueVersion = 0, teamVersion = 0;

    await t.test("coaches see only their own roster and cannot edit another team or league eligibility", async () => {
      const own = await eligibility.teamWorkspace(a.head, ids.varsity);
      assert.equal(own.canEdit, true);
      assert.ok(own.players.some(p => p.playerId === ids.child1));
      assert.ok(!own.players.some(p => p.playerId === ids.child2));
      assert.deepEqual((await staff.workspace(a.head, ids.varsity)).callupCandidates, []);
      await deny(eligibility.teamWorkspace(a.head, ids.jv), "STAFF_TEAM_FORBIDDEN");
      await deny(eligibility.setTeam(a.head, ids.jv, ids.child2, input(true,0)), "STAFF_TEAM_FORBIDDEN");
      await deny(eligibility.setTeam(a.head, ids.varsity, ids.child2, input(true,0)), "PLAYER_TEAM_FORBIDDEN");
      await deny(eligibility.setLeague(a.head, ids.league, ids.varsity, ids.child1, input(true,0)), "LEAGUE_MANAGEMENT_FORBIDDEN");
      await deny(eligibility.setTeam(a.manager, ids.varsity, ids.child1, input(true,0)), "COACH_ELIGIBILITY_FORBIDDEN");
      await deny(events.saveLineup(a.head, ids.varsity, event.id!, { entries:[{ playerId:ids.child2,state:"dress" }] }),
        "LINEUP_REQUIRES_APPROVED_PLAYER_GUARDIAN_AND_CONSENT");
    });
    await t.test("league restriction scratches saved future lineups and blocks direct dress writes", async () => {
      await events.saveLineup(a.head, ids.varsity, event.id!, { entries:[{ playerId:ids.child1,state:"dress" }] });
      await eligibility.setLeague(a.league, ids.league, ids.varsity, ids.child1, input(true,leagueVersion++,"League review"));
      const status = (await eligibility.teamWorkspace(a.head, ids.varsity)).players.find(p => p.playerId === ids.child1)!;
      assert.equal(status.eligible,false);assert.equal(status.leagueRestricted,true);assert.equal(status.leagueReason,"League review");
      assert.equal((await events.lineup(a.head,ids.varsity,event.id!)).entries[0].state,"scratch");
      await deny(events.saveLineup(a.head, ids.varsity, event.id!, {entries:[{playerId:ids.child1,state:"dress"}]}),"PLAYER_INELIGIBLE");
      await events.saveLineup(a.head,ids.varsity,event.id!,{entries:[{playerId:ids.child1,state:"scratch"}]});
    });
    await t.test("coach clears only team restriction and cannot override a league decision", async () => {
      await eligibility.setTeam(a.head,ids.varsity,ids.child1,input(true,teamVersion++,"Team review"));
      await eligibility.setTeam(a.assistant,ids.varsity,ids.child1,input(false,teamVersion++));
      let player=(await eligibility.teamWorkspace(a.head,ids.varsity)).players.find(p=>p.playerId===ids.child1)!;
      assert.equal(player.teamRestricted,false);assert.equal(player.leagueRestricted,true);assert.equal(player.eligible,false);
      await eligibility.setTeam(a.head,ids.varsity,ids.child1,input(true,teamVersion++));
      await eligibility.setLeague(a.league,ids.league,ids.varsity,ids.child1,input(false,leagueVersion++));
      player=(await eligibility.teamWorkspace(a.head,ids.varsity)).players.find(p=>p.playerId===ids.child1)!;
      assert.equal(player.teamRestricted,true);assert.equal(player.leagueRestricted,false);assert.equal(player.eligible,false);
      await eligibility.setTeam(a.head,ids.varsity,ids.child1,input(false,teamVersion++));
      player=(await eligibility.teamWorkspace(a.head,ids.varsity)).players.find(p=>p.playerId===ids.child1)!;
      assert.equal(player.eligible,true);
      await events.saveLineup(a.head,ids.varsity,event.id!,{entries:[{playerId:ids.child1,state:"dress"}]});
    });
    await t.test("stale/concurrent changes conflict instead of silently reversing newer decisions", async () => {
      const results=await Promise.allSettled([
        eligibility.setTeam(a.head,ids.varsity,ids.child1,input(true,teamVersion,"One")),
        eligibility.setTeam(a.assistant,ids.varsity,ids.child1,input(true,teamVersion,"Two")),
      ]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      const rejected=results.find(r=>r.status==="rejected") as PromiseRejectedResult;
      assert.equal(rejected.reason.code,"ELIGIBILITY_CHANGED_REFRESH_REQUIRED");teamVersion++;
      await eligibility.setTeam(a.head,ids.varsity,ids.child1,input(false,teamVersion++));
    });
    await t.test("a concurrent lineup save cannot leave a league-restricted player dressed", async () => {
      await Promise.allSettled([
        events.saveLineup(a.head,ids.varsity,event.id!,{entries:[{playerId:ids.child1,state:"dress"}]}),
        eligibility.setLeague(a.league,ids.league,ids.varsity,ids.child1,input(true,leagueVersion++)),
      ]);
      assert.equal((await eligibility.teamWorkspace(a.head,ids.varsity)).players.find(p=>p.playerId===ids.child1)?.eligible,false);
      assert.ok((await events.lineup(a.head,ids.varsity,event.id!)).entries.every(e=>e.state!=="dress"));
      await eligibility.setLeague(a.league,ids.league,ids.varsity,ids.child1,input(false,leagueVersion++));
    });
    await t.test("league ownership, forged scopes, paid labels and revoked sessions cannot become coaching or messaging access", async () => {
      await pool.query("UPDATE public.users SET role='commissioner' WHERE id=$1",[a.league.authId]);
      await deny(staff.workspace(a.league,ids.varsity),"STAFF_TEAM_FORBIDDEN");
      await deny(events.saveLineup(a.league,ids.varsity,event.id!,{entries:[]}),"STAFF_TEAM_FORBIDDEN");
      const room=(await staff.workspace(a.head,ids.varsity)).rooms.find(r=>r.kind==="team")!;
      await deny(chat.send(a.league,ids.varsity,room.id,{body:"Admin cannot send",requestId:randomUUID()}),"STAFF_TEAM_FORBIDDEN");
      const composedEvents=new HighSchoolStaffEvents(pool,undefined,undefined,false,true);
      const composedChat=new HighSchoolStaffChat(pool,undefined,undefined,false,true);
      await deny(composedEvents.saveLineup(a.league,ids.varsity,event.id!,{entries:[]}),"LEAGUE_ADMIN_COACHING_FORBIDDEN");
      await deny(composedChat.send(a.league,ids.varsity,room.id,{body:"No",requestId:randomUUID()}),"LEAGUE_ADMIN_PLAYER_CHAT_FORBIDDEN");
      await deny(eligibility.leagueWorkspace(a.outsider,ids.league),"LEAGUE_MANAGEMENT_FORBIDDEN");
      await pool.query("DELETE FROM auth.sessions WHERE id=$1",[a.revoked.sessionId]);
      await deny(eligibility.teamWorkspace(a.revoked,ids.varsity),"INVALID_SESSION");
      await assert.rejects(eligibility.setTeam(a.head,ids.varsity,ids.child1,{...input(false,teamVersion),scope:"league"}));
    });
    await t.test("actual HTTP routes preserve scope, reject bypass bodies and serve private no-store responses", async () => {
      const app=express();app.use(express.json());
      const authenticate=async (req:express.Request)=>{
        const actor=a[String(req.get("authorization")??"")];if(!actor)throw new OnboardingError("INVALID_SESSION",401);return actor;
      };
      registerSchoolLeagueManagement(app,league,authenticate);
      registerHighSchoolStaffRoutes(app,staff,events,chat,{} as any,authenticate,true);
      server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server!.once("listening",r));
      const origin=`http://127.0.0.1:${(server.address() as any).port}`;
      const root=`${origin}/api/high-school/leagues/${ids.league}/management/eligibility`;
      const coach=`${origin}/api/high-school/staff/teams/${ids.varsity}/eligibility`;
      const response=await fetch(root,{headers:{authorization:"league"}});
      assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");
      assert.equal((await fetch(root,{headers:{authorization:"head"}})).status,403);
      assert.equal((await fetch(coach,{headers:{authorization:"league"}})).status,403);
      assert.equal((await fetch(`${coach}/${ids.child1}`,{method:"POST",headers:{authorization:"head","content-type":"application/json"},
        body:JSON.stringify({...input(false,teamVersion),leagueRestricted:false})})).status,400);
      assert.equal((await fetch(`${root}/${ids.varsity}/${ids.child1}`,{method:"POST",headers:{authorization:"head","content-type":"application/json"},
        body:JSON.stringify(input(false,leagueVersion))})).status,403);
    });
    await t.test("legacy Adult endpoints cannot bypass school rules but Adult operations remain allowed", async () => {
      const adult=randomUUID(),youth=randomUUID(),adultTagged=randomUUID();
      await pool.query("INSERT INTO public.leagues(id,name,league_type,commissioner_id) VALUES($1,'Youth','youth',$2)",[youth,a.league.authId]);
      await pool.query("INSERT INTO public.teams(id,name,program_type,league_id) VALUES($1,'Adult','adult',NULL),($2,'Youth legacy tag','adult',$3)",[adult,adultTagged,youth]);
      assert.equal(await adultTeamOperationsAllowed(pool,adult),true);
      assert.equal(await adultTeamOperationsAllowed(pool,ids.varsity),false);
      assert.equal(await adultTeamOperationsAllowed(pool,adultTagged),false);
      assert.equal(await adultTeamOperationsAllowed(pool,randomUUID()),false);
      // Execute the actual shared authority function used by the legacy line
      // routes, not a second test implementation of creator/captain rules.
      const source=await readFile("server/routes.ts","utf8");
      const parsed=ts.createSourceFile("routes.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
      let authority:ts.VariableStatement|undefined;
      const visit=(node:ts.Node)=>{
        if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==="canManageTeamLines"))authority=node;
        ts.forEachChild(node,visit);
      };visit(parsed);assert.ok(authority);
      const js=ts.transpileModule(`${authority!.getText(parsed)};globalThis.check=canManageTeamLines;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
      const sandbox:any={pool,adultTeamOperationsAllowed,storage:{isTeamCaptain:async()=>true}};
      vm.runInNewContext(js,sandbox);
      assert.equal(await sandbox.check({id:ids.varsity,creatorId:a.league.authId},a.league.authId),false);
      assert.equal(await sandbox.check({id:adult,creatorId:a.league.authId},a.league.authId),true);
      const template=source.slice(source.indexOf("app.put('/api/teams/:teamId/line-combinations/template'"),source.indexOf("const VALID_LINE_TYPES_TPL"));
      assert.match(template,/await canManageTeamLines\(team, userId\)/);
    });
    await t.test("actual legacy message handlers reject school sends even for an existing conversation participant", async () => {
      const source=await readFile("server/routes.ts","utf8");
      const parsed=ts.createSourceFile("routes.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
      const paths=["/api/teams/:id/messages","/api/conversations/:id/messages"];
      for(const route of paths){
        let handler:ts.Expression|undefined;
        const visit=(node:ts.Node)=>{
          if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==="post"&&
            ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===route)handler=node.arguments[node.arguments.length-1];
          ts.forEachChild(node,visit);
        };visit(parsed);assert.ok(handler);
        let writes=0;
        const sandbox:any={z,insertMessageSchema,adultTeamOperationsAllowed,pool,console,
          storage:{getUser:async()=>({id:a.league.authId}),sendMessage:async()=>{writes++;throw Error("UNEXPECTED_WRITE");}},
          messagingService:{isUserInConversation:async()=>true,getConversation:async()=>({id:ids.varsity,teamId:ids.varsity}),
            createMessage:async()=>{writes++;throw Error("UNEXPECTED_WRITE");}}};
        const js=ts.transpileModule(`globalThis.handler=(${handler!.getText(parsed)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
        vm.runInNewContext(js,sandbox);
        let status=200;
        const response:any={status:(code:number)=>{status=code;return response;},json:()=>response};
        await sandbox.handler({params:{id:ids.varsity},user:{claims:{sub:a.league.authId}},body:{
          conversationId:ids.varsity,senderId:a.league.authId,content:"Must not reach players",messageType:"text",
        }},response);
        assert.equal(status,403,route);assert.equal(writes,0,route);
      }
    });
    await t.test("audit and privacy retain independent scopes without changing consent or child login", async () => {
      const scopeRows=(await pool.query("SELECT DISTINCT scope FROM hs_onboarding.player_eligibility_audit")).rows.map(r=>r.scope).sort();
      assert.deepEqual(scopeRows,["league","team"]);
      for (const name of ["league_player_eligibility","team_player_eligibility","player_eligibility_audit"]) {
        const [privacy]=(await pool.query(`SELECT c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') AS exposed
          FROM pg_class c WHERE c.oid=to_regclass($1)`,[`hs_onboarding.${name}`])).rows;
        assert.equal(privacy.relrowsecurity,true);assert.equal(privacy.exposed,false);
      }
      assert.equal((await pool.query("SELECT status FROM hs_onboarding.player_requests WHERE id=$1",[ids.req1])).rows[0].status,"approved");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.team_memberships WHERE child_profile_id=$1 AND status='approved'",[ids.child1])).rows[0].n,1);
    });
    await t.test("missing eligibility storage fails explicitly instead of treating players as eligible", async () => {
      await pool.query("DROP TABLE hs_onboarding.team_player_eligibility");
      await deny(eligibility.teamWorkspace(a.head,ids.varsity),"PLAYER_ELIGIBILITY_UPDATE_REQUIRED");
      await deny(events.saveLineup(a.head,ids.varsity,event.id!,{entries:[{playerId:ids.child1,state:"dress"}]}),"PLAYER_ELIGIBILITY_UPDATE_REQUIRED");
    });
  } finally { if(server)await new Promise<void>(r=>server!.close(()=>r()));await f.close(); }
});
