/** Real child and staff Home components; synthetic scoped API data only.
 * No hosted database, parent login, mail, real child or production calls. */
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import express from "express";
import { chromium } from "playwright-core";

const root = process.cwd();
const out = "generated-artifacts/account-home";
await mkdir(out, {recursive:true});
const bundle = await build({
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  alias:{"@":path.join(root,"client/src"),"@shared":path.join(root,"shared"),"@assets":path.join(root,"attached_assets")},
  loader:{".css":"empty",".png":"dataurl"},
  define:{"import.meta.env":JSON.stringify({PROD:true,DEV:false}),"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"synthetic-staff-transport",setup(b) {
    b.onResolve({filter:/(?:^@\/lib\/queryClient$|^\.\/queryClient$)/},()=>({path:"queryClient",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"ts",resolveDir:root,contents:`
      import{QueryClient}from'@tanstack/react-query';
      export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
      export class ApiError extends Error{};
      export async function apiRequest(method,path,body,signal){
        const r=await fetch(path,{method,signal,headers:{Authorization:'Bearer synthetic-staff','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
        if(!r.ok)throw new Error('Synthetic staff response '+r.status);
        return r;
      }`,
    }));
  }}],
  stdin:{resolveDir:root,loader:"tsx",contents:`
    import React from'react';import{createRoot}from'react-dom/client';import{QueryClientProvider}from'@tanstack/react-query';
    import{useLocation}from'wouter';
    import{queryClient}from'@/lib/queryClient';
    import{ProductionChildSession}from'./client/src/components/high-school-onboarding/ProductionChildSession';
    import{TeamSkinShell}from'./client/src/components/high-school-skins/TeamSkinShell';
    import{HomeHeader,HomeShortcutCards,HomeScheduleToolbar}from'./client/src/components/dashboard/HomePresentation';
    import{BottomNavigationView}from'./client/src/components/BottomNavigationView';
    const params=new URLSearchParams(location.search);window.fixtureRole=params.get('role')||'child';
    window.fixtureState=params.get('state')||'connected';window.fixtureSignedOut=false;
    const team={id:'varsity',name:'Northfield Varsity',program_type:'high_school',role:window.fixtureRole,status:'approved'};
    function App(){
      const[path,navigate]=useLocation();
      const selected=path.includes('jv')?'jv':'varsity';
      if(window.fixtureRole==='child')return <ProductionChildSession token={'hs_child_'+'a'.repeat(43)}/>;
      if(window.fixtureRole==='reference')return <div className="min-h-screen">
        <HomeHeader dark={document.documentElement.classList.contains('dark')} onProfile={()=>{}} onRefresh={()=>{}} onMenu={()=>{}}/>
        <HomeShortcutCards onWall={()=>{}} onPhotos={()=>{}} onStats={()=>{}} onStandings={()=>{}}/>
        <div className="px-6"><HomeScheduleToolbar view="list" onViewChange={()=>{}} onViewAll={()=>{}}/></div>
        <BottomNavigationView activeId="home" onNavigate={()=>{}}/></div>;
      return <TeamSkinShell context={{actor:{id:'synthetic-coach',type:'adult'},teams:[team,{...team,id:'jv',name:'Northfield JV'}],restricted:true}}
        activeTeam={selected==='jv'?{...team,id:'jv',name:'Northfield JV'}:team}
        onTeamChange={id=>navigate('/high-school/home?team='+id)}
        operational/>;
    }
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);`,
  },
});
const future = new Date(Date.now() + 86400000).toISOString();
const chatId = "10000000-0000-4000-8000-000000000001";
const app = express(); app.use(express.json());
const requests: {path:string;method:string;auth?:string;cookie?:string}[] = [];
let state = "connected", role = "head_coach", messages = [{id:"first",sender:"Parent",body:"See you at practice.",createdAt:future}];
let createdEvents = 0;
app.use("/api", (req,_res,next) => {
  requests.push({path:req.originalUrl,method:req.method,auth:req.get("authorization"),cookie:req.get("cookie")});
  next();
});
app.get("/api/high-school/child-device/session", (_req,res) => res.json({
  child:{id:"synthetic-child",firstName:"Casey",lastName:"Fixture",birthYear:2012,gradYear:2030},
  teamStatus:state==="connected"?"connected":state,
  teams:state==="connected"?[{id:"varsity",name:"Northfield Varsity"},{id:"jv",name:"Northfield JV"}]:[],
  schedule:state==="connected"?[
    {id:"game",teamId:"varsity",title:"Varsity game",opponent:"Pink",startsAt:future,location:"Northfield Ice",status:"scheduled"},
    {id:"practice",teamId:"jv",title:"JV practice",startsAt:future,location:"Second Rink",status:"scheduled"},
  ]:[],
  chats:[{id:chatId,name:"Family",kind:"family"}],
}));
app.get(`/api/high-school/child-device/chats/${chatId}/messages`, (_req,res) => res.json({messages}));
app.post(`/api/high-school/child-device/chats/${chatId}/messages`, (req,res) => {
  messages.push({id:`reply-${messages.length}`,sender:"Casey",body:req.body.body,createdAt:future});
  res.json({saved:true});
});
app.get("/api/high-school/staff/teams/:teamId", (req,res) => res.json({
  team:{id:req.params.teamId,name:req.params.teamId==="varsity"?"Northfield Varsity":"Northfield JV",programId:"program",programName:"Northfield Hockey",rink:"Northfield Ice",address:""},
  role,capabilities:{manageStaff:false,manageProgram:false,createPayments:false,paymentReason:"No entitlement"},
  roster:[],callupCandidates:[],events:[{id:"staff-game",version:1,title:"Varsity game",opponent:"Pink",startsAt:future,rink:"Northfield Ice",address:"",status:"scheduled",homeScore:null,awayScore:null,reportAvailable:false}],
  rooms:[],staff:[],approvals:[],gaps:[],reports:[],audit:[],payments:[],paymentRecipients:[],
}));
app.get("/api/high-school/staff/teams/:teamId/events/:eventId/lineup",(_req,res)=>res.json({entries:[]}));
app.post("/api/high-school/staff/teams/:teamId/events",(_req,res)=>{createdEvents++;res.json({saved:true});});
app.use("/api", (_req,res) => res.status(403).json({code:"UNEXPECTED_OR_FORBIDDEN_FIXTURE_API"}));
app.get("/fixture.css", async (_req,res) => {
  const css = (await readdir("dist/public/assets")).find(name => /^index-.*\.css$/.test(name))!;
  res.type("css").send(await readFile(path.join("dist/public/assets",css),"utf8"));
});
app.get("/bundle.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));
app.get("/patches-home-icon.png",(_req,res)=>res.sendFile(path.join(root,"client/public/patches-home-icon.png")));
app.get("*",(req,res)=>{
  const light=req.query.theme==="light";
  const child=(req.query.role??"child")==="child";
  res.type("html").send(`<!doctype html><html class="${light?"":"dark"}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>localStorage.${child?"setItem('roster-child-session','hs_child_"+"a".repeat(43)+"')":"removeItem('roster-child-session')"}</script><script src="/bundle.js"></script></body></html>`);
});
const server=app.listen(process.argv.includes("--serve")?3003:0,"127.0.0.1");
await new Promise<void>(resolve=>server.once("listening",resolve));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
let checks=0;
try {
  for(const width of [390,456,1440]) {
    const page=await browser.newPage({viewport:{width,height:1024}});
    const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    state="connected";requests.length=0;
    await page.goto(`${origin}/?role=child`);
    await page.getByTestId("scoped-account-home").waitFor();
    for(const id of ["img-roster-logo","button-selector","card-announcements","card-photos","card-stats","card-standings","button-patches-home","text-schedule-title","bottom-navigation"])
      await page.getByTestId(id).waitFor();
    assert.equal(await page.getByText("You're in, Casey",{exact:true}).count(),0);
    assert.equal(await page.getByText("JV practice",{exact:true}).count(),0);
    assert.equal(await page.getByTestId("text-games-remaining").innerText(),"1");
    assert.equal(await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);checks++;
    if(width===390)await page.screenshot({path:`${out}/child-home.png`});
    await page.getByTestId("card-stats").click();
    await page.getByRole("dialog").getByText("Stats is not available in this player session yet.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Close",exact:true}).click();
    await page.getByTestId("nav-payments").click();
    await page.getByRole("dialog").getByText("Payments are not available from this player session.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Close",exact:true}).click();checks++;
    await page.getByTestId("button-selector").click();
    await page.getByRole("button",{name:/^Northfield JV/}).click();
    await page.getByText("JV practice",{exact:true}).waitFor();
    assert.equal(await page.getByRole("heading",{name:"vs Pink",exact:true}).count(),0);
    await page.getByRole("button",{name:"View JV practice",exact:true}).click();
    await page.getByRole("dialog").getByText("Second Rink",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Close",exact:true}).click();checks++;
    await page.getByTestId("mobile-schedule-toggle-calendar").click();
    await page.getByLabel("Team schedule calendar",{exact:true}).waitFor();
    await page.getByTestId("mobile-schedule-toggle-list").click();checks++;
    await page.getByTestId("nav-messages").click();
    await page.getByRole("button",{name:"Family",exact:true}).click();
    await page.getByLabel("Message this approved chat").fill("Ready for practice.");
    await page.getByRole("button",{name:"Send message",exact:true}).click();
    await page.getByText("Ready for practice.",{exact:true}).first().waitFor();
    assert.ok(requests.some(req=>req.method==="POST"&&req.path.includes("/chats/")));
    assert.ok(requests.every(req=>req.path.startsWith("/api/high-school/child-device/")));
    assert.ok(requests.every(req=>req.auth===`Bearer hs_child_${"a".repeat(43)}`&&!req.cookie));checks++;
    await page.getByTestId("nav-profile").click();
    await page.getByText("Birth year: 2012",{exact:true}).waitFor();
    assert.equal(await page.getByRole("textbox").count(),0);checks++;
    await page.getByTestId("nav-home").click();
    state="coverage_pending";
    await page.getByTestId("button-refresh-home").click();
    await page.getByText("Your team is connected",{exact:true}).waitFor();
    assert.equal(await page.getByRole("heading",{name:"JV practice",exact:true}).count(),0);checks++;
    state="awaiting_team";
    await page.getByTestId("button-refresh-home").click();
    await page.getByText("Ready for your team",{exact:true}).waitFor();
    if(width===390)await page.screenshot({path:`${out}/child-no-team-home.png`});
    await page.getByRole("button",{name:"Open menu",exact:true}).click();
    await page.getByRole("button",{name:"Sign out of player session",exact:true}).waitFor();
    await page.getByRole("button",{name:"Close",exact:true}).click();checks++;
    for(role of ["head_coach","assistant_coach","team_manager","athletic_director"]) {
      requests.length=0;
      await page.goto(`${origin}/high-school/home?role=${role}`);
      await page.getByTestId("scoped-account-home").waitFor();
      await page.getByRole("heading",{name:"vs Pink",exact:true}).waitFor();
      assert.equal(await page.getByTestId("text-games-remaining").innerText(),"1");
      assert.equal(await page.getByTestId("bottom-navigation").innerText(),"My Team\nMessages\nHome\nPayments\nProfile");
      assert.ok(requests.every(req=>req.path.startsWith("/api/high-school/staff/")));
      assert.equal(await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
      if(width===390&&role==="head_coach")await page.screenshot({path:`${out}/coach-home.png`});
      await page.getByRole("button",{name:"View vs Pink",exact:true}).click();
      await page.getByRole("button",{name:"Set lineup",exact:true}).waitFor();
      await page.getByRole("button",{name:"Close",exact:true}).click();
      await page.getByTestId("button-add-event").click();
      await page.getByRole("dialog").waitFor();
      // The original coach add-event form remains available, not a no-op.
      assert.ok(await page.getByRole("textbox").count()>0);
      await page.getByRole("button",{name:"Close",exact:true}).click();checks++;
      await page.getByTestId("nav-messages").click();
      await page.waitForURL("**/high-school/chat");
      await page.getByTestId("skin-tab-home").click();
      await page.getByTestId("scoped-account-home").waitFor();checks++;
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log(JSON.stringify({outcome:"passed",checks,viewports:[390,456,1440],scope:"Real production child and coach Home with synthetic scoped HTTP only; no live/native claims"}));
  if(process.argv.includes("--serve")){console.log(`Scoped account Home fixture ready on ${origin}`);await new Promise(()=>{});}
} finally {
  await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));
}
