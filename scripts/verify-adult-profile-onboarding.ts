/**
 * Actual adult profile component with loopback-only synthetic persistence.
 * No accounts, DB connections, provider requests or real uploads.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import express from "express";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";

const out=path.resolve("generated-artifacts/adult-profile-onboarding");
await mkdir(out,{recursive:true});
const report={checks:[] as string[],outcome:"not_finished",realAccountsCreated:0,realUploads:0,externalRequests:0};
const mark=(name:string)=>report.checks.push(name);
const source=await readFile("client/src/pages/Onboarding.tsx","utf8");
const baselinePath=process.argv.find(arg=>arg.startsWith("--baseline="))?.slice("--baseline=".length);
if(baselinePath){
  const semanticParts=(code:string)=>{
    const ast=ts.createSourceFile("profile.tsx",code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const names=new Set(["TIMEZONE_OPTIONS","COMPETITIVE_LEVELS","TOTAL_STEPS","formData","canAdvance","handleNext","handleBack","handleFinish","handleGetUploadParameters","handleUploadComplete","saveMutation","updateField"]);
    const parts:Record<string,string>={};
    const printer=ts.createPrinter({removeComments:true});
    const walk=(node:ts.Node)=>{
      if(ts.isVariableDeclaration(node)&&node.initializer){
        const first=ts.isArrayBindingPattern(node.name)?node.name.elements[0]:undefined;
        const name=first&&ts.isBindingElement(first)?first.name.getText(ast):ts.isIdentifier(node.name)?node.name.text:undefined;
        if(name&&names.has(name))parts[name]=printer.printNode(ts.EmitHint.Unspecified,node.initializer,ast);
      }
      ts.forEachChild(node,walk);
    };
    walk(ast);return parts;
  };
  assert.deepEqual(semanticParts(source),semanticParts(await readFile(baselinePath,"utf8")));
  mark("all_validation_handlers_payloads_initial_fields_and_select_options_unchanged");
}
const bundle=await build({
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  define:{"process.env.NODE_ENV":'"development"',"import.meta.env.DEV":"true"},
  alias:{"@assets":path.resolve("attached_assets")},loader:{".png":"dataurl",".css":"empty"},
  stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
    import React from'react';import{createRoot}from'react-dom/client';
    import{QueryClientProvider}from'@tanstack/react-query';
    import{queryClient}from'@/lib/queryClient';import Onboarding from'./client/src/pages/Onboarding';
    window.__requests=[];window.__toasts=[];window.__queryClient=queryClient;
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><Onboarding/></QueryClientProvider>);
  `},
  plugins:[{name:"isolated-profile-boundaries",setup(b){
    b.onResolve({filter:/^@\/(?:lib\/queryClient|hooks\/use-toast|components\/ObjectUploader)$/},args=>({path:args.path,namespace:"profile-fixture"}));
    b.onLoad({filter:/.*/,namespace:"profile-fixture"},args=>({loader:"tsx",resolveDir:process.cwd(),contents:
      args.path.endsWith("queryClient")?`
        import{QueryClient}from'@tanstack/react-query';
        export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
        export function getImageUrl(path){return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="blue"/></svg>');}
        export async function apiRequest(method,url,data){
          window.__requests.push({method,url,data});
          if(url==='/api/profile-images/upload')return{json:async()=>({uploadURL:'/fixture-upload-only',path:'/fixture/profile.jpg'})};
          await new Promise(resolve=>setTimeout(resolve,120));
          if(window.__failSave)throw Error('Synthetic save failure');
          return{json:async()=>({ok:true})};
        }`:
      args.path.endsWith("use-toast")?`export function useToast(){return{toast(value){window.__toasts.push(value)}}}`:
      `import React from'react';export function ObjectUploader({children,buttonClassName,onGetUploadParameters,onComplete}){return <button type="button" className={buttonClassName} onClick={async()=>{const result=await onGetUploadParameters();onComplete({successful:[{path:result.path}]})}}>{children}</button>}`
    }));
  }}],
});
execFileSync(process.execPath,["node_modules/.bin/tailwindcss","-i","client/src/index.css","-o",path.join(out,"base.css"),"--minify"],{stdio:"pipe"});
const css=await readFile(path.join(out,"base.css"),"utf8")+"\n"+await readFile("client/src/pages/onboarding-profile.css","utf8");
const app=express();
app.get("/fixture.js",(_q,r)=>r.type("js").send(bundle.outputFiles[0].text));
app.get("/fixture.css",(_q,r)=>r.type("css").send(css));
app.use((_q,r)=>r.type("html").send('<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body style="margin:0"><div id="root"></div><script src="/fixture.js"></script></body></html>'));
const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.on("listening",resolve));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
  const errors:string[]=[];
  await context.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin||url.protocol==="data:")return route.continue();
    return route.abort();
  });
  const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
  page.setDefaultTimeout(7000);
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});
    for(const [step,heading] of [[1,"Basic Information"],[2,"Additional Information"],[3,"Welcome to RosterHockey"]] as const){
      await page.goto(origin+"/onboarding-preview?profileStep="+step);
      await page.getByRole("heading",{name:heading,exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const appearance=await page.evaluate(()=>{
        const root=document.querySelector(".adult-profile")!;
        const primary=document.querySelector(".profile-primary")!;
        const footer=document.querySelector(".profile-actions")!.getBoundingClientRect();
        const shell=document.querySelector(".profile-shell")!.getBoundingClientRect();
        const button=primary.getBoundingClientRect();
        return{accent:getComputedStyle(root).getPropertyValue("--profile-accent").trim(),background:getComputedStyle(document.querySelector(".profile-shell")!).backgroundColor,foreground:getComputedStyle(root).color,width:shell.width,footerInside:footer.right<=innerWidth+.5&&footer.left>=-.5,buttonInside:button.bottom<=innerHeight&&button.width>=120};
      });
      assert.equal(appearance.accent,"#2563eb");assert.equal(appearance.background,"rgb(255, 255, 255)");
      assert.equal(appearance.foreground,"rgb(15, 23, 42)");assert.ok(appearance.width<=430.5);
      assert.ok(appearance.footerInside&&appearance.buttonInside);
      if(step<3){
        const fields=page.locator(".profile-fields input,.profile-fields select");
        for(const field of await fields.all()){
          const colors=await field.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
          assert.equal(colors.background,"rgb(255, 255, 255)");assert.equal(colors.color,"rgb(15, 23, 42)");
        }
        await fields.last().scrollIntoViewIfNeeded();
        // Playwright considers an input visible even behind a fixed footer.
        // Verify the actual end-of-page position, not its viewport-only heuristic.
        await fields.last().evaluate(element=>{
          // The app's html/body/#root all have overflow-x:hidden and height:100%,
          // so #root can own vertical scrolling instead of the document.
          for(let parent=element.parentElement;parent;parent=parent.parentElement){
            if(parent.scrollHeight>parent.clientHeight)parent.scrollTo({top:parent.scrollHeight,behavior:"instant"});
          }
          window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
        });
        const bottom=await fields.last().boundingBox(),footer=await page.locator(".profile-actions").boundingBox();
        assert.ok(bottom&&footer&&bottom.y+bottom.height<=footer.y,`Last field can scroll clear of actions (${width}px, step ${step})`);
      }
      await page.screenshot({path:path.join(out,`P0${step}-${width}.png`),fullPage:true});
    }
  }
  mark("all_three_steps_match_current_style_at_320_390_and_1280_even_under_dark_theme");
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+"/onboarding-preview?profileStep=1");
  await page.getByRole("heading",{name:"Basic Information",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Back",exact:true}).count(),0);
  assert.ok(await page.getByRole("button",{name:"Next",exact:true}).isDisabled());
  await page.locator("#firstName").fill("Sample");
  assert.ok(await page.getByRole("button",{name:"Next",exact:true}).isDisabled());
  await page.locator("#lastName").fill("Player");
  await page.locator("#phoneNumber").fill("555-0100");
  await page.locator("#dateOfBirth").fill("1990-01-02");
  await page.getByRole("button",{name:"Upload profile photo",exact:true}).click();
  await page.getByRole("img",{name:"Profile",exact:true}).waitFor();
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await page.getByRole("heading",{name:"Additional Information",exact:true}).waitFor();
  assert.ok(await page.getByRole("button",{name:"Next",exact:true}).isDisabled());
  await page.locator("#timezone").selectOption("America/New_York");
  assert.ok(await page.getByRole("button",{name:"Next",exact:true}).isDisabled());
  await page.locator("#competitiveLevel").selectOption("Recreational");
  await page.locator("#venmoUsername").fill("@sample");
  await page.locator("#cashappUsername").fill("$sample");
  await page.locator("#city").fill("Example Town");
  await page.getByRole("button",{name:"Back",exact:true}).click();
  assert.equal(await page.locator("#firstName").inputValue(),"Sample");
  assert.equal(await page.locator("#dateOfBirth").inputValue(),"1990-01-02");
  await page.getByRole("button",{name:"Next",exact:true}).click();
  assert.equal(await page.locator("#timezone").inputValue(),"America/New_York");
  assert.equal(await page.locator("#city").inputValue(),"Example Town");
  mark("required_fields_optional_fields_photo_callback_and_back_state_preserved");
  await page.evaluate(()=>{(window as any).__failSave=true;});
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await page.waitForFunction(()=>(window as any).__toasts.some((toast:any)=>toast.description==="Failed to save your information. Please try again."));
  assert.ok(await page.getByRole("heading",{name:"Additional Information",exact:true}).isVisible());
  await page.evaluate(()=>{(window as any).__failSave=false;});
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await page.getByRole("heading",{name:"Welcome to RosterHockey",exact:true}).waitFor();
  mark("save_failure_stays_on_step_two_and_retry_advances_only_after_success");
  await page.evaluate(()=>{(window as any).__failSave=true;});
  await page.getByRole("button",{name:"Finish",exact:true}).click();
  await page.waitForFunction(()=>(window as any).__toasts.some((toast:any)=>toast.description==="Failed to complete onboarding. Please try again."));
  assert.ok(page.url().includes("/onboarding-preview"));
  await page.evaluate(()=>{(window as any).__failSave=false;});
  await page.getByRole("button",{name:"Finish",exact:true}).click();
  await page.waitForURL("**/get-started");
  const saved=await page.evaluate(()=>({requests:(window as any).__requests,user:(window as any).__queryClient.getQueryData(["/api/user"])}));
  const patches=saved.requests.filter((request:any)=>request.method==="PATCH");
  assert.equal(patches.length,4);
  assert.deepEqual(patches[1].data,{firstName:"Sample",lastName:"Player",phoneNumber:"555-0100",dateOfBirth:"1990-01-02",profileImageUrl:"/fixture/profile.jpg",timezone:"America/New_York",venmoUsername:"@sample",cashappUsername:"$sample",city:"Example Town",competitiveLevel:"Recreational",onboardingProgress:{step:2}});
  assert.deepEqual(patches[3].data,{...patches[1].data,onboardingCompleted:true,onboardingProgress:{step:3,completed:true}});
  assert.equal(saved.user.onboardingCompleted,true);
  mark("finish_failure_retry_completion_payload_cache_flag_and_get_started_destination_preserved");
  assert.deepEqual(errors,[]);
  report.outcome="passed";
}catch(error:any){
  report.outcome="failed";console.error(error);process.exitCode=1;
}finally{
  await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));
  await writeFile(path.join(out,"result.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
