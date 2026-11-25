/** Offline actual-component checks. No Auth provider, registrations, email, or database calls. */
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const production=process.argv.includes("--production");
const output=path.resolve(`generated-artifacts/signup-age-screen${production?"-production":""}`);
const checks:string[]=[];
const errors:string[]=[];
const bundle=await build({
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  loader:{".css":"empty",".png":"dataurl"},alias:{"@assets":path.resolve("attached_assets")},
  define:{"process.env.NODE_ENV":JSON.stringify(production?"production":"development"),
    "import.meta.env.DEV":String(!production),"import.meta.env.PROD":String(production),
    "import.meta.env.VITE_ISOLATED_DEVELOPMENT":JSON.stringify(production?"false":"true")},
  stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{useLocation}from'wouter';
    import Login from'./client/src/pages/Login';import{AuthModal}from'./client/src/components/AuthModal';
    import Under18 from'./client/src/pages/Under18Onboarding';
    function Harness(){const[location]=useLocation();const[open,setOpen]=useState(true);
      if(location==='/under-18'||location==='/under-18/code')return <Under18/>;
      if(location==='/')return <h1>Existing post-signup flow</h1>;
      if(location==='/modal')return <AuthModal open={open} onOpenChange={setOpen}/>;
      return <Login/>;}
    window.__calls=[];window.__toasts=[];
    createRoot(document.getElementById('root')).render(<Harness/>);
  `},
  plugins:[{name:"offline-auth",setup(b){
    b.onResolve({filter:/^@assets\//},()=>({path:"image",namespace:"fixture"}));
    b.onResolve({filter:/^@\/(?:lib\/(?:supabase|queryClient|signupAttributionBrowser|appRouteEntry)|hooks\/use-toast|components\/EmailVerificationModal)$/},a=>({path:a.path,namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({loader:"jsx",resolveDir:process.cwd(),contents:
      a.path==="image"?"export default 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';":
      a.path.endsWith("supabase")?`export async function requireSignupEmailConfirmation(){}
      export const supabase={auth:{
        async signUp(input){window.__calls.push({method:'signup',metadata:input.options?.data});
          if(window.__failSignup)return{data:{user:null,session:null},error:new Error('Synthetic signup error')};
          const user={id:'fixture-adult',identities:[{}],user_metadata:input.options?.data};
          sessionStorage.setItem('fixture-account',JSON.stringify(user));
          return{data:{user,session:null},error:null};},
        async signInWithPassword(){window.__calls.push({method:'signin'});
          return{data:{session:{user:JSON.parse(sessionStorage.getItem('fixture-account')||'{}')}},error:null};}
      }};`:
      a.path.endsWith("queryClient")?`export async function apiRequest(){throw Error('Real API forbidden')};export async function getAuthHeaders(){throw Error('Real API forbidden')};`:
      a.path.endsWith("signupAttributionBrowser")?`export async function signupAttributionMetadata(){return{fixture_attribution:'preserved'}};export function bindSignupAttributionUser(){};`:
      a.path.endsWith("appRouteEntry")?`export function loginDestination(){return '/'};`:
      a.path.endsWith("use-toast")?`export function useToast(){return{toast:v=>window.__toasts.push(v)}};`:
      `import React from'react';export function EmailVerificationModal({open,onVerificationSuccess}){return open?<div style={{position:'fixed',inset:0,zIndex:100,background:'white'}}>Existing email verification<button onClick={onVerificationSuccess}>Complete verification fixture</button></div>:null;}`
    }));
  }}]
});
let css=await readFile("client/src/components/high-school-onboarding/onboarding.css","utf8");
try{const dir="dist/public/assets";const file=(await readdir(dir)).find(f=>f.endsWith(".css"));if(file)css=(await readFile(path.join(dir,file),"utf8"))+"\n"+css;}catch{}
css+="\n"+await readFile("client/src/components/high-school-onboarding/age-confirmation.css","utf8");
const app=express();
app.get("/test.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));
app.get("/test.css",(_req,res)=>res.type("css").send(css));
app.get("*",(_req,res)=>res.type("html").send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>'));
const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.on("listening",r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try{
  for(const form of ["login","modal"]){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    await page.goto(origin+(form==="login"?"/login?signup=1":"/modal"));
    if(form==="modal")await page.getByTestId("button-toggle-mode").click();
    assert.equal(await page.getByText("I am 18 or older",{exact:true}).count(),0);
    await page.getByRole("heading",{name:"Are you 18 or older?",exact:true}).waitFor();
    if(production&&form==="login")await page.screenshot({path:output+"-age.png",fullPage:true});
    assert.equal(await page.getByTestId("input-email").count(),0);
    assert.equal(await page.getByTestId("input-password").count(),0);
    assert.equal(await page.getByRole("button",{name:"Continue",exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>(window as any).__calls.length),0);
    assert.equal(await page.locator(".hsy-progress,.hsy-count").count(),0);
    await page.getByRole("button",{name:"Back",exact:true}).click();
    if(form==="login"){
      assert.equal(await page.getByTestId("input-email").count(),0);
      await page.getByTestId("button-login-initial").click();
    }
    assert.equal(await page.getByTestId("button-submit").textContent(),"Sign In");
    await page.getByTestId("button-toggle-mode").click();
    await page.getByRole("heading",{name:"Are you 18 or older?",exact:true}).waitFor();
    assert.equal(await page.getByTestId("input-email").count(),0);
    await page.getByRole("button",{name:"Yes, I'm 18 or older",exact:true}).click();
    await page.waitForFunction(()=>{
      const option=document.querySelector(".is-selected");
      return option&&getComputedStyle(option).borderTopColor==="rgb(37, 99, 235)"
        &&getComputedStyle(option).backgroundColor==="rgb(239, 246, 255)";
    });
    const geometry=await page.evaluate(()=>{
      const option=document.querySelector(".is-selected") as HTMLElement;
      const title=document.querySelector("#age-confirmation-title") as HTMLElement;
      const action=document.querySelector(".age-confirmation-continue") as HTMLElement;
      const style=getComputedStyle(option);
      return{height:option.getBoundingClientRect().height,x:option.getBoundingClientRect().left,
        border:style.borderTopWidth,color:style.borderTopColor,background:style.backgroundColor,
        titleSize:getComputedStyle(title).fontSize,titleWeight:getComputedStyle(title).fontWeight,
        button:action.getBoundingClientRect().height,bottom:innerHeight-action.getBoundingClientRect().bottom,
        overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.deepEqual(geometry,{height:64,x:20,border:"2px",color:"rgb(37, 99, 235)",background:"rgb(239, 246, 255)",
      titleSize:"28px",titleWeight:"800",button:52,bottom:36,overflow:false});
    await page.getByRole("button",{name:"No, I'm under 18",exact:true}).click();
    assert.equal(await page.getByTestId("input-email").count(),0);
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>(window as any).__calls.length),0);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem("fixture-account")),null);
    if(production){
      assert.equal(await page.getByRole("button",{name:"I have a code from my parent"}).count(),0);
      await page.reload();
      await page.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
      await page.goto(origin+"/under-18/code?challengeId=synthetic");
      await page.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
      assert.equal(await page.locator("input").count(),0);
      assert.equal(await page.evaluate(()=>(window as any).__calls.length),0);
      checks.push(form+"_production_direct_code_route_has_no_pairing_or_account_creation");
    }
    checks.push(form+"_age_precedes_credentials_and_no_never_requests_them");
    await page.goto(origin+(form==="login"?"/login?signup=1":"/modal"));
    if(form==="modal")await page.getByTestId("button-toggle-mode").click();
    await page.getByRole("button",{name:"Yes, I'm 18 or older",exact:true}).click();
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    if(form==="login"){
      await page.getByRole("heading",{name:"Create your account",exact:true}).waitFor();
      await page.getByText("Enter your email and choose a password to set up your account.",{exact:true}).waitFor();
    }
    await page.getByTestId("input-email").fill("synthetic@example.invalid");
    await page.getByTestId("input-password").fill("Synthetic-only-123!");
    assert.equal(await page.evaluate(()=>(window as any).__calls.length),0);
    if(form==="login")await page.evaluate(()=>(window as any).__failSignup=true);
    await page.getByTestId("button-submit").click();
    if(form==="login"){
      await page.waitForFunction(()=>(window as any).__toasts.some((t:any)=>t.description==="Synthetic signup error"));
      assert.equal(await page.getByRole("heading",{name:"Are you 18 or older?",exact:true}).count(),0);
      await page.getByTestId("input-email").waitFor();
      await page.evaluate(()=>(window as any).__failSignup=false);
      await page.getByTestId("button-submit").click();
      await page.getByRole("button",{name:"Complete verification fixture"}).click();
      await page.getByRole("heading",{name:"Existing post-signup flow",exact:true}).waitFor();
    }else{
      await page.getByRole("button",{name:"Complete verification fixture"}).click();
      await page.getByRole("dialog").waitFor({state:"hidden"});
    }
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem("fixture-account")!).user_metadata.signup_age_answer),"adult");
    if(form==="login")assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem("fixture-account")!).user_metadata.fixture_attribution),"preserved");
    checks.push(form+"_adult_answer_saved_on_creation_without_changing_existing_handoff");
    await page.goto(origin+(form==="login"?"/login":"/modal"));
    if(form==="login")await page.getByTestId("button-login-initial").click();
    assert.equal(await page.getByText("Enter your email and choose a password to set up your account.",{exact:true}).count(),0);
    await page.getByTestId("input-email").fill("synthetic@example.invalid");
    await page.getByTestId("input-password").fill("Synthetic-only-123!");
    await page.getByTestId("button-submit").click();
    await page.waitForFunction(()=>(window as any).__calls.some((c:any)=>c.method==="signin"));
    assert.equal(await page.getByRole("heading",{name:"Are you 18 or older?",exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==="signup").length),0);
    checks.push(form+"_returning_signin_does_not_ask_age_again");
    await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{
  await browser.close();await new Promise<void>(r=>server.close(()=>r()));
  await mkdir(output,{recursive:true});
  const report={scope:`Actual Login/AuthModal with ${production?"production":"development"} flags and synthetic provider; not live/native acceptance`,checks,browserErrors:errors,realRegistrations:0};
  await writeFile(path.join(output,"result.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
