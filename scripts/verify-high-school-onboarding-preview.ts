/** Pure local screen tests: no database, provider Auth, mail or real identities. */
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir,readFile,readdir,writeFile } from "node:fs/promises";
import path from "node:path";

const report:any={scope:"Memory-only DEV screen walkthrough",checks:[],realEmailSent:false};
const out=path.resolve("generated-artifacts/high-school-onboarding-preview");
const mark=(name:string)=>report.checks.push(name);
const built=await build({bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  define:{"process.env.NODE_ENV":'"development"',"import.meta.env.DEV":"true","import.meta.env.VITE_ISOLATED_DEVELOPMENT":'"true"'},
  stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
    import React from'react';import{createRoot}from'react-dom/client';
    import Preview from'./client/src/pages/HighSchoolOnboardingPreview';
    import{parentVerificationSession as store}from'./client/src/lib/parentVerificationSession';
    window.__previewAuthorityRevision=()=>store.snapshot();
    createRoot(document.getElementById('root')).render(<Preview/>);`},
  plugins:[{name:"deny-real-api-and-auth",setup(b){
    b.onResolve({filter:/^@\/lib\/(?:queryClient|supabase)$/},a=>({path:a.path,namespace:"no-provider"}));
    b.onLoad({filter:/.*/,namespace:"no-provider"},a=>({loader:"js",contents:a.path.endsWith("supabase")?
      `const denied=async()=>{window.__unexpectedCalls=(window.__unexpectedCalls||0)+1;throw Error('Auth is unavailable in preview');};export const supabase={auth:{signOut:denied}};`:
      `export class ApiError extends Error{};export async function apiRequest(){window.__unexpectedCalls=(window.__unexpectedCalls||0)+1;throw Error('API is unavailable in preview');}`}));}}]});
const app=express();let apiCalls=0;
app.use("/api",(_q,r)=>{apiCalls++;r.status(503).json({code:"PREVIEW_MUST_NOT_USE_API"});});
app.get("/page.js",(_q,r)=>r.type("application/javascript").send(built.outputFiles[0].text));
let css="";
try{const dir=path.resolve("dist/public/assets"),file=(await readdir(dir)).find(f=>f.endsWith(".css"));if(file)css=await readFile(path.join(dir,file),"utf8");}catch{}
app.get("/page.css",(_q,r)=>r.type("text/css").send(css));
app.get("/",(_q,r)=>r.type("html").send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><div id="root"></div><script src="/page.js"></script>'));
const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.on("listening",r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();let errors=0;
page.on("pageerror",()=>errors++);
await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
async function restart(){await page.getByRole("button",{name:"Choose another path",exact:true}).click();await page.getByRole("button",{name:"Yes, I am 18+",exact:true}).waitFor();}
async function choose(name:RegExp){await page.getByRole("button",{name:"Yes, I am 18+",exact:true}).click();await page.getByRole("button",{name}).click();}
async function parentInfo(){
  await page.getByLabel("Parent or guardian name",{exact:true}).fill("Example Guardian");
  await page.getByLabel("Parent email",{exact:true}).fill("guardian@example.com");
  await page.getByLabel("Setup code (four digits)",{exact:true}).fill("12");
  assert.equal(await page.getByRole("button",{name:"Continue parent preview",exact:true}).isDisabled(),true);
  await page.getByLabel("Setup code (four digits)",{exact:true}).fill("2468");
  assert.equal(await page.getByRole("button",{name:"Continue parent preview",exact:true}).isDisabled(),true);
  await page.getByLabel("I am the parent or guardian, and I am 18 or older.",{exact:true}).check();
  await page.getByRole("button",{name:"Continue parent preview",exact:true}).click();
  await page.getByRole("heading",{name:"Set up your players",exact:true}).waitFor();
  assert.equal(await page.getByLabel("Setup code (four digits)",{exact:true}).count(),0);
}
try{
  await mkdir(out,{recursive:true});await page.goto(origin);
  await page.getByRole("button",{name:"No, I am under 18",exact:true}).click();
  await page.getByRole("button",{name:"My parent is here — enter parent info and setup code",exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await parentInfo();
  assert.equal(await page.getByRole("button",{name:/PlayerContinue/}).count(),0);
  mark("under_18_handoff_has_parent_details_code_and_explicit_parent_attestation_without_child_signup");
  await restart();await choose(/^Player/);
  await page.getByRole("heading",{name:"Player profile",exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByLabel("Adult first name",{exact:true}).fill("Sample");
  await page.getByLabel("Adult last name",{exact:true}).fill("Player");
  await page.getByRole("button",{name:"Next: find a team",exact:true}).click();
  await page.getByRole("heading",{name:"Find a team",exact:true}).waitFor();
  await page.getByRole("button",{name:"Back",exact:true}).click();
  assert.equal(await page.getByLabel("Adult first name",{exact:true}).inputValue(),"Sample");
  await page.getByRole("button",{name:"Next: find a team",exact:true}).click();
  await page.getByRole("button",{name:"Preview team request",exact:true}).click();
  await page.getByRole("heading",{name:"Preview complete",exact:true}).waitFor();
  mark("player_path_continues_through_profile_team_and_pending_request_with_back_navigation");
  await restart();await choose(/^Captain or league admin/);
  await page.getByLabel("Organizer role",{exact:true}).selectOption("league_manager");
  await page.getByLabel("Adult first name",{exact:true}).fill("Sample");
  await page.getByLabel("Adult last name",{exact:true}).fill("Organizer");
  await page.getByRole("button",{name:"Next: team or league setup",exact:true}).click();
  await page.getByLabel("Team, league or event name",{exact:true}).fill("Fictional Preview League");
  await page.getByRole("button",{name:"Preview setup request",exact:true}).click();
  await page.getByRole("heading",{name:"Preview complete",exact:true}).waitFor();
  mark("organizer_path_preserves_role_options_and_continues_without_real_administrative_grants");
  await restart();await choose(/^Coach or school staff/);
  await page.getByLabel("Staff role",{exact:true}).selectOption("assistant_coach");
  await page.getByLabel("School",{exact:true}).selectOption("00000000-0000-4000-8000-000000000002");
  await page.getByLabel("Team",{exact:true}).selectOption("00000000-0000-4000-8000-000000000003");
  await page.getByRole("button",{name:"Submit staff request",exact:true}).click();
  await page.getByRole("heading",{name:"Preview: Waiting for staff approval",exact:true}).waitFor();
  mark("staff_path_continues_through_school_team_and_pending_approval");
  await restart();await choose(/^Parent of a player/);await parentInfo();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByLabel("First name 1",{exact:true}).fill("Fictional");
  await page.getByLabel("Last name 1",{exact:true}).fill("Player");
  await page.getByLabel("Consent for player 1",{exact:true}).check();
  await page.getByLabel("I am the authorized adult guardian for these players.",{exact:true}).check();
  await page.getByRole("button",{name:"Save players and consent",exact:true}).click();
  await page.getByLabel("Team code",{exact:true}).fill("PREVIEW");
  await page.getByRole("button",{name:"Submit team join",exact:true}).click();
  await page.getByRole("heading",{name:"Preview: Waiting for staff review",exact:true}).waitFor();
  mark("parent_path_continues_through_handoff_consent_and_pending_team_review");
  await restart();
  assert.equal(await page.getByLabel("Parent email",{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(await page.evaluate(()=>({unexpected:(window as any).__unexpectedCalls||0,authority:(window as any).__previewAuthorityRevision(),local:localStorage.length,session:sessionStorage.length})),{unexpected:0,authority:0,local:0,session:0});
  assert.equal(apiCalls,0);assert.equal(errors,0);
  mark("restart_clears_preview_and_all_paths_make_zero_api_auth_or_storage_mutations");
  report.outcome="passed";
}catch(e:any){report.outcome="failed";report.safeFailureKind=e?.name==="TimeoutError"?"TimeoutError":e?.code==="ERR_ASSERTION"?"AssertionError":"SafeFailure";
  report.failureView={headings:await page.locator("h1,h2").allTextContents(),buttons:await page.getByRole("button").allTextContents()};process.exitCode=1;}
finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await writeFile(path.join(out,"result.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
