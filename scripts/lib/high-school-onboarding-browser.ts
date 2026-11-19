import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, type Page } from "playwright-core";
import { mkdir,writeFile,readFile,readdir } from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";

export async function verifyOnboardingBrowser(input:{
  app:Express;origin:string;token:string;staffToken:string;programId:string;teamId:string;teamCode:string;
  code():string;allowFixtureResend():Promise<void>;onProgress?(name:string):void;
}){
  const out=path.resolve("generated-artifacts/high-school-onboarding/browser");await mkdir(out,{recursive:true});
  const store=path.resolve("client/src/lib/parentVerificationSession.ts");
  const bundled=await build({bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",loader:{".png":"dataurl"},
    define:{"process.env.NODE_ENV":'"development"',"import.meta.env.DEV":"true","import.meta.env.VITE_ISOLATED_DEVELOPMENT":'"true"',"import.meta.env.VITE_API_BASE_URL":'""'},
    stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
      import React from'react';import{createRoot}from'react-dom/client';import{useLocation}from'wouter';
      import Wizard from'./client/src/pages/HighSchoolOnboarding';
      import Verify from'./client/src/pages/ParentVerification';
      import Login from'./client/src/pages/Login';import{AuthModal}from'./client/src/components/AuthModal';
      import Preview from'./client/src/pages/HighSchoolOnboardingPreview';
      function Harness(){const[location]=useLocation();return location==='/__hs-test/preview'?<Preview/>:location==='/__hs-test/login'?<Login/>:location==='/__hs-test/modal'?<AuthModal open onOpenChange={()=>{}}/>:location==='/high-school/parent-verification'?<Verify/>:<Wizard/>;}
      createRoot(document.getElementById('root')).render(<Harness/>);`},
    plugins:[{name:"private-onboarding-auth",setup(b){
      b.onResolve({filter:/(?:^@\/lib\/|^\.\/)(?:queryClient|supabase)$/},args=>({path:"@/lib/"+args.path.split("/").at(-1),namespace:"private-fixture"}));
      b.onLoad({filter:/.*/,namespace:"private-fixture"},args=>({resolveDir:process.cwd(),loader:"js",contents:args.path.endsWith("supabase")?`
        export const supabase={auth:{getSession:async()=>({data:{session:{access_token:window.__hsToken}}}),signOut:async()=>({error:null}),
          signUp:async()=>{window.__hsSignups=(window.__hsSignups||0)+1;throw Error('Synthetic verifier never registers accounts from the browser');}}};`:`
        import{parentVerificationSession as store}from ${JSON.stringify(store)};
        export class ApiError extends Error{constructor(status,data){super('Request failed');this.status=status;this.data=data;}}
        export async function getAuthHeaders(){return{Authorization:'Bearer '+window.__hsToken,...store.headers(window.__hsToken)}}
        export async function apiRequest(method,url,data){const res=await fetch(url,{method,headers:{...await getAuthHeaders(),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});if(!res.ok)throw new ApiError(res.status,await res.json());return res;}`}));
    }}],
  });
  const js=bundled.outputFiles[0].text;assert.ok(!js.includes(input.token)&&!js.includes(input.staffToken));
  await writeFile(path.join(out,"page.js"),js);
  let css="body{font:16px system-ui;margin:0}section{max-width:660px;margin:auto}input,select,button{font:inherit;padding:10px;box-sizing:border-box}input:not([type=checkbox]),select{width:100%}fieldset{margin:12px 0}button{cursor:pointer}";
  try{const dir=path.resolve("dist/public/assets");const file=(await readdir(dir)).find(f=>f.endsWith(".css"));if(file)css=await readFile(path.join(dir,file),"utf8");}catch{}
  input.app.get("/__hs-test/page.js",(_q,r)=>{r.type("application/javascript").send(js);});
  input.app.get("/__hs-test/page.css",(_q,r)=>{r.type("text/css").send(css);});
  const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__hs-test/page.css"><div id="root"></div><script src="/__hs-test/page.js"></script>`;
  for(const entry of ["/__hs-test","/__hs-test/login","/__hs-test/modal","/__hs-test/preview","/","/high-school/parent-verification"])input.app.get(entry,(_q,r)=>{r.type("html").send(html);});
  const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const checks:string[]=[];const mark=(name:string)=>{checks.push(name);input.onProgress?.(name);};
  let diagnosticPage:Page|undefined;
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(token=>{(window as any).__hsToken=token;},input.token);
    const page=await context.newPage();diagnosticPage=page;let errors=0,chooseCalls=0;
    page.on("pageerror",()=>errors++);page.on("request",r=>{if(new URL(r.url()).pathname.endsWith("/choose"))chooseCalls++;});
    await page.route("**/*",r=>new URL(r.request().url()).origin===input.origin||r.request().url().startsWith("data:")?r.continue():r.abort());
    for(const kind of ["login","modal"]){
      await page.goto(`${input.origin}/__hs-test/${kind}?signup=1`);
      input.onProgress?.(`checking_actual_${kind}_signup_surface`);
      if(kind==="modal")await page.getByTestId("button-toggle-mode").click();
      await page.getByRole("button",{name:"No, I am under 18",exact:true}).click();
      await page.getByTestId("input-email").fill("synthetic@example.com");
      await page.getByTestId("input-password").fill("NotARealCredential1!");
      assert.equal(await page.getByTestId("button-submit").isDisabled(),true);
      await page.locator("form").evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
      assert.equal(await page.evaluate(()=>(window as any).__hsSignups||0),0);
    }
    mark("both_actual_signup_surfaces_block_underage_programmatic_submit_before_auth_sdk");
    await page.goto(`${input.origin}/__hs-test`);
    await page.getByRole("button",{name:"No, I am under 18",exact:true}).click();
    await page.getByText("Ask a parent to set up your account",{exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:/Parent of a player/}).count(),0);
    assert.equal(chooseCalls,0);
    await page.getByRole("button",{name:"Get a parent setup link"}).click();
    assert.match(await page.getByLabel("Parent setup link").inputValue(),/\/login\?signup=1$/);
    mark("under_18_cannot_start_a_path_and_gets_parent_setup_link");
    await page.getByRole("button",{name:"Yes, I am 18+",exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,"phone-entry.png"),fullPage:true});
    await page.clock.install();
    await page.getByRole("button",{name:/Parent of a player/}).click();
    await page.getByRole("link",{name:"Verify parent access",exact:true}).click();
    await page.getByRole("button",{name:"Email a verification code",exact:true}).click();
    await page.getByLabel("Four-digit email code").waitFor();
    await page.getByLabel("Four-digit email code").fill(input.code());
    await page.getByRole("button",{name:"Verify email code",exact:true}).click();
    await page.getByRole("link",{name:"Continue to the app",exact:true}).click();
    await page.getByRole("heading",{name:"Set up your players"}).waitFor();
    mark("parent_selection_requires_actual_session_bound_email_grant_before_player_intake");
    assert.equal(await page.getByRole("textbox",{name:/email|phone|address|date of birth/i}).count(),0);
    await page.getByLabel("First name 1",{exact:true}).fill("Browser");
    await page.getByLabel("Last name 1",{exact:true}).fill("Fixture");
    assert.equal(await page.getByRole("button",{name:"Save players and consent",exact:true}).isDisabled(),true);
    for(let i=0;i<3;i++)await page.getByRole("button",{name:"Add another player",exact:true}).click();
    assert.equal(await page.getByRole("button",{name:"Add another player",exact:true}).isDisabled(),true);
    await page.getByText("Four-player limit reached. A fifth player cannot be added.",{exact:true}).waitFor();
    for(const n of [4,3,2])await page.getByRole("button",{name:`Remove player ${n}`,exact:true}).click();
    assert.equal(await page.getByLabel("Allow a player photo to be shown to the team (optional)").isChecked(),false);
    assert.equal(await page.getByLabel("Allow the player's name in public results (optional)").isChecked(),false);
    await page.getByLabel("Consent for player 1",{exact:true}).check();
    await page.getByLabel("I am the authorized adult guardian for these players.",{exact:true}).check();
    await page.getByRole("button",{name:"Save players and consent",exact:true}).click();
    await page.getByText("Player intake and versioned consent saved privately. No child profile is active.",{exact:true}).waitFor();
    await page.clock.fastForward(600_001);
    await page.getByRole("link",{name:"Verify parent access",exact:true}).waitFor();
    assert.equal(await page.getByLabel("First name 1",{exact:true}).count(),0);
    await input.allowFixtureResend();
    await page.getByRole("link",{name:"Verify parent access",exact:true}).click();
    await page.getByRole("button",{name:"Email a verification code",exact:true}).click();
    await page.getByLabel("Four-digit email code").waitFor();
    await page.getByLabel("Four-digit email code").fill(input.code());
    await page.getByRole("button",{name:"Verify email code",exact:true}).click();
    await page.getByRole("link",{name:"Continue to the app",exact:true}).click();
    await page.getByRole("heading",{name:"Set up your players"}).waitFor();
    assert.equal(await page.getByLabel("First name 1",{exact:true}).inputValue(),"Browser");
    mark("authority_expiry_hides_child_fields_and_verified_return_resumes_server_saved_intake");
    await page.getByLabel("Team code",{exact:true}).fill(input.teamCode);
    await page.getByLabel("First name 1",{exact:true}).fill("Unsaved");
    assert.equal(await page.getByRole("button",{name:"Submit team join",exact:true}).isDisabled(),true);
    await page.getByRole("button",{name:"Reload saved progress",exact:true}).click();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll("input")).some(e=>e.getAttribute("aria-label")==="First name 1"&&e.value==="Browser"));
    await page.getByRole("button",{name:"Submit team join",exact:true}).click();
    await page.getByRole("heading",{name:"Waiting for staff review",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,"phone-parent-pending.png"),fullPage:true});
    mark("four_player_limit_optional_privacy_defaults_consent_resume_and_manual_review_work_in_browser");
    await context.close();
    const staff=await browser.newContext({viewport:{width:1280,height:900}});
    await staff.addInitScript(token=>{(window as any).__hsToken=token;},input.staffToken);
    const screen=await staff.newPage();diagnosticPage=screen;screen.on("pageerror",()=>errors++);
    await screen.route("**/*",r=>new URL(r.request().url()).origin===input.origin||r.request().url().startsWith("data:")?r.continue():r.abort());
    await screen.goto(`${input.origin}/__hs-test`);
    await screen.getByLabel("Staff role",{exact:true}).selectOption("assistant_coach");
    assert.equal(await screen.getByRole("button",{name:"Request a new school or co-op",exact:true}).count(),0);
    await screen.getByLabel("School",{exact:true}).selectOption(input.programId);
    await screen.getByLabel("Team",{exact:true}).selectOption(input.teamId);
    await screen.getByRole("button",{name:"Submit staff request",exact:true}).click();
    await screen.getByRole("heading",{name:"Waiting for staff approval",exact:true}).waitFor();
    await screen.screenshot({path:path.join(out,"desktop-staff-pending.png"),fullPage:true});
    assert.equal(await screen.getByRole("button",{name:/roster|purchase|pay now/i}).count(),0);
    assert.equal(errors,0);
    mark("staff_school_team_request_stops_at_approval_without_purchase_or_roster_and_no_javascript_errors");
    await staff.close();
    const demo=await browser.newContext({viewport:{width:390,height:844}});
    const preview=await demo.newPage();let apiCalls=0;
    preview.on("request",r=>{if(new URL(r.url()).pathname.startsWith("/api/"))apiCalls++;});
    await preview.goto(`${input.origin}/__hs-test/preview`);
    await preview.getByRole("button",{name:"Yes, I am 18+",exact:true}).click();
    await preview.getByRole("button",{name:/Parent of a player/}).click();
    await preview.getByRole("button",{name:"View consent screens without granting access",exact:true}).click();
    await preview.getByRole("heading",{name:"Set up your players"}).waitFor();
    assert.equal(await preview.getByRole("button",{name:"Sign out",exact:true}).count(),0);
    assert.equal(await preview.getByRole("button",{name:"Lock parent controls",exact:true}).count(),0);
    assert.equal(apiCalls,0);
    assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await preview.screenshot({path:path.join(out,"phone-review-preview.png"),fullPage:true});
    mark("visual_review_preview_uses_no_api_auth_or_storage_mutations");
    await demo.close();
    return checks;
  }catch(error){
    if(diagnosticPage&&!diagnosticPage.isClosed()){
      const diagnostic={path:new URL(diagnosticPage.url()).pathname,
        headings:await diagnosticPage.locator("h1,h2").allTextContents(),
        testIds:await diagnosticPage.locator("[data-testid]").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-testid"))),
        buttonLabels:await diagnosticPage.getByRole("button").allTextContents()};
      await writeFile(path.join(out,"failure-diagnostic.json"),JSON.stringify(diagnostic,null,2));
      await diagnosticPage.screenshot({path:path.join(out,"failure-screen.png"),fullPage:true,mask:[diagnosticPage.locator("input")]}).catch(()=>{});
    }
    throw error;
  }finally{await browser.close();}
}
