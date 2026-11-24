/** Actual signup/E05 browser checks, with synthetic Auth only. Never sends email. */
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";
import { chromium, type Page } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const out=path.resolve("generated-artifacts/signup-email-verification");
const checks:string[]=[];
const browserErrors:string[]=[];
const bundled=await build({
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  alias:{"@assets":path.resolve("attached_assets")},
  loader:{".css":"empty",".png":"dataurl"},
  define:{"process.env.NODE_ENV":'"development"',"import.meta.env.DEV":"true","import.meta.env.VITE_ISOLATED_DEVELOPMENT":'"true"'},
  stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{useLocation}from'wouter';
    import Login from'./client/src/pages/Login';import{AuthModal}from'./client/src/components/AuthModal';
    function Harness(){const[open,setOpen]=useState(true);const[location]=useLocation();
      if(location==='/modal')return open?<AuthModal open onOpenChange={setOpen}/>:<h1>Verified modal account</h1>;
      if(location==='/')return <h1>Signed-in account</h1>;
      return <Login/>;}
    window.__calls=[];window.__toasts=[];window.__mode='normal';
    createRoot(document.getElementById('root')).render(<Harness/>);
  `},
  plugins:[{name:"synthetic-auth",setup(b){
    b.onResolve({filter:/^@\/(?:lib\/(?:supabase|signupAttributionBrowser|appRouteEntry)|hooks\/use-toast)$/},a=>({path:a.path,namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({loader:"js",contents:
      a.path.endsWith("supabase")?`
        export async function requireSignupEmailConfirmation(){
          window.__calls.push({method:'settings'});
          if(window.__mode==='autoconfirm')throw Error('Email confirmation is disabled; no account created');
        }
        export const supabase={auth:{
          async signUp(input){
            window.__calls.push({method:'signup',...input});
            if(window.__mode==='signup-error')return{data:{},error:Error('Synthetic signup failure')};
            const user={id:'fixture',email:input.email,identities:window.__mode==='duplicate'?[]:[{}]};
            return{data:{user,session:window.__mode==='unexpected-session'?{user}:null},error:null};
          },
          async signOut(input){window.__calls.push({method:'signout',...input});return{error:null};},
          async signInWithPassword(input){
            window.__calls.push({method:'signin',...input});
            return{data:{},error:window.__mode==='unconfirmed'?{code:'email_not_confirmed',message:'Email not confirmed'}:null};
          },
          async verifyOtp(input){
            window.__calls.push({method:'verify',...input});
            if(input.token!=='123456')return{data:{},error:Error('Invalid or expired code')};
            const user={email:window.__mode==='wrong-account'?'other@example.invalid':input.email,
              email_confirmed_at:window.__mode==='unverified-response'?null:'2026-11-24T00:00:00Z'};
            return{data:{user,session:window.__mode==='missing-session'?null:{user}},error:null};
          },
          async resend(input){window.__calls.push({method:'resend',...input});
            return{error:window.__mode==='resend-error'?Error('Please wait before requesting another code'):null};}
        }};`:
      a.path.endsWith("signupAttributionBrowser")?`export async function signupAttributionMetadata(){return{referral:'retained'}};export function bindSignupAttributionUser(){}`:
      a.path.endsWith("appRouteEntry")?`export function loginDestination(){return '/'}`:
      `export function useToast(){return{toast:value=>window.__toasts.push(value)}}`
    }));
  }}]
});
await mkdir(out,{recursive:true});
execFileSync(process.execPath,["node_modules/.bin/tailwindcss","-i","client/src/index.css","-o",path.join(out,"capture.css"),"--minify"],{stdio:"pipe"});
const css=await readFile(path.join(out,"capture.css"),"utf8")
  +await readFile("client/src/components/high-school-onboarding/onboarding.css","utf8")
  +await readFile("client/src/components/high-school-onboarding/age-confirmation.css","utf8")
  +await readFile("client/src/components/onboarding-auth-light.css","utf8");
const app=express();
app.get("/test.js",(_req,res)=>res.type("js").send(bundled.outputFiles[0].text));
app.get("/test.css",(_req,res)=>res.type("css").send(css));
app.get("*",(_req,res)=>res.type("html").send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>'));
const server=app.listen(0,"127.0.0.1");
await new Promise<void>(r=>server.on("listening",r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
async function prepare(page:Page,form:string,mode="normal",signup=true){
  await page.goto(origin+(form==="modal"?"/modal":"/login"+(signup?"?signup=1":"")));
  await page.evaluate(value=>(window as any).__mode=value,mode);
  if(signup){
    if(form==="modal")await page.getByTestId("button-toggle-mode").click();
    await page.getByRole("button",{name:"Yes, I'm 18 or older",exact:true}).click();
    await page.getByRole("button",{name:"Continue",exact:true}).click();
  }else if(form==="login")await page.getByTestId("button-login-initial").click();
  await page.getByTestId("input-email").fill("new@example.invalid");
  await page.getByTestId("input-password").fill("Synthetic-only-123!");
  await page.getByTestId("button-submit").click();
}
async function calls(page:Page){return page.evaluate(()=>(window as any).__calls as any[]);}
try{
  await mkdir(out,{recursive:true});
  for(const form of ["login","modal"]){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();page.setDefaultTimeout(8000);
    page.on("pageerror",e=>browserErrors.push(e.message));
    await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());

    await prepare(page,form,"autoconfirm");
    await page.waitForFunction(()=>(window as any).__toasts.length>0);
    assert.deepEqual((await calls(page)).map(c=>c.method),["settings"]);
    checks.push(form+": disabled confirmation blocks registration before account creation");

    for(const mode of ["signup-error","duplicate","unexpected-session"]){
      await prepare(page,form,mode);
      await page.waitForFunction(()=>(window as any).__toasts.length>0||document.body.textContent?.includes("already exists"));
      assert.equal(await page.getByRole("heading",{name:"Verify your email"}).count(),0);
      assert.equal((await calls(page)).some(c=>c.method==="signin"),false);
      if(mode==="unexpected-session")assert.equal((await calls(page)).find(c=>c.method==="signout")?.scope,"local");
      checks.push(form+": "+mode+" never falls back to signed-in access");
    }

    await prepare(page,form);
    await page.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
    assert.deepEqual((await calls(page)).map(c=>c.method),["settings","signup"]);
    const signup=(await calls(page)).find(c=>c.method==="signup")!;
    assert.equal(signup.options.data.signup_age_answer,"adult");
    if(form==="login")assert.equal(signup.options.data.referral,"retained");
    await page.keyboard.press("Escape");
    await page.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
    await page.mouse.click(2,2);
    await page.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
    checks.push(form+": E05 is mandatory and preserves signup metadata");

    const otp=page.locator("input[data-input-otp]");
    const verify=page.getByRole("button",{name:"Verify & Activate Account",exact:true});
    await otp.fill("12345");assert.equal(await verify.isDisabled(),true);
    await otp.fill("654321");await verify.click();
    await page.waitForFunction(()=>(window as any).__toasts.some((t:any)=>t.description==="Invalid or expired code"));
    await page.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
    assert.equal((await calls(page)).filter(c=>c.method==="verify").length,1);
    checks.push(form+": five digits cannot submit and invalid/expired codes stay locked");

    await page.evaluate(()=>(window as any).__mode="resend-error");
    await page.getByRole("button",{name:"Resend code",exact:true}).click();
    await page.waitForFunction(()=>(window as any).__toasts.some((t:any)=>t.title==="Failed to resend code"));
    await page.evaluate(()=>(window as any).__mode="normal");
    await page.getByRole("button",{name:"Resend code",exact:true}).click();
    await page.waitForFunction(()=>(window as any).__toasts.some((t:any)=>t.title==="Code resent!"));
    assert.equal(await otp.inputValue(),"");
    const resend=(await calls(page)).filter(c=>c.method==="resend");
    assert.equal(resend.length,2);
    assert.equal(resend[1].email,"new@example.invalid");
    assert.equal(resend[1].type,"signup");
    checks.push(form+": resend uses entered email and handles provider rate limits");

    for(const mode of ["missing-session","wrong-account","unverified-response"]){
      await page.evaluate(value=>(window as any).__mode=value,mode);
      await otp.fill("");await otp.fill("123456");await verify.click();
      await page.waitForFunction(()=>(window as any).__toasts.some((t:any)=>t.description?.includes("expected account"))).catch(async error=>{
        console.error("Verification fixture failure",form,mode,await page.evaluate(()=>({mode:(window as any).__mode,calls:(window as any).__calls,toasts:(window as any).__toasts})));
        throw error;
      });
      await page.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
      await page.evaluate(()=>(window as any).__toasts=[]);
      checks.push(form+": "+mode+" is not accepted as verification");
    }
    await page.evaluate(()=>(window as any).__mode="normal");
    await otp.fill("");await otp.fill("123456");await verify.click();
    await page.getByRole("heading",{name:form==="login"?"Signed-in account":"Verified modal account",exact:true}).waitFor();
    checks.push(form+": verified six-digit code is the only signup completion path");

    await prepare(page,form,"normal",false);
    await page.getByRole("heading",{name:form==="login"?"Signed-in account":"Verified modal account",exact:true}).waitFor();
    assert.deepEqual((await calls(page)).map(c=>c.method),["signin"]);
    checks.push(form+": existing confirmed sign-in is unchanged");

    await prepare(page,form,"unconfirmed",false);
    await page.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
    assert.deepEqual((await calls(page)).map(c=>c.method),["signin"]);
    checks.push(form+": unfinished registrations can return through sign-in to E05");
    await context.close();
  }
  assert.deepEqual(browserErrors,[]);
}finally{
  await browser.close();await new Promise<void>(r=>server.close(()=>r()));
  const result={checks,browserErrors,scope:"Actual UI with synthetic provider; not live email delivery",realRegistrations:0,emailsSent:0};
  await writeFile(path.join(out,"result.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
