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
  await pool.query(await readFile("migrations/0060_school_program_separation.sql", "utf8"));
  await pool.query(await readFile("migrations/0063_school_structure_deletion.sql", "utf8"));
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
   const createdLeagueId=new URL(page.url()).searchParams.get("leagueId")!;
   await page.getByTestId("edit-league-name").click();
   assert.equal(await page.getByLabel("League name",{exact:true}).inputValue(),"Synthetic High School League");
   await page.getByLabel("League name",{exact:true}).fill("Do not save");
   await page.getByTestId("cancel-league-name").click();
   await page.getByRole("heading",{name:"Synthetic High School League",exact:true}).waitFor();
   await page.getByTestId("edit-league-name").click();
   await page.getByLabel("League name",{exact:true}).fill("  ");
   assert.equal(await page.getByTestId("save-league-name").isDisabled(),true);
   await page.getByLabel("League name",{exact:true}).fill("  Renamed High School League  ");
   await page.setViewportSize({width:402,height:874});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${out}/league-name-editor-phone.png`});
   await page.setViewportSize({width:1280,height:1000});
   await page.getByTestId("save-league-name").click();
   await page.getByRole("heading",{name:"Renamed High School League",exact:true}).waitFor();
   assert.equal((await pool.query("SELECT name FROM public.leagues WHERE id=$1",[createdLeagueId])).rows[0].name,"Renamed High School League");
   assert.equal((await pool.query("SELECT count(*)::int n FROM hs_onboarding.leagues WHERE id=$1",[createdLeagueId])).rows[0].n,0);
   const expectSetupStage=async(current:"school"|"program"|"team")=>{
     await page.waitForFunction(step=>document.querySelector(`[data-step-content="${step}"]`)?.getAttribute("data-step-content")===step,current);
     for(const stage of ["school","program","team"]) {
       const tile=page.getByTestId(`setup-count-${stage}`);
       assert.equal(await tile.getAttribute("aria-current"),stage===current?"step":null);
     }
     for(const other of ["school","program","team"].filter(s=>s!==current))
       await page.locator(`[data-step-content="${other}"]`).waitFor({state:"detached"});
   };
   const chooseStep=async(step:"school"|"program"|"team")=>{
     await page.getByRole("button",{name:`${step[0].toUpperCase()+step.slice(1)} step`,exact:true}).click();
     await expectSetupStage(step);
   };
   await expectSetupStage("school");
   assert.equal(await page.getByLabel("Program name",{exact:true}).count(),0);
   assert.equal(await page.getByRole("button",{name:"Add team",exact:true}).count(),0);
   await chooseStep("team");
   assert.equal(await page.getByRole("button",{name:"Add school",exact:true}).count(),0);
   await chooseStep("school");
   assert.equal(await page.getByTestId("school-setup-panel").getAttribute("data-direction"),"backward");
   await page.getByRole("button",{name:"Program step",exact:true}).click();
   await page.getByRole("button",{name:"School step",exact:true}).click();
   await expectSetupStage("school");
   await page.getByLabel("School name",{exact:true}).fill("Fixture School");
   await page.getByLabel("Town",{exact:true}).fill("Fixture Town");
   await expectSetupStage("school");
   await page.getByRole("button",{name:"Add school",exact:true}).click();
   await page.getByRole("heading",{name:"Fixture School",exact:true}).waitFor();
   await expectSetupStage("school");
   assert.equal(await page.getByLabel("Program name",{exact:true}).count(),0);
   const schoolRows=page.getByRole("region",{name:"Existing schools",exact:true});
   let schoolRow=schoolRows.locator("li").first();
   await schoolRow.getByRole("button",{name:"Edit",exact:true}).click();
   await schoolRow.getByLabel("School name",{exact:true}).fill("Edited School");
   await schoolRow.getByLabel("Town",{exact:true}).fill("Edited Town");
   await schoolRow.getByRole("button",{name:"Save",exact:true}).click();
   await page.getByRole("heading",{name:"Edited School",exact:true}).waitFor();
   schoolRow=schoolRows.locator("li").first();
   await schoolRow.getByRole("button",{name:"Edit",exact:true}).click();
   await schoolRow.getByLabel("School name",{exact:true}).fill("Fixture School");
   await schoolRow.getByLabel("Town",{exact:true}).fill("Fixture Town");
   await schoolRow.getByRole("button",{name:"Save",exact:true}).click();
   await page.getByRole("heading",{name:"Fixture School",exact:true}).waitFor();
   await chooseStep("program");
   assert.equal(await page.getByTestId("school-setup-panel").getAttribute("data-direction"),"forward");
   assert.equal(await page.getByRole("button",{name:"Add team",exact:true}).count(),0);
   await page.getByLabel("School for this program",{exact:true}).selectOption({label:"Fixture School · Fixture Town"});
   const addProgramForm=page.getByRole("button",{name:"Add program",exact:true}).locator("..");
   await addProgramForm.getByLabel("Program name",{exact:true}).fill("Hockey");
   await page.route("**/management/programs",route=>route.fulfill({status:500,contentType:"application/json",
     body:JSON.stringify({code:"SYNTHETIC_PROGRAM_FAILURE",message:"Synthetic program creation failed."})}),{times:1});
   await page.getByRole("button",{name:"Add program",exact:true}).click();
   await page.getByRole("alert").filter({hasText:"Synthetic program creation failed."}).waitFor();
   await expectSetupStage("program");
   await page.getByRole("button",{name:"Add program",exact:true}).click();
   await page.getByRole("region",{name:"Existing programs",exact:true}).getByLabel("Program name",{exact:true}).waitFor();
   await expectSetupStage("program");
   await chooseStep("team");
   await page.getByLabel("School for this team",{exact:true}).selectOption({label:"Fixture School · Fixture Town"});
   await page.getByLabel("Program for this team",{exact:true}).selectOption({label:"Hockey"});
   await page.getByLabel("Team name",{exact:true}).fill("Fixture Varsity");
   await page.getByRole("button",{name:"Add team",exact:true}).click();
   await page.getByText("Fixture Varsity",{exact:true}).waitFor();
   await expectSetupStage("team");
   await page.getByTestId("setup-count-team").locator("..").screenshot({path:`${out}/setup-complete.png`});
   await page.reload();
   await expectSetupStage("school");
   // A second admin/device changes the persisted name while this editor is open.
   await page.getByTestId("edit-league-name").click();
   await page.getByLabel("League name",{exact:true}).fill("My stale edit");
   await new SchoolLeagueManagement(pool).rename(actor,createdLeagueId,{
     name:"Updated elsewhere",expectedName:"Renamed High School League",
   });
   await page.getByTestId("save-league-name").click();
   await page.getByTestId("reload-latest-league-name").waitFor();
   assert.equal(await page.getByTestId("save-league-name").isDisabled(),true);
   assert.equal(await page.getByLabel("League name",{exact:true}).inputValue(),"My stale edit");
   await page.getByTestId("reload-latest-league-name").click();
   await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('[data-testid="league-name-input"]')?.value==="Updated elsewhere");
   await page.getByLabel("League name",{exact:true}).fill("Final High School League");
   await page.getByTestId("save-league-name").click();
   await page.getByRole("heading",{name:"Final High School League",exact:true}).waitFor();
   assert.equal((await pool.query("SELECT name FROM hs_onboarding.leagues WHERE id=$1",[createdLeagueId])).rows[0].name,"Final High School League");
   await chooseStep("team");
   await page.getByLabel("School for this team",{exact:true}).selectOption({label:"Fixture School · Fixture Town"});
   await page.getByLabel("Program for this team",{exact:true}).selectOption({label:"Hockey"});
   for (const name of ["Fixture JV", "Fixture Freshman"]) {
     await page.getByLabel("Team name",{exact:true}).fill(name);
     await page.getByRole("button",{name:"Add team",exact:true}).click();
     await page.getByText(name,{exact:true}).waitFor();
   }
   await chooseStep("program");
   await page.getByRole("region",{name:"Existing programs",exact:true}).getByLabel("Program name",{exact:true}).fill("Ice Hockey");
   await page.getByRole("button",{name:"Save program",exact:true}).click();
   await page.getByRole("region",{name:"Existing programs",exact:true}).getByLabel("Program name",{exact:true}).waitFor();
   await addProgramForm.getByLabel("School for this program",{exact:true}).selectOption({label:"Fixture School · Fixture Town"});
   await addProgramForm.getByLabel("Program name",{exact:true}).fill("Girls Hockey");
   await page.getByRole("button",{name:"Add program",exact:true}).click();
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLInputElement>('input')].some(e=>e.value==="Girls Hockey"));
   const schoolRecord = (await pool.query("SELECT id FROM hs_onboarding.schools WHERE name='Fixture School'")).rows[0];
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.programs WHERE school_id=$1", [schoolRecord.id])).rows[0].n,2);
   assert.equal((await pool.query(`SELECT count(*)::int AS n FROM hs_onboarding.teams t JOIN hs_onboarding.programs p ON p.id=t.program_id WHERE p.school_id=$1 AND p.name='Ice Hockey'`, [schoolRecord.id])).rows[0].n,3);
   await page.setViewportSize({width:402,height:874});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
   await chooseStep("school");
   assert.equal(await page.getByLabel("Program name",{exact:true}).count(),0);
   assert.equal(await page.getByLabel("Team name",{exact:true}).count(),0);
   await page.screenshot({path:`${out}/school-hierarchy-phone.png`,fullPage:true});
   const structure=new SchoolLeagueManagement(pool);
   const deletionSchool=await structure.school(actor,createdLeagueId,{name:"Delete Fixture School",town:"Town"});
   const deletionProgram=await structure.program(actor,createdLeagueId,{name:"Delete Program",schoolId:deletionSchool.id});
   await structure.team(actor,createdLeagueId,{name:"Delete Team",programId:deletionProgram.id});
   await page.reload();await expectSetupStage("school");
   const deletionRow=schoolRows.locator("li").filter({has:page.getByRole("heading",{name:"Delete Fixture School",exact:true})});
   await deletionRow.getByRole("button",{name:"Delete",exact:true}).click();
   const confirmDelete=page.getByRole("button",{name:"Delete school and linked records",exact:true});
   await confirmDelete.waitFor();assert.equal(await confirmDelete.isDisabled(),true);
   await page.getByRole("button",{name:"Cancel",exact:true}).click();
   assert.equal((await structure.workspace(actor,createdLeagueId)).schools.some(s=>s.id===deletionSchool.id),true);
   await deletionRow.getByRole("button",{name:"Delete",exact:true}).click();
   await confirmDelete.waitFor();
   await page.getByLabel("Type school name to confirm deletion",{exact:true}).fill("Delete Fixture School");
   await page.screenshot({path:`${out}/school-deletion-warning-phone.png`});
   await confirmDelete.click();
   await page.getByRole("heading",{name:"Delete Fixture School",exact:true}).waitFor({state:"detached"});
   const remaining=await structure.workspace(actor,createdLeagueId);
   assert.equal(remaining.programs.length,2);assert.equal(remaining.teams.length,3);
   await expectSetupStage("school");
   for(const [step,count]of [["school",1],["program",2],["team",3]] as const)
     assert.equal(await page.getByTestId(`setup-count-${step}`).locator(".font-mono").innerText(),String(count));
   await page.emulateMedia({reducedMotion:"reduce"});
   await chooseStep("program");
   assert.equal(await page.locator('[data-step-content="program"]').evaluate(el=>{
     const transform=getComputedStyle(el).transform;
     return transform==="none"?0:new DOMMatrixReadOnly(transform).m41;
   }),0);
   await chooseStep("school");await page.emulateMedia({reducedMotion:"no-preference"});
   await page.setViewportSize({width:1280,height:1000});
   await page.screenshot({path:`${out}/school-management.png`});
   await page.getByRole("button",{name:"People & requests",exact:true}).click();
   await page.getByLabel("Team",{exact:true}).selectOption({label:"Fixture School / Ice Hockey / Fixture Varsity"});
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
   await page.getByRole("button",{name:"People & requests",exact:true}).click();
   await page.getByRole("button",{name:"Approve",exact:true}).click();
   await page.getByRole("status").filter({hasText:"Request approved"}).waitFor();
   assert.equal((await pool.query("SELECT role FROM public.team_memberships WHERE user_id=$1 AND role='head_coach'",[fixture.actors.applicant.authId])).rows.length,1);
   await page.getByRole("button",{name:"Schedule",exact:true}).click();
   await page.getByLabel("Team",{exact:true}).selectOption({label:"Fixture School / Ice Hockey / Fixture Varsity"});
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
