/** Real controls, HTTP services and disposable loopback SQL. Synthetic sign-in only. */
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createStaffFixture } from "../server/tests/helpers/highSchoolStaffFixture";
import { registerHighSchoolStaffRoutes } from "../server/highSchoolStaffHttp";
import { registerSchoolLeagueManagement } from "../server/schoolLeagueManagementHttp";
import { SchoolLeagueManagement } from "../server/schoolLeagueManagement";
import { OnboardingError } from "../server/highSchoolOnboarding";

const fixture = await createStaffFixture(), {pool,ids,actors:a,staff,events,chat} = fixture;
const league=new SchoolLeagueManagement(pool);
const out="generated-artifacts/school-player-eligibility",root=process.cwd();
let browser:any,server:any;
try {
  await mkdir(out,{recursive:true});
  await pool.query("ALTER TABLE public.teams ADD COLUMN league_id varchar");
  await pool.query("INSERT INTO public.leagues(id,name,league_type,commissioner_id) VALUES($1,'Fixture League','high_school',$2)",[ids.league,a.league.authId]);
  const event=await events.create(a.head,ids.varsity,{title:"Future fixture game",startsAt:new Date(Date.now()+86400000).toISOString()});
  const app=express();app.use(express.json());
  const authenticate=async(req:express.Request)=>{
    const key=req.get("authorization")==="Bearer synthetic-league"?"league":req.get("authorization")==="Bearer synthetic-team"?"head":null;
    if(!key)throw new OnboardingError("INVALID_SESSION",401);return a[key];
  };
  registerHighSchoolStaffRoutes(app,staff,events,chat,{} as any,authenticate,true);
  registerSchoolLeagueManagement(app,league,authenticate);
  app.get("/api/fixture/workspace",async(_req,res)=>res.json(await staff.workspace(a.head,ids.varsity)));
  const bundle=await build({bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
    alias:{"@":path.join(root,"client/src"),"@shared":path.join(root,"shared")},
    define:{"import.meta.env":JSON.stringify({PROD:true,DEV:false,VITE_API_BASE_URL:""}),"process.env.NODE_ENV":'"production"'},
    plugins:[{name:"synthetic-auth",setup(b){
      b.onResolve({filter:/(?:^|\/)supabase$/},()=>({path:"supabase",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:`export const clearStaleSession=async()=>{throw Error('Unexpected session clear')};export const supabase={auth:{getSession:async()=>({data:{session:{access_token:window.fixtureToken}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`}));
    }}],
    stdin:{loader:"tsx",resolveDir:root,contents:`
      import React from'react';import{createRoot}from'react-dom/client';
      import{QueryClientProvider,useQuery}from'@tanstack/react-query';
      import{queryClient,apiRequest}from'@/lib/queryClient';
      import{PlayerEligibilityPanel}from'@/components/PlayerEligibilityPanel';
      import{StaffLineupEditor}from'@/components/high-school-skins/StaffLineupEditor';
      import'@/components/high-school-skins/staff-operations.css';
      const mode=new URLSearchParams(location.search).get('mode')||'team';
      window.fixtureToken='synthetic-'+mode;
      const teamId=${JSON.stringify(ids.varsity)},leagueId=${JSON.stringify(ids.league)},eventId=${JSON.stringify(event.id)};
      function Fixture(){
        const data=useQuery({queryKey:['hs-staff','fixture',teamId,'workspace'],queryFn:async()=>(await apiRequest('GET','/api/fixture/workspace')).json()});
        return <main className="bg-background text-foreground p-4" style={{maxWidth:1000,margin:'auto'}}>
          <PlayerEligibilityPanel mode={mode} id={mode==='league'?leagueId:teamId}/>
          {mode==='team'&&data.data&&<section className="tss-staff mt-4"><StaffLineupEditor teamId={teamId}
            event={data.data.events.find(e=>e.id===eventId)} data={data.data} staffKey={['hs-staff','fixture',teamId]}
            pending={false} request={async({method,path,body})=>(await apiRequest(method,path,body)).json()}
            close={()=>{}} onSuccess={value=>{window.fixtureSaved=value}}/></section>}
        </main>;
      }
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><Fixture/></QueryClientProvider>);
    `},loader:{".css":"empty"}});
  app.get("/fixture.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));
  const styles=(await readdir("dist/public/assets")).filter(name=>name.endsWith(".css"));
  app.get("/fixture.css",async(_req,res)=>res.type("css").send((await Promise.all(styles.map(name=>readFile(`dist/public/assets/${name}`,"utf8")))).join("\n")));
  app.get("/",(_req,res)=>res.type("html").send('<!doctype html><html class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'));
  server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const leaguePage=await browser.newPage({viewport:{width:1280,height:1000}}),coachPage=await browser.newPage({viewport:{width:402,height:874}});
  const errors:string[]=[];
  for(const page of [leaguePage,coachPage])page.on("pageerror",e=>errors.push(e.message));
  await coachPage.goto(`${origin}/?mode=team`);await coachPage.getByRole("heading",{name:"Player eligibility",exact:true}).waitFor();
  const coachPlayer=coachPage.locator("article").filter({has:coachPage.getByRole("heading",{name:"child1 Synthetic",exact:true})});
  assert.equal(await coachPage.getByRole("heading",{name:"child2 Synthetic",exact:true}).count(),0);
  await coachPlayer.getByLabel("Reason for restricting child1 Synthetic").fill("Coach review");
  await coachPlayer.getByRole("button",{name:"Restrict at team level",exact:true}).click();
  await coachPlayer.getByText("Ineligible",{exact:true}).waitFor();
  await coachPage.getByRole("button",{name:"Dress",exact:true}).waitFor();
  assert.equal(await coachPage.getByRole("button",{name:"Dress",exact:true}).isDisabled(),true);
  await leaguePage.goto(`${origin}/?mode=league`);
  const leaguePlayer=leaguePage.locator("article").filter({has:leaguePage.getByRole("heading",{name:"child1 Synthetic",exact:true})});
  await leaguePlayer.getByLabel("Reason for restricting child1 Synthetic").fill("League review");
  await leaguePlayer.getByRole("button",{name:"Restrict at league level",exact:true}).click();
  await leaguePlayer.getByRole("button",{name:"Clear league restriction",exact:true}).waitFor();
  await coachPage.getByRole("button",{name:"Refresh player eligibility",exact:true}).click();
  await coachPlayer.getByText("League review",{exact:true}).waitFor();
  await coachPlayer.getByRole("button",{name:"Clear team restriction",exact:true}).click();
  await coachPlayer.getByRole("button",{name:"Restrict at team level",exact:true}).waitFor();
  assert.equal(await coachPlayer.getByText("Ineligible",{exact:true}).count(),1);
  assert.equal(await coachPage.getByRole("button",{name:"Clear league restriction",exact:true}).count(),0);
  await coachPage.getByRole("button",{name:"Save lineup",exact:true}).click();
  await coachPage.waitForFunction(()=>window.fixtureSaved?.type==="success");
  assert.ok((await events.lineup(a.head,ids.varsity,event.id!)).entries.every(e=>e.state==="scratch"));
  assert.equal(await coachPage.getByText("Program call-ups",{exact:true}).count(),0);
  assert.equal(await coachPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await coachPage.screenshot({path:`${out}/coach-phone.png`,fullPage:true});
  await leaguePage.screenshot({path:`${out}/league-desktop.png`,fullPage:true});
  // Make an actual concurrent update, then submit the stale UI version.
  await league.setEligibility(a.league,ids.league,ids.varsity,ids.child1,{restricted:false,reason:"",version:1});
  await leaguePlayer.getByRole("button",{name:"Clear league restriction",exact:true}).click();
  await leaguePage.getByText("Refresh required before saving",{exact:true}).waitFor();
  assert.equal(await leaguePlayer.getByRole("button",{name:"Clear league restriction",exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({outcome:"passed",checks:[
    "Actual coach and league eligibility controls used real isolated SQL",
    "Coaches saw only their own team and could not clear league restrictions",
    "League restriction stayed effective after the coach cleared a team restriction",
    "Dress was disabled, Scratch saved, and program call-ups were absent",
    "Stale league changes required refresh rather than overwriting newer status",
    "Desktop and phone controls rendered without horizontal overflow",
  ],scope:"Synthetic sign-in; real controls/HTTP/SQL. No production or native-device claims."}));
} finally {await browser?.close();if(server)await new Promise<void>(r=>server.close(()=>r()));await fixture.close();}
