/** Real league form, account boundary, request client, parent screen and SQL
 * grants. Synthetic provider/mail/rink and league persistence; loopback only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile, readdir, mkdir } from "node:fs/promises";
import express from "express";
import cookieParser from "cookie-parser";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { leagueTypeSchema } from "../shared/leagueType";
import { createStaffFixture } from "../server/tests/helpers/highSchoolStaffFixture";
import { HighSchoolParentSecurity } from "../server/highSchoolParentSecurity";
import { registerParentVerificationRoutes, parentGrantHeader, requireDevParentAuthority, parentErrorResponse } from "../server/highSchoolParentHttp";
import { SchoolLeagueManagement } from "../server/schoolLeagueManagement";
import { registerSchoolLeagueManagement } from "../server/schoolLeagueManagementHttp";
import { HighSchoolOnboarding } from "../server/highSchoolOnboarding";

process.env.NODE_ENV="development";
const fixture=await createStaffFixture(),{pool,actors}=fixture,actor=actors.parent;
const issuer="https://synthetic-league-parent.example/auth/v1";
const token=`fixture.${Buffer.from(JSON.stringify({sub:actor.authId,session_id:actor.sessionId,iss:issuer,aud:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")}.fixture`;
const mail:string[]=[];
const security=new HighSchoolParentSecurity(pool,async value=>{mail.push(value.code);});
const out="generated-artifacts/league-parent-continuation",root=process.cwd();
let browser:any,server:any,backendServer:any,created=0,denied=false,leagueAttempts=0;
const createdTypes:string[]=[];
const calls:{path:string;service:string}[]=[];
try {
  await pool.query(`
    ALTER TABLE public.teams ADD COLUMN league_id varchar;
    CREATE TABLE hs_parent_security.grants(token_digest text PRIMARY KEY,auth_id uuid,session_id uuid,purpose text,expires_at timestamptz,consumed boolean DEFAULT false);
    CREATE TABLE hs_parent_security.audit(auth_id uuid,session_id uuid,event text,created_at timestamptz DEFAULT now());
    CREATE TABLE hs_parent_security.challenges(id uuid PRIMARY KEY,auth_id uuid,session_id uuid,purpose text,code_digest text,expires_at timestamptz,
      attempts int DEFAULT 0,delivered boolean DEFAULT false,consumed boolean DEFAULT false,created_at timestamptz DEFAULT now());
    CREATE TABLE hs_parent_security.version(version int);
  `);
  const frontend=express(),backend=express();
  let origin="";
  for(const [app,service] of [[frontend,"frontend"],[backend,"backend"]] as const){
    app.use(express.json());app.use(cookieParser());
    app.use("/api",(req,res,next)=>{
      calls.push({path:req.originalUrl,service});
      res.setHeader("Access-Control-Allow-Origin",origin);
      res.setHeader("Access-Control-Allow-Headers","authorization,content-type,x-parent-device-id,x-parent-verification");
      res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
      if(req.method==="OPTIONS"){res.sendStatus(204);return;}next();
    });
    registerParentVerificationRoutes(app,security,async req=>{
      assert.equal(req.get("authorization"),`Bearer ${token}`);return actor;
    });
    app.post("/api/leagues",async(req,res)=>{
      leagueAttempts++;
      try{
        assert.equal(req.get("authorization"),`Bearer ${token}`);
        await requireDevParentAuthority(security,actor.authId,token,issuer,req.get(parentGrantHeader),"adult_account");
        if(denied){res.status(403).json({code:"LEAGUE_MANAGEMENT_REQUIRED",message:"League management permission required."});return;}
        assert.equal(req.body.facilityId,"synthetic-rink");
        createdTypes.push(leagueTypeSchema.parse(req.body.leagueType));
        const id=randomUUID();
        await pool.query("INSERT INTO public.leagues(id,name,commissioner_id,league_type) VALUES($1,$2,$3,$4)",[id,req.body.name,actor.authId,req.body.leagueType]);
        created++;res.json({id,name:req.body.name,leagueType:req.body.leagueType});
      }catch(error){parentErrorResponse(res,error);}
    });
    app.get("/api/leagues/:id",async(req,res)=>res.json((await pool.query("SELECT id,name,league_type AS \"leagueType\" FROM public.leagues WHERE id=$1",[req.params.id])).rows[0]));
    app.get("/api/high-school/test-access",(_req,res)=>res.json({enabled:true}));
    registerSchoolLeagueManagement(app,new SchoolLeagueManagement(pool),async req=>{
      assert.equal(req.get("authorization"),`Bearer ${token}`);return actor;
    });
    app.use("/api",(_req,res)=>res.status(404).json({code:"UNEXPECTED_API"}));
  }
  backendServer=backend.listen(0,"127.0.0.1");await new Promise<void>(resolve=>backendServer.once("listening",resolve));
  const backendOrigin=`http://127.0.0.1:${backendServer.address().port}`;
  const bundle=await build({bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
    alias:{"@":path.join(root,"client/src"),"@shared":path.join(root,"shared"),"@assets":path.join(root,"attached_assets")},
    loader:{".css":"empty",".png":"dataurl",".jpg":"dataurl"},
    define:{"import.meta.env":JSON.stringify({PROD:true,DEV:false,VITE_API_BASE_URL:backendOrigin}),"process.env.NODE_ENV":'"production"'},
    plugins:[{name:"synthetic-provider-and-unrelated-screens",setup(b){
      b.onResolve({filter:/(?:^|\/)supabase$/},()=>({path:"supabase",namespace:"fixture"}));
       b.onResolve({filter:/pages\/LeagueManagement$/},()=>({path:"adult-management",namespace:"fixture"}));
      b.onResolve({filter:/(?:hooks\/useAuth|hooks\/useDashboardSelection|hooks\/useProductionOnboardingAccess|context\/SubscriptionContext|hooks\/use-toast|components\/RinkPickerField|components\/PageTransition)$/},args=>({path:args.path,namespace:"fixture"}));
      b.onResolve({filter:/(?:^|\/)(?:FamilySetup|FamilyDevices|FamilyStaffReview|ProductionOnboardingTest|HighSchoolYouthOnboarding|ResetPassword|ForgotPassword|TeamSkinBoundary)$/},args=>({path:args.path,namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"tsx",resolveDir:root,contents:
         args.path==="adult-management"?`export default function AdultManagement(){return <h1>Adult league management</h1>}`:
         args.path==="supabase"?`export const clearStaleSession=async()=>{throw Error('Unexpected session clearing')};export const supabase={auth:{getSession:async()=>({data:{session:{access_token:${JSON.stringify(token)}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{throw Error('Unexpected sign-out')}}};`:
        args.path.endsWith("useAuth")?`export const useAuth=()=>({user:{id:${JSON.stringify(actor.authId)}},isAuthenticated:true,isLoading:false});`:
        args.path.endsWith("useDashboardSelection")?`export const useDashboardSelection=()=>({selectedType:null,selectedId:null,clearSelection:()=>{}});`:
        args.path.endsWith("useProductionOnboardingAccess")?`export const useProductionOnboardingAccess=()=>({data:{enabled:false},isLoading:false});`:
        args.path.endsWith("SubscriptionContext")?`export const usePermissions=()=>({canManageLeague:true});`:
        args.path.endsWith("use-toast")?`export const useToast=()=>({toast:value=>window.fixtureToasts.push(value)});`:
        args.path.endsWith("RinkPickerField")?`export function RinkPickerField({onSelect,initialSelection}){return <button type="button" onClick={()=>onSelect({facilityId:'synthetic-rink',name:'Synthetic Rink',address:'Fixture Town'})}>{initialSelection?.name||'Select synthetic rink'}</button>}`:
        args.path.endsWith("PageTransition")?`export const setPageTransitionDirection=()=>{};`:
        `const Empty=()=>null;export default Empty;export const FamilySetup=Empty,FamilyDevices=Empty,FamilyStaffReview=Empty,ProductionOnboardingTest=Empty,ProductionSchoolRuntime=Empty;`
      }));
    }}],
    stdin:{loader:"tsx",resolveDir:root,contents:`
      import React from'react';import{createRoot}from'react-dom/client';import{useLocation}from'wouter';
      import{QueryClientProvider}from'@tanstack/react-query';import{queryClient}from'@/lib/queryClient';
      import{LiveFamilyBoundary}from'./client/src/components/high-school-family/LiveFamilyBoundary';
      import CreateLeague from'./client/src/pages/CreateLeague';import{parentVerificationSession}from'./client/src/lib/parentVerificationSession';
       import LeagueManagementEntry from'./client/src/pages/LeagueManagementEntry';
      window.fixtureToasts=[];window.fixtureParent=parentVerificationSession;
       function Routes(){const[path]=useLocation();return path==='/create-league'?<CreateLeague/>:path==='/league-management'?<LeagueManagementEntry/>:<main>Home</main>}
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}>
        <LiveFamilyBoundary entry={<main>Sign in</main>}><Routes/></LiveFamilyBoundary></QueryClientProvider>);`,
    }});
  frontend.get("/fixture.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));
  frontend.get("/fixture.css",async(_req,res)=>{
    const css=(await readdir("dist/public/assets")).find(name=>/^index-.*\.css$/.test(name))!;
    res.type("css").send(await readFile(`dist/public/assets/${css}`,"utf8"));
  });
  frontend.get("*",(_req,res)=>res.type("html").send('<!doctype html><html class="dark"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>'));
  server=frontend.listen(process.argv.includes("--serve")?3003:0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  page.setDefaultTimeout(15_000);const errors:string[]=[];page.on("pageerror",(error:Error)=>errors.push(error.message));
  await page.route("**/*",route=>[origin,backendOrigin].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  await page.goto(`${origin}/create-league`);
  await page.getByRole("radio",{name:"Adult",exact:true}).waitFor();
  assert.equal(await page.getByRole("radio",{name:"Adult",exact:true}).isChecked(),true);
  await page.getByRole("radio",{name:"High School",exact:true}).check();
  await page.getByTestId("input-league-name").fill("Synthetic High School League");
  await page.getByRole("button",{name:"Select synthetic rink",exact:true}).click();
  await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/league-type-form.png`});
  await page.getByTestId("button-create-league").click();
   await page.getByRole("heading",{name:"Synthetic High School League",exact:true}).waitFor();
  assert.equal(created,1);
   assert.equal(mail.length,0);
   assert.equal(new URL(page.url()).pathname,"/league-management");
   await page.getByLabel("Program or school name",{exact:true}).fill("Fixture School");
   await page.getByLabel("Town",{exact:true}).fill("Fixture Town");
   await page.getByRole("button",{name:"Submit program",exact:true}).click();
   await page.getByLabel("New team name for Fixture School",{exact:true}).fill("Fixture Varsity");
   await page.getByRole("button",{name:"Add team",exact:true}).click();
   await page.getByText("Fixture Varsity",{exact:true}).waitFor();
   await page.screenshot({path:`${out}/school-management.png`});
   await page.getByRole("button",{name:"Manage invitations",exact:true}).click();
   await page.getByLabel("Team",{exact:true}).selectOption({label:"Fixture School — Fixture Varsity"});
   await page.getByLabel("Recipient email",{exact:true}).fill(fixture.actors.applicant.email);
   await page.getByRole("button",{name:"Create manual invitation",exact:true}).click();
   await page.getByText("One-time invitation",{exact:true}).waitFor();
   const staffInvitation=(await page.locator("code").textContent())!;
   assert.match(staffInvitation,/^[A-Za-z0-9_-]{43}$/);
   await page.getByLabel("Invite type",{exact:true}).selectOption("parent");
   await page.getByLabel("Recipient email",{exact:true}).fill(actor.email);
   await page.getByLabel("First name",{exact:true}).fill("Fixture");
   await page.getByLabel("Last name",{exact:true}).fill("Child");
   await page.getByLabel("Grad year",{exact:true}).fill("2032");
   await page.getByRole("button",{name:"Create manual invitation",exact:true}).click();
   await page.getByRole("status").filter({hasText:"Invitation created"}).waitFor();
   await page.setViewportSize({width:402,height:874});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
   await page.screenshot({path:`${out}/school-management-phone.png`,fullPage:true});
   await page.setViewportSize({width:1280,height:1000});
   const intake=new HighSchoolOnboarding(pool,security);intake.staffDecisions=fixture.staff;
   await intake.choose(fixture.actors.applicant,{path:"staff"});
   const applicant=await intake.state(fixture.actors.applicant);
   await intake.lookup(fixture.actors.applicant,staffInvitation,applicant.revision);
   await page.reload();
   await page.getByRole("button",{name:"Manage invitations",exact:true}).click();
   await page.getByRole("button",{name:"Approve",exact:true}).click();
   await page.getByRole("status").filter({hasText:"Request approved"}).waitFor();
   assert.equal((await pool.query("SELECT role FROM public.team_memberships WHERE user_id=$1 AND role='head_coach'",[fixture.actors.applicant.authId])).rows.length,1);
   await page.getByRole("button",{name:"Schedule",exact:true}).click();
   await page.getByLabel("Team",{exact:true}).selectOption({label:"Fixture School — Fixture Varsity"});
   await page.getByLabel("Or paste schedule text",{exact:true}).fill("title,startsAt,opponent,rink,address\nFixture match,2026-12-01T18:00:00-05:00,Opponent,Fixture Rink,Town");
   await page.getByRole("button",{name:"Preview schedule",exact:true}).click();
   await page.getByRole("button",{name:"Import 1 events",exact:true}).click();
   await page.getByRole("status").filter({hasText:/1.*saved|Imported 1/i}).waitFor();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem("roster.pending-league-verification")),null);
  for(const [label,value]of [["Adult","adult"],["Youth","youth"]]){
    await page.goto(`${origin}/create-league`);
    await page.getByRole("radio",{name:label,exact:true}).check();
    await page.getByTestId("input-league-name").fill(`Synthetic ${label} League`);
    await page.getByRole("button",{name:"Select synthetic rink",exact:true}).click();
    await page.getByTestId("button-create-league").click();
     await page.waitForURL(/\/league-management\?leagueId=/);
     await page.getByRole("heading",{name:label==="Adult"?"Adult league management":`Synthetic ${label} League`,exact:true}).waitFor();
    assert.equal(createdTypes.at(-1),value);
  }
  assert.deepEqual(createdTypes,["high_school","adult","youth"]);assert.equal(created,3);
  assert.ok(calls.some(call=>call.path==="/api/leagues"&&call.service==="backend"));
   assert.equal(calls.some(call=>call.path.includes("parent-verification/challenge")),false);
  denied=true;await page.goto(`${origin}/create-league`);
  await page.getByTestId("input-league-name").fill("Denied league");
  await page.getByRole("button",{name:"Select synthetic rink",exact:true}).click();
  await page.getByTestId("button-create-league").click();
  await page.waitForFunction(()=>window.fixtureToasts.some((value:any)=>value.description==="League management permission required."));
  assert.equal(new URL(page.url()).pathname,"/create-league");assert.equal(created,3);
   assert.equal(mail.length,0);assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem("roster.pending-league-verification")),null);
  await page.goto(`${origin}/high-school/parent-verification?returnTo=https://invalid.example`);
   await page.getByRole("button",{name:"Email a verification code",exact:true}).waitFor();
   await page.getByRole("button",{name:"Email a verification code",exact:true}).click();
   await page.getByLabel("Four-digit email code").waitFor();
   assert.equal(mail.length,1);
   await page.goto(`${origin}/high-school/parent-verification?returnTo=create-league`);
   await page.getByTestId("input-league-name").waitFor();
   console.log(JSON.stringify({outcome:"passed",checks:["Adult, High School and Youth creation routed directly to the selected management workspace","Family-enrolled commissioner created league, program and team without parent email proof","Staff and parent invitation forms persisted real recipient-bound codes for manual sharing","A coach redeemed the invitation into a pending request, then the commissioner approved it in the real UI","School management forms fit a phone-width viewport without horizontal overflow","Real schedule preview/import saved events and reported pending notification transport","Separately configured backend received authenticated requests","Unrelated role permission errors stayed denied without starting verification","Parent controls still required email proof; obsolete league-verification links returned to the form"],leagueAttempts,scope:"Disposable SQL, actual form, boundary, entry wrapper, management UI and request client; synthetic provider/mail/rink only"},null,2));
  if(process.argv.includes("--serve")){console.log(`League continuation fixture ready on ${origin}`);await new Promise(()=>{});}
} finally {
  await browser?.close();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(backendServer)await new Promise<void>(resolve=>backendServer.close(()=>resolve()));await fixture.close();
}
