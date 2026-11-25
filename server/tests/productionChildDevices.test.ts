import assert from "node:assert/strict";
import test from "node:test";
import { HighSchoolChildDevices } from "../highSchoolChildDevices";
import { parentDigest, type ParentSql } from "../highSchoolParentSecurity";
import { childSkinSession } from "../../client/src/lib/highSchoolChildSession";
import { parentVerificationSession } from "../../client/src/lib/parentVerificationSession";

const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor={authId:id(1),sessionId:id(2),email:"fixture@example.com",emailVerified:true,fixture:false,productionTest:true};
const parent={authorized:async()=>true} as any;
function fixture(overrides:{tester?:boolean;parent?:boolean;covered?:boolean;member?:boolean;allowed?:boolean;failures?:number;requestStatus?:string;session?:boolean}={}){
  const calls:Array<{sql:string;args:any[]}>=[];
  const query=async(sql:string,args:any[]=[])=>{
    calls.push({sql,args});let rows:any[]=[];
    if(sql.includes("SELECT u.display_id"))rows=overrides.tester===false?[]:[{display_id:"U00001"}];
    else if(sql.includes("SELECT hs_onboarding.production_child_parent_allowed"))rows=[{allowed:overrides.allowed!==false}];
    else if(sql.includes("count(DISTINCT player_key)"))rows=[{n:1}];
    else if(sql.includes("SELECT DISTINCT t.id,p.league_id"))rows=overrides.member===false?[]:[{id:id(5),league_id:id(6)}];
    else if(sql.includes("SELECT c.*,r.team_id"))rows=[{id:id(3),parent_auth_id:actor.authId,team_id:id(5),first_name:"Synthetic",last_name:"Player"}];
    else if(sql.includes("window_started_at>"))rows=[{failures:0,recent:true}];
    else if(sql.startsWith("SELECT parent_auth_id FROM hs_onboarding.device_codes"))rows=[{parent_auth_id:actor.authId}];
    else if(sql.includes("FROM hs_onboarding.device_codes")&&sql.includes("FOR UPDATE"))rows=[{
      id:id(4),child_id:id(3),parent_auth_id:actor.authId,code_digest:parentDigest("K7P2QX"),failures:overrides.failures??0,
      unexpired:true,expires_at:new Date(Date.now()+600000)}];
    else if(sql.startsWith("SELECT parent_auth_id FROM hs_onboarding.device_requests"))rows=[{parent_auth_id:actor.authId}];
    else if(sql.includes("FROM hs_onboarding.device_requests")&&sql.includes("FOR UPDATE"))rows=[{
      id:id(7),child_id:id(3),parent_auth_id:actor.authId,approved_session_id:actor.sessionId,
      status:overrides.requestStatus??"approved",unexpired:true}];
    else if(sql.startsWith("SELECT 1 FROM auth.sessions"))rows=overrides.session===false?[]:[{}];
    else if(sql.startsWith("SELECT s.*"))rows=overrides.session===false?[]:[{child_id:id(3),parent_auth_id:actor.authId}];
    else if(sql.startsWith("SELECT 1 FROM hs_onboarding.children WHERE"))rows=[{}];
    else if(sql.includes('RETURNING expires_at AS "expiresAt"'))rows=[{expiresAt:new Date(Date.now()+600000)}];
    else if(sql.includes("count(*)::int AS total"))rows=[{total:0}];
    return {rows};
  };
  const db:ParentSql={query,connect:async()=>({query,release(){}})};
  const service=new HighSchoolChildDevices(db,overrides.parent===false?{authorized:async()=>false} as any:parent,true,
    {production:true,coverage:async()=>overrides.covered!==false});
  return {service,calls};
}
const rejects=(work:Promise<unknown>,code:string)=>assert.rejects(work,(error:any)=>error.code===code);
test("production pairing requires the separate challenge before touching storage",async()=>{
  const {service,calls}=fixture();
  await rejects(service.start({code:"K7P2QX"},"fixture"),"SECURE_SETUP_LINK_REQUIRED");assert.equal(calls.length,0);
});
test("production activation cannot be granted by fixture or productionTest input alone",async()=>{
  const {service,calls}=fixture({tester:false});
  await rejects(service.createCode({...actor,fixture:true},{childId:id(3)}),"ONBOARDING_TEST_ACCESS_DENIED");
  assert.ok(!calls.some(c=>c.sql.includes("SET enabled=true")));
});
test("parent email verification is required even for an eligible rollout account",async()=>{
  const {service}=fixture({parent:false});
  await rejects(service.createCode(actor,{childId:id(3)}),"PARENT_VERIFICATION_REQUIRED");
});
for(const [condition,code] of [["covered","APPROVED_TEAM_AND_COVERAGE_REQUIRED"],["member","APPROVED_TEAM_AND_COVERAGE_REQUIRED"],
  ["allowed","CHILD_ACCESS_UNAVAILABLE"]] as const)test(`production activation fails closed without ${condition}`,async()=>{
  const {service,calls}=fixture({[condition]:false});
  await rejects(service.createCode(actor,{childId:id(3)}),code);
  assert.ok(!calls.some(c=>c.sql.includes("SET enabled=true")));assert.ok(calls.some(c=>c.sql==="ROLLBACK"));
});
test("an approved and covered parent's setup action enables only the selected child",async()=>{
  const {service,calls}=fixture();
  const result=await service.createCode(actor,{childId:id(3)});
  assert.match(result.code,/^[A-HJ-NP-Z2-9]{6}$/);assert.ok(result.challengeId);
  const activation=calls.find(c=>c.sql.includes("SET enabled=true"));
  assert.deepEqual(activation?.args,[id(3),actor.authId]);
  assert.ok(calls.some(c=>c.sql==="COMMIT"));assert.ok(!calls.some(c=>c.sql.includes("INSERT INTO hs_onboarding.child_sessions")));
});
test("five challenge failures remain locked across different source identifiers",async()=>{
  const {service,calls}=fixture({failures:5});
  for(const source of ["synthetic-a","synthetic-b"])
    await rejects(service.start({challengeId:id(4),code:"K7P2QX"},source),"INVALID_OR_EXPIRED_CODE");
  assert.ok(!calls.some(c=>c.sql.startsWith("INSERT INTO hs_onboarding.device_requests")));
});
test("a valid production code grants only a waiting request",async()=>{
  const {service,calls}=fixture();
  const result=await service.start({challengeId:id(4),code:"K7P2QX"},"fixture");
  assert.equal(result.status,"waiting");assert.ok(!("sessionToken" in result));
  assert.ok(!calls.some(c=>c.sql.includes("INSERT INTO hs_onboarding.child_sessions")));
});
for(const status of ["waiting","denied","redeemed"])test(`${status} cannot create a production child session`,async()=>{
  const {service,calls}=fixture({requestStatus:status});
  const work=service.poll({requestId:id(7),requestToken:"a".repeat(43)});
  if(status==="redeemed")await rejects(work,"DEVICE_REQUEST_ALREADY_USED");else assert.equal((await work).status,status);
  assert.ok(!calls.some(c=>c.sql.includes("INSERT INTO hs_onboarding.child_sessions")));
});
test("approval issues a distinct child capability only after revalidating the parent session",async()=>{
  const {service,calls}=fixture();
  const result=await service.poll({requestId:id(7),requestToken:"a".repeat(43)});
  assert.equal(result.status,"approved");assert.match((result as any).sessionToken,/^hs_child_[A-Za-z0-9_-]{43}$/);
  assert.ok(calls.some(c=>c.sql.includes("INSERT INTO hs_onboarding.child_sessions")));
  const ended=fixture({session:false});await rejects(ended.service.poll({requestId:id(7),requestToken:"a".repeat(43)}),"PARENT_SESSION_ENDED");
});
test("parents can revoke their child's devices even after coverage ends",async()=>{
  const {service,calls}=fixture({covered:false,member:false});
  assert.deepEqual(await service.revoke(actor,id(3)),{revoked:true});
  assert.ok(calls.some(c=>c.sql.includes("child_sessions SET revoked_at")));
  assert.ok(!calls.some(c=>c.sql.includes("SELECT DISTINCT t.id")));
});
test("child reads continuously recheck rollout, membership and coverage",async()=>{
  for(const option of ["allowed","member","covered"] as const){
    const {service}=fixture({[option]:false});
    await assert.rejects(service.ownSession(`hs_child_${"a".repeat(43)}`));
  }
});
test("starting a child session discards in-memory parent authority",()=>{
  const token=`e30.${Buffer.from(JSON.stringify({sub:actor.authId,session_id:actor.sessionId})).toString("base64url")}.fixture`;
  parentVerificationSession.save(token,"a".repeat(43),600);
  assert.ok(Object.keys(parentVerificationSession.headers(token)).length);
  childSkinSession.save(`hs_child_${"b".repeat(43)}`);
  assert.deepEqual(parentVerificationSession.headers(token),{});childSkinSession.clear();
});
