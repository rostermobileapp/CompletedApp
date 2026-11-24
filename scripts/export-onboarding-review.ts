/**
 * Read-only visual inventory. Bundles actual UI into an isolated loopback-only
 * capture server. All Auth/API boundaries are synthetic. Never mounts App or
 * changes application sources, accounts, settings, or existing user records.
 */
import { build } from "esbuild";
import ts from "typescript";
import express from "express";
import { chromium, type Page } from "playwright-core";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { screens, type ReviewSpec } from "./onboarding-review/catalog";
import { renderReviewDocument } from "./onboarding-review/document";

const out=path.resolve(process.argv.find(argument=>argument.startsWith("--out-dir="))?.slice("--out-dir=".length)||"generated-artifacts/onboarding-review");
const onlyIds=process.argv.find(argument=>argument.startsWith("--only="))?.slice("--only=".length).split(",");
const captureOnly=process.argv.includes("--capture-only");
const verifyLight=process.argv.includes("--verify-light");
const reviewScreens=onlyIds?screens.filter(screen=>onlyIds.includes(screen.id)):screens;
if(onlyIds&&reviewScreens.length!==new Set(onlyIds).size)throw Error("Unknown screen ID in --only");
await mkdir(path.join(out,"screens"),{recursive:true});
const resumeArgument=process.argv.find(argument=>argument.startsWith("--resume-log="));
const resumed=new Map<string,{heading:string;count:number}>();
if(resumeArgument){
  const log=await readFile(resumeArgument.slice("--resume-log=".length),"utf8");
  for(const match of log.matchAll(/^([A-Z]+\d+) (.+) \((\d+) views?\)$/gm)){
    resumed.set(match[1],{heading:match[2],count:Number(match[3])});
  }
}
const getSource=async(file:string)=>readFile(path.resolve(file),"utf8");
const qSource=await getSource("client/src/pages/OnboardingQuestionnaire.tsx");
const ast=ts.createSourceFile("questionnaire.tsx",qSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let pains:Record<string,any[]>={};
for(const node of ast.statements){
  if(!ts.isVariableStatement(node))continue;
  for(const declaration of node.declarationList.declarations){
    if(declaration.name.getText(ast)==="ROLE_PAIN_POINTS"&&declaration.initializer){
      pains=new Function("return ("+declaration.initializer.getText(ast).replace(/icon:\s*\w+/g,"icon:null")+")")();
    }
  }
}
function seedState(source:string, variable:string, expression:string){
  const file=ts.createSourceFile("capture.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let range:{start:number;end:number}|undefined;
  const walk=(node:ts.Node)=>{
    if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)
      &&node.name.elements[0]?.name?.getText(file)===variable&&node.initializer&&ts.isCallExpression(node.initializer)){
      const call=node.initializer;
      if(call.expression.getText(file)==="useState"){
        range=call.arguments[0]?{start:call.arguments[0].getStart(file),end:call.arguments[0].end}
          :{start:call.end-1,end:call.end-1};
      }
    }
    ts.forEachChild(node,walk);
  };
  walk(file);
  if(!range)throw new Error("Missing capture state "+variable);
  return source.slice(0,range.start)+expression+source.slice(range.end);
}
const fixtureQuery=`
 import {QueryClient}from'@tanstack/react-query';
 export class ApiError extends Error {}
 export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false,
   queryFn:async({queryKey})=>queryKey[0]==='/api/user'?(new URLSearchParams(location.search).get('anonymous')==='1'?{}:{id:'pdf-fixture-adult',firstName:'',lastName:'',email:'review@example.invalid'}):
   queryKey[0]==='/api/stripe/prices'?{}:[]}}});
 export const getImageUrl=value=>value;
 export async function getAuthHeaders(){return{}};
 export async function apiRequest(){window.__forbiddenApiCalls=(window.__forbiddenApiCalls||0)+1;throw Error('Live API forbidden in PDF capture')};
`;
const bundled=await build({
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  alias:{"@assets":path.resolve("attached_assets")},
  loader:{".css":"empty",".png":"dataurl",".jpg":"dataurl",".jpeg":"dataurl",".webp":"dataurl",".svg":"dataurl",".gif":"dataurl"},
  define:{"process.env.NODE_ENV":'"development"',"import.meta.env.DEV":"true","import.meta.env.VITE_ISOLATED_DEVELOPMENT":'"true"',"import.meta.env.VITE_API_BASE_URL":'""'},
  stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
    import React from'react';import{createRoot}from'react-dom/client';
    import{ReviewScreen}from'./scripts/onboarding-review/fixtures';
    window.__forbiddenApiCalls=0;
    createRoot(document.getElementById('root')).render(<ReviewScreen/>);
  `},
  plugins:[{name:"read-only-review-boundaries",setup(b){
    b.onResolve({filter:/^@\/lib\/(?:queryClient|supabase|nativePurchases|signupAttributionBrowser)$/},a=>({path:a.path,namespace:"pdf-fixture"}));
    b.onLoad({filter:/.*/,namespace:"pdf-fixture"},a=>({loader:"js",resolveDir:process.cwd(),contents:
      a.path.endsWith("queryClient")?fixtureQuery:
      a.path.endsWith("nativePurchases")?"export const setSubscriberAttributes=()=>{};":
      a.path.endsWith("signupAttributionBrowser")?`export async function loadSignupAttribution(){return{}};export function signupAttribution(){return{clear(){}}};export async function signupAttributionMetadata(){return{}};export function bindSignupAttributionUser(){};`:
       `export async function requireSignupEmailConfirmation(){throw Error('Live signup forbidden in PDF capture')};export const supabase={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),signOut:async()=>({error:null})}};export async function clearStaleSession(){};`
    }));
    b.onLoad({filter:/OnboardingQuestionnaire\.tsx$/},async a=>{
      let source=await readFile(a.path,"utf8");
      source=source.replace("role: previewScreen ? 'player' : ''","role: (new URLSearchParams(window.location.search).get('role') || 'player') as OnboardingRole")
        .replace("pains: previewScreen ? PREVIEW_SAMPLE_PAINS : []","pains: (new URLSearchParams(window.location.search).get('pains') || '').split(',').filter(Boolean)")
        .replace("if (screen === 'processing') {","if (screen === 'processing' && false) {");
      return{contents:source,loader:"tsx",resolveDir:path.dirname(a.path)};
    });
    b.onLoad({filter:/ParentVerification\.tsx$/},async a=>{
      let source=await readFile(a.path,"utf8");
      const mode="new URLSearchParams(window.location.search).get('seed')";
      source=seedState(source,"challenge",`['code','password'].includes(${mode}||'')?'pdf-fixture-challenge':undefined`);
      source=seedState(source,"purpose",`${mode}?.startsWith('password')?'password_change':'parent_action'`);
      source=seedState(source,"unlocked",`${mode}==='unlocked'`);
      source=seedState(source,"finished",`${mode}==='finished'`);
      source=seedState(source,"passwordGrant",`${mode}==='password-form'?{value:'pdf-fixture-not-authority',until:Date.now()+600000}:undefined`);
      return{contents:source,loader:"tsx",resolveDir:path.dirname(a.path)};
    });
    b.onLoad({filter:/Under18Onboarding\.tsx$/},async a=>{
      let source=await readFile(a.path,"utf8");
      source=seedState(source,"view","new URLSearchParams(window.location.search).get('view')||'entry'");
      return{contents:source,loader:"tsx",resolveDir:path.dirname(a.path)};
    });
  }}]
});
console.log(`Prepared ${reviewScreens.length} screen definitions; compiling the current app styles.`);
execFileSync(process.execPath,["node_modules/.bin/tailwindcss","-i","client/src/index.css","-o",path.join(out,"capture.css"),"--minify"],{stdio:"pipe"});
let css=await readFile(path.join(out,"capture.css"),"utf8");
css+="\n"+await getSource("client/src/components/high-school-onboarding/onboarding.css");
css+="\n"+await getSource("client/src/components/high-school-onboarding/age-confirmation.css");
css+="\n"+await getSource("client/src/pages/onboarding-profile.css");
css+="\n"+await getSource("client/src/components/onboarding-auth-light.css");
const app=express();let rejectedApi=0;
app.use("/api",(_req,res)=>{rejectedApi++;res.status(503).json({code:"PDF_CAPTURE_NO_API"});});
app.get("/capture.js",(_req,res)=>res.type("js").send(bundled.outputFiles[0].text));
app.get("/capture.css",(_req,res)=>res.type("css").send(css));
app.use(express.static(path.resolve("client/public")));
app.use(express.static(path.resolve("public")));
app.get("*",(_req,res)=>res.type("html").send(`<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/capture.css"><style>*{scroll-behavior:auto!important;animation:none!important}html,body{margin:0}.hsy{min-height:100dvh}</style></head><body><div id="root"></div><script src="/capture.js"></script></body></html>`));
const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.on("listening",r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5,reducedMotion:"reduce",colorScheme:"light"});
let externalBlocked=0;
await context.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin||["data:","blob:"].includes(url.protocol))return route.continue();
  // Only public fonts are permitted. Authentication, analytics and all other
  // external services are blocked, regardless of whether a component requests them.
  if(["fonts.googleapis.com","fonts.gstatic.com"].includes(url.hostname))return route.continue();
  externalBlocked++;return route.abort();
});
type Captured=ReviewSpec&{heading:string;images:string[];error?:string;pageErrors:string[]};
const captured:Captured[]=[];
const lightChecks:{id:string;width:number;dark:boolean}[]=[];
async function settle(page:Page){
  await page.waitForTimeout(950);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
}
try{
  for(const spec of reviewScreens){
    const previous=resumed.get(spec.id);
    if(previous){
      const images=Array.from({length:previous.count},(_,index)=>path.join(out,"screens",spec.id+(index?"-"+(index+1):"")+".jpg"));
      await Promise.all(images.map(image=>stat(image)));
      captured.push({...spec,heading:spec.title||previous.heading,images,pageErrors:[]});
      console.log(`Reused verified capture ${spec.id}`);
      continue;
    }
    const page=await context.newPage();page.setDefaultTimeout(7000);
    const pageErrors:string[]=[];page.on("pageerror",error=>pageErrors.push(error.message));
    const params=new URLSearchParams({id:spec.id,...spec.params});
    if(spec.params?.role)params.set("pains",(pains[spec.params.role]??[]).map(p=>p.value).join(","));
    const route=spec.component==="AdultProfile"?"/onboarding-preview":"/capture";
    const record:Captured={...spec,heading:"",images:[],pageErrors};
    try{
      await page.goto(origin+route+"?"+params,{waitUntil:"networkidle",timeout:15000});
      if(spec.setup==="adult-signup"||spec.setup==="modal-signup"){
        if(spec.setup==="modal-signup")await page.getByTestId("button-toggle-mode").click();
        await page.getByRole("button",{name:"Yes, I'm 18 or older",exact:true}).click();
        await page.getByRole("button",{name:"Continue",exact:true}).click();
        await page.getByTestId("input-email").waitFor();
      }
      if(spec.setup==="team-chat"||spec.setup==="family-chat"){
        await page.getByRole("button",{name:spec.setup==="team-chat"?/Example team chat/:/Example family chat/}).click();
      }
      await settle(page);
       // Keep preview state seeding and safety boundaries, but omit developer
       // navigation from the exported customer-facing screen captures only.
       const previewToolbarRemoved=await page.evaluate(()=>{
         const selectors=[
           'select[aria-label="Preview profile onboarding step"]',
           'select[aria-label="Preview onboarding screen"]',
         ];
         let removed=0;
         for(const selector of selectors){
           const toolbar=document.querySelector(selector)?.parentElement;
           if(toolbar){toolbar.remove();removed++;}
         }
         return removed;
       });
       // Hockey type returns the shared intake directly, without a toolbar.
       const expectsToolbar=spec.component==="AdultProfile"
         ||(spec.component==="Questionnaire"&&spec.params?.preview!=="hockey_type");
       if(expectsToolbar&&previewToolbarRemoved!==1){
         throw Error("Expected exactly one preview toolbar to omit from capture");
       }
       if(await page.getByText(/^Dev preview$/i).count())throw Error("Preview banner remained in capture");
      if(verifyLight){
        if(spec.id==="E05"){
          const otp=page.locator("input[data-input-otp]");
          await otp.fill("123456");
          if(await page.getByRole("button",{name:"Verify & Activate Account",exact:true}).isDisabled())throw Error("Signup OTP action did not enable after six digits");
          const otpView=await page.evaluate(()=>{
            const input=document.querySelector<HTMLInputElement>("input[data-input-otp]")!;
            return{digits:[...document.querySelectorAll(".onboarding-otp-slot")].map(slot=>slot.textContent).join(""),background:getComputedStyle(input).backgroundColor,color:getComputedStyle(input).color};
          });
          if(otpView.digits!=="123456"||otpView.background!=="rgba(0, 0, 0, 0)"||otpView.color!=="rgba(0, 0, 0, 0)")throw Error("OTP carrier must remain transparent: "+JSON.stringify(otpView));
          await otp.fill("");
        }
        for(const width of [320,390,1280]){
          await page.setViewportSize({width,height:844});
          for(const dark of [false,true]){
            await page.evaluate(value=>document.documentElement.classList.toggle("dark",value),dark);
            const appearance=await page.evaluate(()=>{
              const root=document.querySelector<HTMLElement>(".onboarding-light[role='dialog'],main.onboarding-light");
              if(!root)return{error:"Missing local light boundary"};
              const panel=root.querySelector(".parent-verification-card")||root;
              const box=root.getBoundingClientRect();
              const overlay=document.querySelector<HTMLElement>(".onboarding-auth-backdrop");
              const overlayBox=overlay?.getBoundingClientRect();
              let defaultBackdrop:string|undefined;
              if(overlay){
                overlay.classList.remove("onboarding-auth-backdrop");
                defaultBackdrop=getComputedStyle(overlay).backgroundColor;
                overlay.classList.add("onboarding-auth-backdrop");
              }
              const inputs=[...root.querySelectorAll<HTMLInputElement>("input:not([data-input-otp])")].filter(input=>input.type!=="hidden").map(input=>{
                const style=getComputedStyle(input);
                return{background:style.backgroundColor,color:style.color};
              });
              return{
                background:getComputedStyle(panel).backgroundColor,
                color:getComputedStyle(root).color,
                backdrop:root.matches("[role='dialog']")?{
                  background:overlay?getComputedStyle(overlay).backgroundColor:null,
                  opacity:overlay?getComputedStyle(overlay).opacity:null,
                  coversViewport:!!overlayBox&&overlayBox.left===0&&overlayBox.top===0&&overlayBox.right===innerWidth&&overlayBox.bottom===innerHeight,
                  visibleAtBottom:!!document.elementFromPoint(5,innerHeight-5)?.closest(".onboarding-auth-backdrop"),
                  defaultBackdrop,
                }:undefined,
                fits:box.left>=-.5&&box.right<=innerWidth+.5&&root.scrollWidth<=root.clientWidth+1,
                bounds:{left:box.left,right:box.right,clientWidth:root.clientWidth,scrollWidth:root.scrollWidth},
                overflow:[...root.querySelectorAll<HTMLElement>("*")].filter(element=>element.getBoundingClientRect().right>box.right+1).map(element=>({tag:element.tagName,classes:element.className,right:element.getBoundingClientRect().right})).slice(0,5),
                inputs,
              };
            });
            if("error" in appearance||appearance.background!=="rgb(255, 255, 255)"||appearance.color!=="rgb(15, 23, 42)"||!appearance.fits
              ||appearance.inputs?.some(input=>input.background!=="rgb(255, 255, 255)"||input.color!=="rgb(15, 23, 42)")
              ||(appearance.backdrop&&(appearance.backdrop.background!=="rgb(248, 250, 252)"||appearance.backdrop.opacity!=="1"
                ||!appearance.backdrop.coversViewport||!appearance.backdrop.visibleAtBottom||appearance.backdrop.defaultBackdrop!=="rgba(0, 0, 0, 0.8)"))){
              throw Error(`Light design failed at ${width}px / dark=${dark}: ${JSON.stringify(appearance)}`);
            }
            lightChecks.push({id:spec.id,width,dark});
          }
        }
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(()=>document.documentElement.classList.add("dark"));
      }
      const primary=page.locator("h1:visible");
      record.heading=((await primary.count())?await primary.first().innerText():await page.locator("h2:visible").first().innerText().catch(()=>"")).trim()||spec.title||spec.component;
      if(pageErrors.length)throw Error(pageErrors.join(" | "));
      if(await page.evaluate(()=>(window as any).__forbiddenApiCalls||0))throw Error("Component attempted a forbidden API call");
      // A phone viewport plus lower scroll positions preserves readable layouts
      // and includes fields hidden inside independently scrollable panels.
      const scroller=await page.evaluate(()=>{
        const profile=document.querySelector(".adult-profile .profile-content");
        const profileActions=document.querySelector(".adult-profile .profile-actions");
        if(profile&&profileActions){
          const content=profile.getBoundingClientRect();
          // The preview bar can add scroll range even when every actual field
          // already fits. Don't present that empty scroll range as another view.
          if(content.top>=0&&content.bottom<=profileActions.getBoundingClientRect().top){
            return{kind:"body",max:0,step:744};
          }
        }
        const candidates=[...document.querySelectorAll<HTMLElement>("*")].filter(el=>{
          const style=getComputedStyle(el);
          return el.clientHeight>100&&el.scrollHeight>el.clientHeight+40&&["auto","scroll"].includes(style.overflowY);
        }).sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
        if(candidates[0]){candidates[0].dataset.pdfScroller="true";return{kind:"inner",max:candidates[0].scrollHeight-candidates[0].clientHeight,step:Math.max(200,candidates[0].clientHeight-100)};}
        return{kind:"body",max:Math.max(0,document.documentElement.scrollHeight-innerHeight),step:744};
      });
      const positions=[0];
      for(let value=scroller.step;value<scroller.max;value+=scroller.step)positions.push(value);
      if(scroller.max>30&&positions.at(-1)!==scroller.max)positions.push(scroller.max);
      for(const [index,position] of positions.entries()){
        await page.evaluate(({kind,position})=>{
          if(kind==="inner"){const el=document.querySelector<HTMLElement>("[data-pdf-scroller]");if(el)el.scrollTop=position;}
          else window.scrollTo(0,position);
        },{kind:scroller.kind,position});
        await page.waitForTimeout(60);
        const file=path.join(out,"screens",spec.id+(index?"-"+(index+1):"")+".jpg");
        await page.screenshot({path:file,type:"jpeg",quality:82});
        record.images.push(file);
      }
      console.log(`${spec.id} ${record.heading} (${record.images.length} view${record.images.length===1?"":"s"})`);
    }catch(error:any){
      record.error=error.message;
      const file=path.join(out,"screens",spec.id+"-failure.jpg");
      await page.screenshot({path:file,type:"jpeg",quality:75}).catch(()=>{});
      console.error(`CAPTURE FAILED ${spec.id}: ${error.message}`);
    }finally{await page.close();}
    captured.push(record);
    await writeFile(path.join(out,"capture-progress.json"),JSON.stringify(captured,null,2));
  }
  const manifest={generatedAt:new Date().toISOString(),viewport:{width:390,height:844},source:"current workspace; synthetic offline component rendering",forbiddenApiAttempts:rejectedApi,externalNonFontRequestsBlocked:externalBlocked,lightChecks,screens:captured};
  await writeFile(path.join(out,"manifest.json"),JSON.stringify(manifest,null,2));
  const failures=captured.filter(item=>item.error);
  if(failures.length||rejectedApi)throw Error(`${failures.length} failed screen captures; ${rejectedApi} unexpected API requests. See manifest.json.`);
  if(!captureOnly){
  const html=await renderReviewDocument(captured);
  await writeFile(path.join(out,"onboarding-review.html"),html);
  const documentPage=await context.newPage();
  await documentPage.setViewportSize({width:1588,height:1123});
  await documentPage.setContent(html,{waitUntil:"networkidle"});
  await documentPage.emulateMedia({media:"print"});
  await documentPage.pdf({path:path.join(out,"onboarding-review.pdf"),format:"A3",landscape:true,printBackground:true,preferCSSPageSize:true,margin:{top:0,right:0,bottom:0,left:0}});
  await documentPage.screenshot({path:path.join(out,"document-preview.jpg"),type:"jpeg",quality:85});
  const pdf=await stat(path.join(out,"onboarding-review.pdf"));
  console.log(JSON.stringify({screens:captured.length,phoneViews:captured.reduce((n,s)=>n+s.images.length,0),pdfBytes:pdf.size,pdf:path.relative(process.cwd(),path.join(out,"onboarding-review.pdf")),realAccountsCreated:0,realMessagesSent:0,apiRequests:rejectedApi},null,2));
  }else{
    console.log(JSON.stringify({screens:captured.length,phoneViews:captured.reduce((n,s)=>n+s.images.length,0),lightChecks:lightChecks.length,realAccountsCreated:0,realMessagesSent:0,apiRequests:rejectedApi},null,2));
  }
}finally{
  await browser.close();
  await new Promise<void>(r=>server.close(()=>r()));
}
