import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerTeamAwardRoutes } from "../teamAwardRoutes";

test("award endpoints enforce auth, RPC authority, validation and explicit setup state",async () => {
  const app=express(); app.use(express.json());
  let reply:any={data:false,error:null};
  const calls:any[]=[];
  const signedPaths:string[]=[];
  const notified:string[]=[];
  const client:any={
    rpc:async(name:string,args:unknown)=>{calls.push({name,args});return reply;},
    storage:{from:()=>({createSignedUrl:async(path:string)=>{
      signedPaths.push(path);return {data:{signedUrl:"https://fixture.invalid/art.png?token=test"},error:null};
    }})},
  };
  registerTeamAwardRoutes(app,(req:any,res,next)=>{
    if (!req.headers.authorization) return res.status(401).json({message:"Unauthorized"});
    if (req.headers["x-fixture-demo"]) req.demoContext={};
    next();
  },()=>client,userId=>{notified.push(userId);});
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const request=(path:string,method="GET",body?:object,extra:Record<string,string>={})=>fetch(base+path,{
    method,headers:{"Authorization":"Bearer fixture","Content-Type":"application/json",...extra},
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  try {
    assert.equal((await fetch(base+"/api/team-awards/config")).status,401);
    reply={data:null,error:{code:"PGRST202",message:"missing RPC"}};
    assert.deepEqual(await (await request("/api/team-awards/config")).json(),{enabled:false,setupRequired:true});
    assert.deepEqual(await (await request("/api/team-awards/events/pending")).json(),{events:[],setupRequired:true});
    reply={data:null,error:{code:"42501",message:"Only authorized team members may access these awards"}};
    assert.equal((await request("/api/teams/other-team/awards")).status,403);
    reply={data:null,error:{code:"23505",message:"Already awarded this period"}};
    assert.equal((await request("/api/teams/a/awards/00000000-0000-4000-8000-000000000001/grants","POST",{playerId:"player",periodKey:"2026-W44"})).status,409);
    const count=calls.length;
    assert.equal((await request("/api/teams/a/awards","POST",{name:"x".repeat(41),cadence:"week",presetIcon:"trophy"})).status,400);
    assert.equal(calls.length,count);
    assert.equal((await request("/api/team-awards/config","GET",undefined,{"x-fixture-demo":"1"})).status,403);
    assert.equal(calls.length,count,"Demo never reaches real JWT-backed RPCs");
    reply={data:"00000000-0000-4000-8000-000000000001",error:null};
    const edit=await request("/api/teams/a/awards","POST",{id:"00000000-0000-4000-8000-000000000001",name:"New name",cadence:"week",presetIcon:"star"});
    assert.equal(edit.status,200);
    assert.equal(calls.at(-1).name,"team_award_save");
    assert.equal(calls.at(-1).args.p_id,"00000000-0000-4000-8000-000000000001");
    const beforeRemovedEndpoint=calls.length;
    assert.equal((await request("/api/teams/a/awards/00000000-0000-4000-8000-000000000001/remove-background","POST",{image:"unused"})).status,404);
    assert.equal(calls.length,beforeRemovedEndpoint,"Retired background removal never reaches Supabase");
    const eventId="00000000-0000-4000-8000-000000000002";
    const awardId="00000000-0000-4000-8000-000000000001";
    reply={data:[{id:eventId,awardId,teamId:"a",imageUrl:`a/${awardId}.png`,imageVersion:"1"}],error:null};
    const pending=await (await request("/api/team-awards/events/pending")).json();
    assert.equal(pending.events[0].id,eventId);
    assert.match(pending.events[0].imageUrl,/^https:\/\/fixture.invalid/);
    assert.equal(signedPaths.at(-1),`a/${awardId}.png`,"Signs the award path, not the recognition-event ID");
    const beforeInvalid=calls.length;
    assert.equal((await request("/api/team-awards/events/not-a-uuid/acknowledge","POST")).status,400);
    assert.equal(calls.length,beforeInvalid);
    reply={data:null,error:{code:"P0002",message:"Award recognition not found"}};
    assert.equal((await request(`/api/team-awards/events/${eventId}/acknowledge`,"POST")).status,404);
    reply={data:null,error:null};
    assert.equal((await request(`/api/team-awards/events/${eventId}/acknowledge`,"POST")).status,200);
    assert.equal(calls.at(-1).name,"team_award_acknowledge_celebration");
    assert.equal(calls.at(-1).args.p_event,eventId);
    reply={data:{id:awardId,changed:true},error:null};
    assert.equal((await request(`/api/teams/a/awards/${awardId}/grants`,"POST",{playerId:"recipient",periodKey:"week"})).status,200);
    assert.deepEqual(notified,["recipient"]);
    reply={data:{id:awardId,changed:false},error:null};
    await request(`/api/teams/a/awards/${awardId}/grants`,"POST",{playerId:"recipient",periodKey:"week",reassign:true});
    assert.deepEqual(notified,["recipient"],"No-op recognition does not emit another celebration");
    const beforeDemo=calls.length;
    assert.equal((await request("/api/team-awards/events/pending","GET",undefined,{"x-fixture-demo":"1"})).status,403);
    assert.equal((await request(`/api/team-awards/events/${eventId}/acknowledge`,"POST",undefined,{"x-fixture-demo":"1"})).status,403);
    assert.equal(calls.length,beforeDemo);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
