/** Real local SQL, actual child/parent messaging components; synthetic approval,
 * provider transport only. Never uses hosted databases, real children or email. */
import assert from "node:assert/strict";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import express from "express";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createStaffFixture } from "../server/tests/helpers/highSchoolStaffFixture";
import { HighSchoolChildDevices } from "../server/highSchoolChildDevices";
import { HS_CONSENT_VERSION } from "../shared/highSchoolOnboarding";

const root=process.cwd(),out="generated-artifacts/parent-child-chat";
const f=await createStaffFixture(),{pool,actors,ids}=f;
let verified=true;
const service=new HighSchoolChildDevices(pool,{authorized:async()=>verified} as any,true);
const migration=await readFile("scripts/production/high-school-parent-child-chat.sql","utf8");
const checks:string[]=[];const mark=(text:string)=>checks.push(text);
const tokens:Record<string,string>={};
let server:any,browser:any;
try{
  await pool.query("UPDATE hs_onboarding.children SET enabled=true");
  await pool.query("UPDATE hs_onboarding.player_requests SET consent_version=$1 WHERE id=$2",[HS_CONSENT_VERSION,ids.req3]);
  await pool.query("UPDATE hs_onboarding.children SET first_name='Casey' WHERE id=$1",[ids.child1]);
  await pool.query("UPDATE hs_onboarding.children SET first_name='Jamie' WHERE id=$1",[ids.child3]);
  await pool.query(migration);await pool.query(migration);
  assert.deepEqual((await service.parentChats(actors.parent)).threads,[]);
  const db=await pool.connect();
  try{
    for(const role of ["anon","authenticated","service_role"]){
      await db.query(`SET ROLE ${role}`);
      await assert.rejects(()=>db.query("SELECT * FROM hs_onboarding.parent_child_messages"));
      await db.query("RESET ROLE");
    }
  }finally{await db.query("RESET ROLE");db.release();}
  mark("Unpaired profiles do not create threads; browser/database API roles cannot read the private table");
  for(const [childId,actor] of [[ids.child1,actors.parent],[ids.child3,actors.parent],[ids.child2,actors.otherParent]] as const){
    const code=await service.createCode(actor,{childId});
    const waiting=await service.start({code:code.code,challengeId:code.challengeId},"synthetic-phone");
    await service.decision(actor,waiting.requestId!,{approve:true});
    tokens[childId]=(await service.poll({requestId:waiting.requestId,requestToken:waiting.requestToken})).sessionToken!;
  }
  const threads=await service.parentChats(actors.parent);
  assert.deepEqual(threads.threads.map(t=>t.name),["Casey Synthetic","Jamie Synthetic"]);
  assert.equal(threads.threads.some(t=>t.id===ids.child2),false);
  const childSession=await service.ownSession(tokens[ids.child1]);
  assert.equal(childSession.chats.find(c=>c.kind==="family")?.id,ids.child1);
  mark("Pairing creates named child threads before any first message; households are isolated");
  const requestId=randomUUID();
  await service.sendParentMessage(actors.parent,ids.child1,{body:"Parent hello",requestId});
  await service.sendParentMessage(actors.parent,ids.child1,{body:"Parent hello",requestId});
  assert.equal((await service.messages(tokens[ids.child1],ids.child1)).messages.length,1);
  await service.sendMessage(tokens[ids.child1],ids.child1,{body:"Child hello"});
  assert.deepEqual((await service.parentMessages(actors.parent,ids.child1)).messages.map(m=>m.body),["Parent hello","Child hello"]);
  assert.deepEqual((await service.messages(tokens[ids.child3],ids.child3)).messages,[]);
  mark("Parent/child replies share one private history; parent retries do not duplicate messages");
  for(const work of [
    ()=>service.parentMessages(actors.otherParent,ids.child1),
    ()=>service.sendParentMessage(actors.otherParent,ids.child1,{body:"Forbidden"}),
    ()=>service.messages(tokens[ids.child3],ids.child1),
    ()=>service.sendMessage(tokens[ids.child3],ids.child1,{body:"Forbidden"}),
  ])await assert.rejects(work);
  verified=false;await assert.rejects(()=>service.parentMessages(actors.parent,ids.child1));
  await assert.rejects(()=>service.sendParentMessage(actors.parent,ids.child1,{body:"Forbidden"}));verified=true;
  await assert.rejects(()=>service.sendParentMessage(actors.parent,ids.child1,{body:" ",sender:"forged"}));
  mark("Sibling, cross-parent, missing-parent-proof and forged-message requests are rejected");
  const familyRoom=randomUUID(),legacyId=randomUUID();
  await pool.query(`INSERT INTO hs_onboarding.child_chats(id,kind,name,parent_auth_id) VALUES($1,'family','Family',$2)`,
    [familyRoom,actors.parent.authId]);
  await pool.query("INSERT INTO hs_onboarding.child_messages(id,chat_id,child_id,body) VALUES($1,$2,$3,'My old message')",
    [legacyId,familyRoom,ids.child1]);
  await pool.query(migration);
  assert.ok((await service.messages(tokens[ids.child1],ids.child1)).messages.some(m=>m.id===legacyId));
  assert.deepEqual((await service.messages(tokens[ids.child3],ids.child3)).messages,[]);
  mark("Repeat-safe migration preserves each child's own old messages without copying sibling history");
  // Exercise real scroll geometry rather than a two-message, non-scrolling chat.
  for(let i=0;i<18;i++)await service.sendParentMessage(actors.parent,ids.child1,{
    body:`Earlier practice note ${i+1}. ${"Please bring your equipment and water. ".repeat(8)}`,
  });

  const bundle=await build({bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
    alias:{"@":path.join(root,"client/src"),"@shared":path.join(root,"shared"),"@assets":path.join(root,"attached_assets")},
    loader:{".css":"empty",".png":"dataurl"},
    define:{"import.meta.env":JSON.stringify({PROD:true,DEV:false}),"process.env.NODE_ENV":'"production"'},
    plugins:[{name:"synthetic-parent-provider",setup(b){
      b.onResolve({filter:/queryClient$/},()=>({path:"queryClient",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"tsx",resolveDir:root,contents:`
        import{QueryClient}from'@tanstack/react-query';
        export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
        export class ApiError extends Error{}
        window.refreshMessages=()=>queryClient.invalidateQueries();
        export async function apiRequest(method,url,body,signal){
          const r=await fetch(url,{method,signal,headers:{Authorization:'Bearer synthetic-parent','Content-Type':'application/json'},
            body:body===undefined?undefined:JSON.stringify(body)});
          if(!r.ok)throw Error('Synthetic parent response '+r.status);return r;
        }`,
      }));
    }}],
    stdin:{loader:"tsx",resolveDir:root,contents:`
      import React,{useState}from'react';import{createRoot}from'react-dom/client';
      import{QueryClientProvider}from'@tanstack/react-query';import{queryClient}from'@/lib/queryClient';
      import{ParentChildThreads}from'./client/src/components/high-school-family/ParentChildThreads';
      import{ProductionChildSession}from'./client/src/components/high-school-onboarding/ProductionChildSession';
      import{FamilyDevices}from'./client/src/components/high-school-family/FamilyDevices';
      import{TeamSkinShell}from'./client/src/components/high-school-skins/TeamSkinShell';
      import{BottomNavigationView}from'./client/src/components/BottomNavigationView';
      function App(){const[team,setTeam]=useState('adult-one');const[hasThreads,setHasThreads]=useState(false);return new URLSearchParams(location.search).has('child')?
        <ProductionChildSession token={window.childToken}/>:new URLSearchParams(location.search).has('school')?
        <TeamSkinShell context={{actor:{id:"${actors.parent.authId}",type:"adult"},restricted:true,
          teams:['adult-one','adult-two'].map(id=>({id,name:id,program_type:'high_school',role:'parent',status:'approved'}))}}
          activeTeam={{id:team,name:team,program_type:'high_school',role:'parent',status:'approved'}}
          operational onTeamChange={setTeam}/>:<><main className="p-4">
          <label>Team<select aria-label="Team selection" value={team} onChange={e=>setTeam(e.target.value)}>
            <option value="adult-one">Adult team one</option><option value="adult-two">Adult team two</option>
            <option value="school">School team</option><option value="all">All teams</option></select></label>
          <ParentChildThreads actorId="${actors.parent.authId}" onHasThreadsChange={setHasThreads}/>
          {!hasThreads&&<p data-testid="empty-conversations">No conversations yet</p>}
          <div className="hsy family-setup"><FamilyDevices actorId="${actors.parent.authId}"/></div></main>
          <BottomNavigationView activeId="messages" onNavigate={()=>{}}/></>}
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);`,
    }});
  const app=express();app.use(express.json());
  const apiCalls:{path:string;auth?:string}[]=[];
  app.use("/api",(req,_res,next)=>{apiCalls.push({path:req.path,auth:req.get("authorization")});next();});
  const handle=(work:(req:any)=>Promise<any>)=>async(req:any,res:any)=>{
    try{res.json(await work(req));}catch(error:any){res.status(error.status??400).json({code:error.code??"DENIED"});}
  };
  const parent=(work:(req:any)=>Promise<any>)=>handle(async req=>{
    assert.equal(req.get("authorization"),"Bearer synthetic-parent");return work(req);
  });
  app.get("/api/high-school/parent-verification/status",parent(async()=>({enrolled:true,verified})));
  const base="/api/high-school/onboarding";
  app.get(`${base}/child-chats`,parent(()=>service.parentChats(actors.parent)));
  app.get(`${base}/child-chats/:id/messages`,parent(req=>service.parentMessages(actors.parent,req.params.id)));
  app.post(`${base}/child-chats/:id/messages`,parent(req=>service.sendParentMessage(actors.parent,req.params.id,req.body)));
  app.get(`${base}/children`,parent(async()=>{
    const result=await service.children(actors.parent);
    return {...result,children:result.children.map(child=>({...child,canActivate:child.enabled}))};
  }));
  app.get(`${base}/device-requests`,parent(()=>service.requests(actors.parent)));
  app.get(`${base}/device-sessions`,parent(()=>service.sessions(actors.parent)));
  app.get("/api/high-school/child-device/session",handle(req=>service.ownSession(req.get("authorization")?.slice(7))));
  app.get("/api/high-school/child-device/chats/:id/messages",handle(req=>service.messages(req.get("authorization")?.slice(7),req.params.id)));
  app.post("/api/high-school/child-device/chats/:id/messages",handle(req=>service.sendMessage(req.get("authorization")?.slice(7),req.params.id,req.body)));
  app.use("/api",(_req,res)=>res.status(403).json({code:"UNEXPECTED_API"}));
  app.get("/fixture.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));
  app.get("/fixture.css",async(_req,res)=>{
    const css=(await readdir("dist/public/assets")).find(name=>/^index-.*\.css$/.test(name))!;
    res.type("css").send(await readFile(`dist/public/assets/${css}`,"utf8"));
  });
  app.get("/patches-home-icon.png",(_req,res)=>res.sendFile(path.join(root,"client/public/patches-home-icon.png")));
  app.get("*",(_req,res)=>res.type("html").send(`<!doctype html><html class="dark"><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css">
    <div id="root"></div><script>window.childToken=${JSON.stringify(tokens[ids.child1])};
    localStorage.setItem('roster-child-session',window.childToken);</script><script src="/fixture.js"></script></html>`));
  server=app.listen(process.argv.includes("--serve")?3003:0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  await mkdir(out,{recursive:true});
  const errors:string[]=[];
  for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:900}});
    const parentPage=await context.newPage(),childPage=await context.newPage();
    for(const page of [parentPage,childPage]){
      page.setDefaultTimeout(12_000);page.on("pageerror",error=>errors.push(error.message));
      await page.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    }
    await parentPage.goto(origin);
    for(const team of ["adult-one","adult-two","school","all"]){
      await parentPage.getByLabel("Team selection").selectOption(team);
      await parentPage.getByRole("button",{name:"Message Casey Synthetic",exact:true}).waitFor();
      await parentPage.getByRole("button",{name:"Message Jamie Synthetic",exact:true}).waitFor();
      await parentPage.getByTestId("empty-conversations").waitFor({state:"detached"});
    }
    assert.equal(await parentPage.getByText("Expires 12/31/1969",{exact:false}).count(),0);
    assert.ok(await parentPage.getByText("Stays signed in until you sign out this device.",{exact:true}).count()>0);
    await parentPage.getByRole("button",{name:"Message Casey Synthetic",exact:true}).click();
    assert.equal(await parentPage.getByRole("dialog").count(),0,"Private chat must use the regular thread, not a dialog");
    assert.equal(await parentPage.getByRole("textbox",{name:"Message Casey Synthetic",exact:true}).evaluate(node=>node.tagName),"TEXTAREA");
    const text=`Parent browser message ${width}`;
    await parentPage.getByRole("textbox",{name:"Message Casey Synthetic",exact:true}).fill(text);
    await parentPage.getByRole("button",{name:"Send message to child"}).click();
    await parentPage.getByLabel("Conversation with Casey Synthetic",{exact:true}).getByText(text,{exact:true}).waitFor();
    await childPage.bringToFront();await childPage.goto(`${origin}/?child=1`);
    await childPage.getByTestId("nav-messages").click();
    await childPage.getByRole("button",{name:"Message Parent",exact:true}).click();
    await childPage.getByText(text,{exact:true}).waitFor();
    assert.equal(await childPage.getByLabel("Message this approved chat").evaluate(node=>node.tagName),"TEXTAREA");
    const reply=`Child browser reply ${width}\nReady for practice.`;
    await childPage.getByLabel("Message this approved chat").fill(`Child browser reply ${width}`);
    await childPage.getByLabel("Message this approved chat").press("Shift+Enter");
    await childPage.keyboard.insertText("Ready for practice.");
    assert.equal(await childPage.getByLabel("Message this approved chat").inputValue(),reply);
    await childPage.getByRole("button",{name:"Send message",exact:true}).click();
    await childPage.getByText(reply,{exact:true}).waitFor();
    await parentPage.bringToFront();
    await parentPage.getByLabel("Conversation with Casey Synthetic",{exact:true}).getByText(reply,{exact:true}).waitFor();
    await parentPage.getByRole("textbox",{name:"Message Casey Synthetic",exact:true}).fill(`Parent follow-up ${width}`);
    await parentPage.getByRole("button",{name:"Send message to child"}).click();
    await childPage.bringToFront();
    await childPage.getByText(`Parent follow-up ${width}`,{exact:true}).waitFor();
    for(const page of [parentPage,childPage]){
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Chat must not overflow horizontally");
      const input=page===parentPage?page.getByRole("textbox",{name:"Message Casey Synthetic",exact:true}):page.getByLabel("Message this approved chat");
      const rect=await input.boundingBox();
      assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=900,"Composer must remain within the visible viewport");
      const navigation=await page.getByTestId("bottom-navigation").boundingBox();
      assert.ok(navigation&&rect.y+rect.height<=navigation.y,"Composer must stay above the adult bottom navigation");
      for(const name of ["Attach file","Send GIF","Create Poll","Request Payment"]){
        assert.equal(await page.getByRole("button",{name,exact:true}).count(),0,"Unsupported adult-only tools must not be invented");
      }
    }
    const bubbleColor=async(page:any,content:string)=>page.getByText(content,{exact:true}).evaluate((node:Element)=>{
      for(let element:Element|null=node;element;element=element.parentElement){
        const color=getComputedStyle(element).backgroundColor;
        if(color!=="rgba(0, 0, 0, 0)"&&color!=="transparent")return color;
      }
      return "";
    });
    assert.equal(await bubbleColor(parentPage,text),"rgb(60, 130, 244)","Parent outgoing bubble must match adult blue");
    assert.equal(await bubbleColor(childPage,text),"rgb(33, 33, 33)","Child incoming bubble must match adult chat");
    assert.equal(await bubbleColor(childPage,reply),"rgb(60, 130, 244)","Child outgoing bubble must match adult blue");
    await parentPage.screenshot({path:`${out}/parent-thread-${width}.png`});
    await childPage.screenshot({path:`${out}/child-thread-${width}.png`});
    for(const [name,page] of [["parent",parentPage],["child",childPage]] as const){
      await page.evaluate(()=>document.documentElement.classList.remove("dark"));
      await page.screenshot({path:`${out}/${name}-thread-light-${width}.png`});
      await page.evaluate(()=>document.documentElement.classList.add("dark"));
    }
    await childPage.getByRole("button",{name:"Back to messages",exact:true}).click();
    await childPage.getByRole("button",{name:"Message Parent",exact:true}).waitFor();
    await parentPage.getByRole("button",{name:"Back to messages",exact:true}).click();
    await parentPage.getByRole("button",{name:"Message Jamie Synthetic",exact:true}).click();
    await parentPage.getByText("No messages yet. Say hello.",{exact:true}).waitFor();
    assert.equal(await parentPage.getByRole("button",{name:"Send message to child"}).isDisabled(),true);
    await parentPage.reload();await parentPage.getByRole("button",{name:"Message Casey Synthetic",exact:true}).click();
    await parentPage.getByLabel("Conversation with Casey Synthetic",{exact:true}).getByText(reply,{exact:true}).waitFor();
    await parentPage.goto(`${origin}/high-school/chat?school=1`);
    await parentPage.getByRole("button",{name:"Message Casey Synthetic",exact:true}).waitFor();
    await parentPage.getByLabel("Choose active team",{exact:true}).selectOption("adult-two");
    await parentPage.getByRole("button",{name:"Message Jamie Synthetic",exact:true}).waitFor();
    await parentPage.getByRole("button",{name:"Message Casey Synthetic",exact:true}).click();
    await parentPage.getByLabel("Conversation with Casey Synthetic",{exact:true}).getByText(reply,{exact:true}).waitFor();
    await context.close();
    mark(`${width}px: adult-style nonmodal thread, bubble colors, multiline composer, light/dark layouts and safe controls passed; adult/All/school selections, replies, refresh and lifetime text passed`);
  }
  assert.deepEqual(errors,[]);
  assert.equal(apiCalls.some(c=>/email|resend/i.test(c.path)),false);
  assert.ok(apiCalls.filter(c=>c.auth===`Bearer ${tokens[ids.child1]}`).every(c=>c.path.startsWith("/high-school/child-device/")));
  mark("No email requests or browser errors");
  const before=(await service.parentMessages(actors.parent,ids.child1)).messages.length;
  await service.revoke(actors.parent,ids.child1);
  await assert.rejects(()=>service.messages(tokens[ids.child1],ids.child1));
  await assert.rejects(()=>service.sendMessage(tokens[ids.child1],ids.child1,{body:"Revoked"}));
  assert.equal((await service.parentMessages(actors.parent,ids.child1)).messages.length,before);
  await pool.query("UPDATE hs_onboarding.children SET enabled=false WHERE id=$1",[ids.child1]);
  await assert.rejects(()=>service.sendParentMessage(actors.parent,ids.child1,{body:"Disabled child"}));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.parent_child_messages WHERE child_id=$1",[ids.child1])).rows[0].n,before);
  await service.messages(tokens[ids.child3],ids.child3);
  mark("Revocation blocks child reads/writes; disabled profiles reject parent writes; sibling and history remain intact");
  console.log(JSON.stringify({outcome:"passed",checks,scope:"Actual components and disposable SQL; synthetic auth, not native/provider acceptance"},null,2));
  await writeFile(`${out}/report.json`,JSON.stringify({checks,errors},null,2));
  if(process.argv.includes("--serve")){
    await pool.query("UPDATE hs_onboarding.children SET enabled=true WHERE id=$1",[ids.child1]);
    const code=await service.createCode(actors.parent,{childId:ids.child1});
    const request=await service.start({code:code.code,challengeId:code.challengeId},"synthetic-preview");
    await service.decision(actors.parent,request.requestId!,{approve:true});
    tokens[ids.child1]=(await service.poll({requestId:request.requestId,requestToken:request.requestToken})).sessionToken!;
    console.log(`Private-chat fixture ready on ${origin}`);await new Promise(()=>{});
  }
}finally{
  await browser?.close();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  await f.close();
}
