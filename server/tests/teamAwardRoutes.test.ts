import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerTeamAwardRoutes } from "../teamAwardRoutes";

test("award endpoints enforce auth, RPC authority, validation and explicit setup state",async () => {
  const app=express(); app.use(express.json());
  let reply:any={data:false,error:null};
  const calls:any[]=[];
  const client:any={rpc:async(name:string,args:unknown)=>{calls.push({name,args});return reply;}};
  registerTeamAwardRoutes(app,(req:any,res,next)=>{
    if (!req.headers.authorization) return res.status(401).json({message:"Unauthorized"});
    if (req.headers["x-fixture-demo"]) req.demoContext={};
    next();
  },()=>client);
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
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
