import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import ts from "typescript";
import express from "express";
import { z } from "zod";
import { createProCoverageService } from "../proCoverageService";
import { proConversationContext } from "../../shared/proConversation";

/** Exercise the real registered callbacks without booting live jobs/providers. */
async function route(method: string, path: string, dependencies: Record<string, unknown>) {
  const source = ts.createSourceFile("routes.ts",await readFile(new URL("../routes.ts",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
  let handler: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(source)==="app" && node.expression.name.text===method &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text===path) handler=node.arguments.at(-1);
    ts.forEachChild(node,visit);
  }
  visit(source);
  assert.ok(handler,`Registered route ${method} ${path}`);
  const code=ts.transpileModule(`const handler=${handler.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function(...Object.keys(dependencies),`${code}\nreturn handler;`)(...Object.values(dependencies));
}
test("real photo/comment/odds callbacks apply resource coverage, preserve membership and free summaries", async () => {
  let actor="school",member=true,photoReads=0,commentWrites=0;
  const premium=async (id:string,leagueId?:string|null)=>id==="personal" || !!leagueId &&
    (id==="multiple"&&["HS","ADULT"].includes(leagueId)||id==="school"&&leagueId==="HS"||id==="adult"&&leagueId==="ADULT");
  const fields=(table:string)=>new Proxy({} as any,{get:(_t,key)=>`${table}.${String(key)}`});
  const tables={games:fields("games"),users:fields("users"),teams:fields("teams"),leagueMemberships:fields("leagues"),
    teamMemberships:fields("members"),gamePredictions:fields("predictions")};
  const eq=(column:any,value:any)=>({column,value});
  const db={select(selection?:Record<string,unknown>){
    let table:any,filter:any;
    const rows=()=>{
      if(table===tables.users)return[{id:actor,role:"free_tier"}];
      if(table===tables.leagueMemberships||table===tables.teamMemberships||table===tables.teams)return member?[{teamId:"home",id:"home"}]:[];
      const gameId=filter?.value??"HS";
      if(table===tables.games)return[{homeTeamId:"home",awayTeamId:"away",leagueId:gameId}];
      const prediction:any={gameId,homeTeamId:"home",awayTeamId:"away",homeWinProbability:".6",awayWinProbability:".4",tieProbability:"0",moneylineHome:"-150",topScorersHome:[{userId:"scorer"}]};
      return[selection?Object.fromEntries(Object.keys(selection).map(key=>[key,prediction[key]])):prediction];
    };
    const query:any={from(t:any){table=t;return query;},where(f:any){filter=f;return query;},limit(){return Promise.resolve(rows());},
      then(resolve:any,reject:any){return Promise.resolve(rows()).then(resolve,reject);}};
    return query;
  }};
  const storage={
    async getUser(){return{id:actor};},async getAnnouncement(id:string){return{leagueId:id};},
    async isAnnouncementVisibleToUser(){return member;},
    async getLeaguePhotos(leagueId:string){photoReads++;return[{leagueId}];},
    async createAnnouncementComment(data:any){commentWrites++;return{id:"comment",...data};},
    async getAnnouncementComments(){return[];},
  };
  const deps={...tables,db,storage,eq,and:(...args:any[])=>args,inArray:()=>null,
    proCoverage:{hasProFor:(id:string,context:any)=>premium(id,context.leagueId)},
    canAccessLeaguePremiumFeatures:(user:any,id:string)=>premium(user.id,id),
    canAccessPremiumFeatures:(user:any)=>premium(user.id),
  };
  const app=express();app.use(express.json());
  app.use((req:any,res,next)=>{
    actor=req.get("x-fixture-session");
    if(!["school","adult","multiple","personal"].includes(actor))return res.sendStatus(401);
    req.user={claims:{sub:actor}};req.userWithPermissions={id:actor,role:"free_tier"};next();
  });
  app.get("/photos/:leagueId",await route("get","/api/league-photos/:leagueId",deps));
  app.post("/comments/:id",await route("post","/api/announcements/:id/comments",deps));
  app.get("/odds/:gameId",await route("get","/api/games/:gameId/prediction",deps));
  const server=app.listen(0);await once(server,"listening");
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for(const id of ["school","adult","multiple","personal"])for(const league of ["HS","ADULT","OTHER"]){
      const expected=await premium(id,league);
      const headers={"x-fixture-session":id,"content-type":"application/json"};
      const photo=await fetch(`${base}/photos/${league}?selectedLeagueId=HS`,{headers});
      assert.equal(photo.status,expected?200:403,`${id} photos ${league}`);
      const comment=await fetch(`${base}/comments/${league}`,{method:"POST",headers,body:JSON.stringify({content:"Fixture comment",leagueId:"HS",parentUserId:"personal"})});
      assert.equal(comment.status,expected?200:403,`${id} comments ${league}`);
      const odds=await fetch(`${base}/odds/${league}?leagueId=HS`,{headers});
      assert.equal(odds.status,200);
      const prediction=await odds.json();
      assert.equal(prediction.canViewDetails,expected,`${id} odds ${league}`);
      assert.equal("moneylineHome" in prediction,expected);
      assert.equal("topScorersHome" in prediction,expected);
      assert.equal(prediction.homeWinProbability,.6);
    }
    assert.equal(photoReads,7);assert.equal(commentWrites,7);
    member=false;
    for(const path of ["photos/HS","odds/HS"])assert.equal((await fetch(`${base}/${path}`,{headers:{"x-fixture-session":"personal"}})).status,403);
    assert.equal((await fetch(`${base}/comments/HS`,{method:"POST",headers:{"x-fixture-session":"personal","content-type":"application/json"},body:'{"content":"test"}'})).status,404);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("real message callbacks keep own-team text, founder support and league seats available during personal billing failures",async()=>{
  let personalCalls=0,messageWrites=0,groupWrites=0,supportRequested=false;
  const service=createProCoverageService({
    account:async()=>({id:"payer",role:"player_pro",stripeSubscriptionId:"sub_fixture"}),
    personal:async()=>{personalCalls++;throw new Error("Personal billing unavailable");},
    team:async id=>({id,leagueId:id==="school"?"HS":"ADULT"}),
    teams:async()=>[{id:"adult",leagueId:"ADULT"},{id:"school",leagueId:"HS"}],
    seats:async()=>[{leagueId:"HS",startMonth:"2026-11",endMonth:"2027-02"}],
    seat:async(_id,leagueId)=>leagueId==="HS",
  });
  const conversations:Record<string,any>={
    own:{id:"own",type:"team_group",teamId:"adult"},
    school:{id:"school",type:"team_group",teamId:"school"},
    direct:{id:"direct",type:"direct",leagueId:"HS"},
    support:{id:"support",type:"direct",leagueId:"HS"},
  };
  const participants=(id:string)=>[{userId:"payer",user:{displayId:"FIXTURE"}},
    ...(id==="support"||supportRequested?[{userId:"support",user:{displayId:"U00001"}}]:[])];
  const messagingService={
    async isUserInConversation(){return true;},
    async getConversation(id:string){return conversations[id];},
    async getConversationParticipants(id:string){return participants(id);},
    async createMessage(data:any){messageWrites++;return{id:`message-${messageWrites}`,createdAt:"2026-11-24T12:00:00Z",...data};},
    async createCustomGroupChat(){groupWrites++;return{id:"custom"};},
  };
  const query:any={from(){return query;},where(){return query;},async limit(){return supportRequested?[{id:"support"}]:[];}};
  const deps={
    z,messagingService,proCoverage:service,proConversationContext,
    hasPersonalPro:()=>service.hasProFor("payer"),
    storage:{async getUserTeams(){return[{id:"adult"}];},async getUser(){return{id:"payer",firstName:"Synthetic",lastName:"Fixture"};}},
    db:{select(){return query;}},users:{id:"id",displayId:"display_id"},and:()=>null,eq:()=>null,inArray:()=>null,
    broadcastToParticipants(){},broadcastToUser(){},
    console:{log(){},error(){}},
    require(name:string){
      if(name==="./supabaseStorage")return{SupabaseStorageService:class {}};
      throw new Error(`Unexpected provider module: ${name}`);
    },
  };
  const app=express();app.use(express.json());
  app.use((req:any,res,next)=>{
    if(req.get("x-fixture-session")!=="payer")return res.sendStatus(401);
    req.user={claims:{sub:"payer"}};
    req.demoContext={fixture:true}; // Existing Demo delivery suppression; never send test notifications.
    next();
  });
  app.post("/send/:id",await route("post","/api/conversations/:id/messages",deps));
  app.post("/custom",await route("post","/api/conversations/custom-group",deps));
  const server=app.listen(0);await once(server,"listening");
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const post=(path:string,body:any)=>fetch(`${base}${path}`,{method:"POST",headers:{
    "content-type":"application/json","x-fixture-session":"payer",
  },body:JSON.stringify(body)});
  try{
    for(const [id,messageType] of [["own","text"],["support","text"],["support","gif"],["school","gif"]]){
      assert.equal((await post(`/send/${id}`,{content:"Synthetic fixture message",messageType})).status,201,`${id} ${messageType}`);
    }
    assert.equal(personalCalls,0);
    assert.equal(messageWrites,4);
    for(const [id,messageType] of [["own","gif"],["direct","text"]]){
      assert.equal((await post(`/send/${id}`,{content:"Synthetic fixture message",messageType})).status,500,`${id} must fail closed`);
    }
    assert.equal(personalCalls,2);
    assert.equal(messageWrites,4,"unverified paid actions must not create messages");
    supportRequested=true;
    assert.equal((await post("/custom",{title:"Support fixture",leagueId:"HS",participantIds:["support"]})).status,201);
    assert.equal(personalCalls,2,"the support-group exception must also bypass personal billing");
    supportRequested=false;
    assert.equal((await post("/custom",{title:"Ordinary group",leagueId:"HS",participantIds:["other"]})).status,500);
    assert.equal(groupWrites,1);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
