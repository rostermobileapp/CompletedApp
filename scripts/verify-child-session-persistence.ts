/** Actual production boundary, child store, transport and Home.
 * Synthetic HTTP and approval only; no hosted DB, real accounts or native claims. */
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import express from "express";
import { chromium } from "playwright-core";

const root=process.cwd(),out="generated-artifacts/child-session-persistence";
const token=`hs_child_${"a".repeat(43)}`,legacy=`hs_child_${"b".repeat(43)}`;
const key="roster-child-session";
const stubs:Record<string,string>={
  "@/hooks/useAuth":"export const useAuth=()=>{throw Error('Adult auth mounted in child runtime')};",
  "@/context/DemoContext":"export const useDemo=()=>({isDemoMode:false});",
  "@/hooks/useDashboardSelection":"export const useDashboardSelection=()=>({});",
  "@/context/TeamSkinFacts":"export const TeamSkinFacts=({children})=>children;",
  "@/pages/ParentVerification":"export default function ParentVerification(){return null;}",
  "@/components/high-school-family/FamilySetup":"export const FamilySetup=()=>null;",
  "@/components/high-school-family/LiveFamilyBoundary":"export const LiveFamilyBoundary=({entry})=>entry;",
  "@/lib/queryClient":`import{QueryClient}from'@tanstack/react-query';
    export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
    export class ApiError extends Error{}
    export const apiRequest=()=>{throw Error('Adult API called in child runtime')};`,
};
const bundle=await build({
  bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",
  alias:{"@":path.join(root,"client/src"),"@shared":path.join(root,"shared"),"@assets":path.join(root,"attached_assets")},
  loader:{".css":"empty",".png":"dataurl"},
  define:{"import.meta.env":JSON.stringify({PROD:true,DEV:false}),"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"external-adult-providers-only",setup(b){
    b.onResolve({filter:/.*/},args=>{
      const absolute=args.path.startsWith(".")?path.resolve(args.resolveDir,args.path):args.path;
      const name=args.path.startsWith("@/")?args.path:"@/"+path.relative(path.join(root,"client/src"),absolute).replace(/\.tsx?$/,"");
      return stubs[name]?{path:name,namespace:"external-fixture"}:undefined;
    });
    b.onLoad({filter:/.*/,namespace:"external-fixture"},args=>({contents:stubs[args.path],loader:"tsx",resolveDir:root}));
  }}],
  stdin:{loader:"tsx",resolveDir:root,contents:`
    import React from'react';import{createRoot}from'react-dom/client';
    import{QueryClientProvider}from'@tanstack/react-query';
    import{queryClient}from'@/lib/queryClient';
    import{TeamSkinBoundary}from'./client/src/components/high-school-skins/TeamSkinBoundary';
    import{childSkinSession}from'./client/src/lib/highSchoolChildSession';
    window.clearChild=()=>childSkinSession.clear();
    window.refreshChild=()=>queryClient.refetchQueries({queryKey:['production-child-session']});
    function Entry(){return <main><h1>Parent setup code</h1>
      <button onClick={()=>childSkinSession.save('${token}')}>Approve this synthetic phone</button></main>}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}>
      <TeamSkinBoundary entry={<Entry/>}><h1>Adult runtime must not mount</h1></TeamSkinBoundary>
    </QueryClientProvider>);`,
  },
});
let revoked=false,unavailable=false;
const requests:{url:string;method:string;auth?:string;cookie?:string}[]=[];
const app=express();
app.use("/api",(req,_res,next)=>{requests.push({url:req.originalUrl,method:req.method,auth:req.get("authorization"),cookie:req.get("cookie")});next();});
app.post("/api/high-school/parent-verification/forget-device",(_req,res)=>res.sendStatus(204));
app.get("/api/high-school/child-device/session",(req,res)=>{
  if(unavailable)return res.status(503).json({code:"TEMPORARY_UNAVAILABLE"});
  if(revoked||![`Bearer ${token}`,`Bearer ${legacy}`].includes(req.get("authorization")??""))
    return res.status(401).json({code:"INVALID_CHILD_SESSION"});
  res.json({child:{firstName:"Casey"},teamStatus:"awaiting_team",teams:[],schedule:[],chats:[]});
});
app.use("/api",(_req,res)=>res.status(403).json({code:"UNEXPECTED_API"}));
app.get("/fixture.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));
app.get("/fixture.css",async(_req,res)=>{
  const css=(await readdir("dist/public/assets")).find(name=>/^index-.*\.css$/.test(name))!;
  res.type("css").send(await readFile(`dist/public/assets/${css}`,"utf8"));
});
app.get("/patches-home-icon.png",(_req,res)=>res.sendFile(path.join(root,"client/public/patches-home-icon.png")));
app.get("*",(_req,res)=>res.type("html").send(`<!doctype html><html class="dark"><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css">
  <div id="root"></div><script src="/fixture.js"></script></html>`));
const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const profile=await mkdtemp(path.join(os.tmpdir(),"child-login-fixture-"));
const launch=()=>chromium.launchPersistentContext(profile,{executablePath:"/repl/tools/bin/chromium",
  headless:true,viewport:{width:390,height:844},args:["--no-sandbox","--disable-dev-shm-usage"]});
let context=await launch();
const errors:string[]=[],checks:string[]=[];
const mark=(text:string)=>checks.push(text);
const open=async()=>{
  const page=await context.newPage();
  page.setDefaultTimeout(10_000);page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  return page;
};
try{
  await mkdir(out,{recursive:true});
  let page=await open();await page.goto(origin);
  await page.getByRole("button",{name:"Approve this synthetic phone"}).click();
  await page.getByTestId("scoped-account-home").waitFor();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),token);
  assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key),null);
  mark("Approved child capability is saved durably, without persisting parent authority");
  await page.reload();await page.getByTestId("scoped-account-home").waitFor();
  mark("Reload restores the approved child without entering a code");
  await context.close();context=await launch();page=await open();await page.goto(`${origin}/under-18/code`);
  await page.getByTestId("scoped-account-home").waitFor();
  assert.equal(await page.getByRole("heading",{name:"Parent setup code"}).count(),0);
  mark("Full browser shutdown and cold reopen restore Home, even at the setup-code URL");
  await page.screenshot({path:`${out}/restored-child-home.png`});
  unavailable=true;await page.reload();
  await page.getByRole("heading",{name:"Player access could not be verified"}).waitFor();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),token);
  assert.equal(await page.getByRole("heading",{name:"Parent setup code"}).count(),0);
  unavailable=false;await page.getByRole("button",{name:"Retry player access"}).click();
  await page.getByTestId("scoped-account-home").waitFor();
  mark("Temporary service failures retain the saved login and recover through Retry");
  revoked=true;await page.evaluate("window.refreshChild()");
  await page.getByRole("heading",{name:"Player access could not be verified"}).waitFor();
  assert.equal(await page.getByTestId("scoped-account-home").count(),0);
  await page.reload();await page.getByRole("heading",{name:"Player access could not be verified"}).waitFor();
  mark("Server revocation blocks an open app and a cold page load despite a stored token");
  revoked=false;
  await page.evaluate(({key,legacy})=>{localStorage.removeItem(key);sessionStorage.setItem(key,legacy);},{key,legacy});
  await page.reload();await page.getByTestId("scoped-account-home").waitFor();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),legacy);
  assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key),null);
  mark("An existing tab-only child login upgrades without a new parent code");
  await context.close();context=await launch();page=await open();await page.goto(origin);
  await page.getByTestId("scoped-account-home").waitFor();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),legacy);
  mark("The upgraded legacy login also survives full shutdown and reopen");
  const other=await open();await other.goto(origin);await other.getByTestId("scoped-account-home").waitFor();
  await page.evaluate("window.clearChild()");
  await other.getByRole("heading",{name:"Parent setup code"}).waitFor();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);
  assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key),null);
  mark("Explicit sign-out clears both storage types and synchronizes other open tabs");
  await other.close();
  await page.evaluate(key=>localStorage.setItem(key,"not-a-child-token"),key);
  await page.reload();await page.getByRole("heading",{name:"Parent setup code"}).waitFor();
  mark("Malformed saved values never authenticate a child");
  await page.evaluate(key=>localStorage.removeItem(key),key);
  await page.addInitScript(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(this===window.localStorage)throw new Error("Synthetic storage denial");
      original.call(this,key,value);
    };
  });
  await page.reload();await page.getByRole("button",{name:"Approve this synthetic phone"}).click();
  await page.getByTestId("scoped-account-home").waitFor();
  await page.getByRole("alert").getByText(/This device is not saving player sign-in/).waitFor();
  mark("Blocked persistent storage produces an explicit warning, not a false persistence claim");
  assert.deepEqual(errors,[]);
  assert.ok(requests.length>5);
  assert.ok(requests.every(req=>!req.cookie&&(
    (req.method==="GET"&&req.url==="/api/high-school/child-device/session"&&[`Bearer ${token}`,`Bearer ${legacy}`].includes(req.auth??""))||
    (req.method==="POST"&&req.url==="/api/high-school/parent-verification/forget-device"&&!req.auth))),
    JSON.stringify(requests.map(req=>({url:req.url,hasAuth:!!req.auth,hasCookie:!!req.cookie}))));
  mark("Every protected read uses the child-only bearer; other requests only discard parent-device authority");
  console.log(JSON.stringify({outcome:"passed",checks,scope:"Production components with synthetic HTTP; real browser process restarts, not native-device acceptance"},null,2));
  await writeFile(`${out}/report.json`,JSON.stringify({checks,errors},null,2));
} catch(error) {
  console.error("Browser errors:",errors);
  console.error("Visible page:",await context.pages().at(-1)?.locator("body").innerText().catch(()=>"(unavailable)"));
  throw error;
} finally {
  await context.close();await new Promise<void>(resolve=>server.close(()=>resolve()));
  await rm(profile,{recursive:true,force:true});
}
