/** Offline browser acceptance of the actual production pairing screen.
 * No provider, production-user, native-device or real-mail claims. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import path from "node:path";
import { readFile } from "node:fs/promises";

const root=process.cwd(),challenge="10000000-0000-4000-8000-000000000004";
const bundle=await build({
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  alias:{"@":path.join(root,"client/src")},loader:{".css":"empty"},
  define:{"import.meta.env":JSON.stringify({PROD:true,DEV:false}),"process.env.NODE_ENV":'"production"'},
  stdin:{resolveDir:root,loader:"tsx",contents:`
    import React from 'react';import{createRoot}from'react-dom/client';
    import Under18 from './client/src/pages/Under18Onboarding';
    window.fixtureRequests=[];
    const request=async(method,url,body)=>{
      window.fixtureRequests.push({method,url});
      if(url.endsWith('/start')){
        if(body.challengeId!=='${challenge}'||body.code!=='K7P2QX')throw Error('Unexpected fixture input');
        return{requestId:'10000000-0000-4000-8000-000000000007',requestToken:'a'.repeat(43),status:'waiting'};
      }
      if(url.endsWith('/poll'))return{status:new URLSearchParams(location.search).get('decision')||'approved',sessionToken:'hs_child_'+'b'.repeat(43)};
      if(url.endsWith('/session'))return{child:{firstName:'Synthetic Player'},schedule:[],chats:[]};
      throw Error('Unexpected fixture action');
    };
    createRoot(document.getElementById('root')).render(<Under18 request={request}/>);
  `},
});
const css=await readFile("client/src/components/high-school-onboarding/onboarding.css","utf8");
const server=createServer((req,res)=>{
  const js=req.url?.startsWith("/bundle.js");
  res.setHeader("Content-Type",js?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(js?bundle.outputFiles[0].text:`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script src="/bundle.js"></script>`);
});
await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
let checks=0;
try{
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors:string[]=[];let apiCalls=0;
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{apiCalls++;return route.abort();});
    await page.goto(`${origin}/under-18/code`);
    assert.equal(await page.getByRole("textbox",{name:"Code character 1",exact:true}).count(),0);
    assert.equal(await page.evaluate("window.fixtureRequests.length"),0);checks++;
    for(const decision of ["approved","denied","expired"]){
      await page.goto(`${origin}/under-18/code?challengeId=${challenge}&decision=${decision}`);
      for(const [i,char] of [..."K7P2QX"].entries())
        await page.getByRole("textbox",{name:`Code character ${i+1}`,exact:true}).fill(char);
      await page.getByRole("button",{name:"Continue",exact:true}).click();
      await page.getByRole("heading",{name:"Waiting for your parent"}).waitFor();
      const heading=decision==="approved"?"You're in, Synthetic Player":decision==="denied"?"Your parent didn't approve this phone":"This request expired";
      await page.getByRole("heading",{name:heading,exact:true}).waitFor({timeout:10000});
      const calls=await page.evaluate("window.fixtureRequests") as Array<{method:string;url:string}>;
      assert.ok(calls.some(call=>call.url.endsWith("/poll")));
      assert.equal(calls.some(call=>call.url.endsWith("/session")),decision==="approved");
      assert.ok(!page.url().includes("K7P2QX"));
      assert.ok(await page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"));checks++;
    }
    assert.deepEqual(errors,[]);assert.equal(apiCalls,0);await page.close();
  }
  console.log(JSON.stringify({outcome:"passed",checks,viewports:[390,1440],realApiCalls:0,scope:"Offline production UI adapters; not native/provider acceptance"}));
}finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
