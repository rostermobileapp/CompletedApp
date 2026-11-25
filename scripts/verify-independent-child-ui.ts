/** Isolated browser checks of the actual family form and child phone screen.
 * In-memory API adapters only; no hosted accounts, email or production data. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root=process.cwd();
const mocks:Record<string,string>={
  "@/pages/ParentVerification":`export default function Verification(){return null}`,
  "@/lib/queryClient":`export class ApiError extends Error{};export const apiRequest=()=>{throw Error("Unexpected real API")}`,
  "./queryClient":`export class ApiError extends Error{};export const apiRequest=()=>{throw Error("Unexpected real API")}`,
};
const bundle=await build({
  bundle:true,write:false,format:"iife",jsx:"automatic",loader:{".css":"empty"},
  alias:{"@":path.join(root,"client/src"),"@shared":path.join(root,"shared")},
  define:{"import.meta.env":JSON.stringify({PROD:true,DEV:false}),"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"isolated-family-api",setup(b){
    b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:"fixture"}:undefined);
    b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path],loader:"tsx",resolveDir:root}));
  }}],
  stdin:{loader:"tsx",resolveDir:root,contents:`
    import React from 'react';import{createRoot}from'react-dom/client';
    import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
    import{FamilySetup}from'./client/src/components/high-school-family/FamilySetup';
    import{ChildProfileScreen}from'./client/src/components/high-school-onboarding/ChildProfileScreen';
    import{HS_CONSENT_VERSION}from'./shared/highSchoolOnboarding';
    const player={id:'10000000-0000-4000-8000-000000000004',firstName:'Casey',lastName:'Original',
      gradYear:2030,position:'F',jerseyNumber:'',consent:false,consentVersion:HS_CONSENT_VERSION,photoConsent:false,publicNameConsent:false};
    window.fixture={posts:[],connected:false,covered:true};
    let state={started:true,verified:true,revision:0,status:'draft',players:[player],
      guardianConfirmed:false,imported:false,requests:[],maximumPlayers:2,activationAvailable:false};
    const request=async(method,url,body)=>{
      if(url.endsWith('/session'))return {child:{firstName:'Casey',birthYear:2012,gradYear:2030},
        teamStatus:window.fixture.connected?(window.fixture.covered?'connected':'coverage_pending'):'awaiting_team',
        teams:window.fixture.connected&&window.fixture.covered?[{id:'owned-team',name:'My approved team'}]:[],
        schedule:window.fixture.connected&&window.fixture.covered?[{id:'owned-game',title:'Approved practice'}]:[],
        chats:window.fixture.connected&&window.fixture.covered?[{id:'owned-chat',name:'My team chat',kind:'team'}]:[]};
      if(method==='GET'&&url.endsWith('/state'))return structuredClone(state);
      if(method==='POST'&&url.endsWith('/consent')){
        window.fixture.posts.push(structuredClone(body));state={...state,players:body.players,guardianConfirmed:true,revision:state.revision+1};return{saved:true};
      }
      throw Error('Unexpected fixture request: '+url);
    };
    const mode=new URLSearchParams(location.search).get('mode');
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}>
      {mode==='child'?<ChildProfileScreen data={{child:{firstName:'Casey'},teamStatus:'awaiting_team',schedule:[],chats:[]}} request={request}/>
        :<FamilySetup request={request} onExit={()=>{}} onTeamChange={()=>{}}/>}
    </QueryClientProvider>);
  `},
});
const css=(await Promise.all([
  readFile("client/src/components/high-school-onboarding/onboarding.css","utf8"),
  readFile("client/src/components/high-school-family/family-setup.css","utf8"),
])).join("\n");
const server=createServer((req,res)=>{
  const js=req.url?.startsWith("/bundle.js");
  res.setHeader("Content-Type",js?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(js?bundle.outputFiles[0].text:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/bundle.js"></script>`);
});
await new Promise<void>(resolve=>server.listen(process.argv.includes("--serve")?3003:0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
if(process.argv.includes("--serve")){
  console.log(`Isolated child setup fixture: ${origin}`);
  await new Promise(()=>{});
}
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
let checks=0;
try{
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors:string[]=[];let realApiCalls=0;
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{realApiCalls++;return route.abort();});
    await page.goto(origin);
    await page.getByLabel("Last name",{exact:true}).fill("Fixture");
    await page.getByLabel("Birth year",{exact:true}).selectOption("2012");
    const photo=page.getByRole("checkbox",{name:"Allow this player’s photo to be shown to their team"});
    const publicName=page.getByRole("checkbox",{name:"Allow this player’s name in public results"});
    await photo.check();await photo.uncheck();await publicName.check();checks++;
    await page.getByRole("checkbox",{name:"I am this player’s parent or legal guardian, and I agree to the privacy terms."}).check();
    await page.getByRole("checkbox",{name:"I am the authorized adult guardian for these players."}).check();
    await page.getByRole("button",{name:"Save child consent",exact:true}).click();
    await page.getByText("Child privacy choices saved. Team access still depends on team approval.",{exact:true}).waitFor();
    const posts=await page.evaluate("window.fixture.posts") as any[];
    assert.equal(posts.length,1);assert.equal(posts[0].players[0].birthYear,2012);
    assert.equal(posts[0].players[0].lastName,"Fixture");
    assert.equal(posts[0].players[0].photoConsent,false);assert.equal(posts[0].players[0].publicNameConsent,true);
    assert.equal(posts[0].players[0].consent,true);checks++;
    assert.ok(await page.evaluate("document.documentElement.scrollWidth<=innerWidth"));checks++;
    await page.goto(`${origin}/?mode=child`);
    await page.getByText("Ready for your team",{exact:true}).waitFor();
    await page.evaluate("window.fixture.connected=true;window.dispatchEvent(new Event('focus'))");
    await page.getByText("Approved practice",{exact:true}).waitFor();
    await page.getByRole("button",{name:"My team chat",exact:true}).waitFor();checks++;
    await page.evaluate("window.fixture.covered=false;window.dispatchEvent(new Event('focus'))");
    await page.getByText("Your team is connected",{exact:true}).waitFor();
    assert.equal(await page.getByText("Approved practice",{exact:true}).count(),0);
    assert.equal(await page.getByRole("button",{name:"My team chat",exact:true}).count(),0);checks++;
    assert.deepEqual(errors,[]);assert.equal(realApiCalls,0);await page.close();
  }
  console.log(JSON.stringify({outcome:"passed",checks,viewports:[390,1440],scope:"Real components with isolated API adapters, not live-device acceptance"}));
}finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
