/**
 * Isolated UI verification. Real award components, synthetic API/auth only.
 * No app database, credentials, provider, or push calls. Never imported by app.
 */
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import type { TeamAward, TeamAwardsBundle } from "../shared/teamAwards";

const bundle: TeamAwardsBundle = {
  enabled:true, canManage:true, timezone:"America/New_York", activeLimit:5, removalLimit:10,
  roster:[{id:"captain",name:"Alex Captain"},{id:"player",name:"Jordan Player"}],awards:[],
};
const requests: any[]=[];
let providerSuccess=false;
const state = `
import React from 'react';import {QueryClient} from '@tanstack/react-query';
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
export async function apiRequest(method,url,data){const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok){const d=await r.json();throw new Error(d.message)}return r}
export function useToast(){return {toast:(d)=>{document.getElementById('notice').textContent=d.description||d.title}}}
export function useAuth(){return {user:{id:'captain'},isAuthenticated:true,isLoading:false}}
`;
const built=await build({
  stdin:{contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClientProvider} from '@tanstack/react-query';import {queryClient} from 'fixture-state';
    import {TeamAwardsSection} from './client/src/components/team-awards/TeamAwardsSection';
    import {TeamAwardHolderStrip,PlayerAwardBadges,useTeamAwardHolders} from './client/src/components/team-awards/TeamAwardHolders';
    import {GameTeamAwardPrompt} from './client/src/components/team-awards/GameTeamAwardPrompt';
    function App(){const h=useTeamAwardHolders();return <main className="mx-auto max-w-3xl space-y-6 p-4"><header className="flex justify-between"><h1 className="text-2xl font-bold">My Team</h1><TeamAwardHolderStrip playerId="captain"/></header><div id="notice" role="status"/><TeamAwardsSection teamId="team-a"/><section aria-label="Roster"><h2>Roster</h2>{['captain','player'].map(id=><div key={id} className="flex gap-3 p-3">{id}<PlayerAwardBadges playerId={id} teamId="team-a" holders={h.data||[]}/></div>)}</section><GameTeamAwardPrompt teamIds={['team-a']} gameId="game-a"/></main>}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);
  `,resolveDir:process.cwd(),loader:"tsx"},
  bundle:true,write:false,format:"esm",jsx:"automatic",
  plugins:[{name:"fixture",setup(b){
    b.onResolve({filter:/^(fixture-state|@\/lib\/queryClient|@\/hooks\/use-toast|@\/hooks\/useAuth)$/},()=>({path:"state",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:state,loader:"tsx",resolveDir:process.cwd()}));
  }}],
});
const css=await postcss([tailwindcss("./tailwind.config.ts")]).process(await readFile("client/src/index.css","utf8"),{from:"client/src/index.css"});
function holders() { return bundle.awards.filter(a=>!a.archived&&a.holder).map(a=>({
  id:a.id,teamId:a.teamId,teamName:"Ice Owls",playerId:a.holder!.id,name:a.name,presetIcon:a.presetIcon,imageUrl:a.imageUrl,imageVersion:a.imageVersion,
})); }
createServer(async(req,res)=>{
  const path=req.url!.split("?")[0];
  if(path==="/fixture.js"){res.setHeader("Content-Type","text/javascript");res.end(built.outputFiles[0].contents);return;}
  if(path==="/fixture.css"){res.setHeader("Content-Type","text/css");res.end(css.css);return;}
  if(!path.startsWith("/api/")&&!path.startsWith("/__")){
    res.setHeader("Content-Type","text/html; charset=utf-8");res.end(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`);return;
  }
  res.setHeader("Content-Type","application/json");
  let raw="";for await(const chunk of req)raw+=chunk;
  const data=raw?JSON.parse(raw):{};
  const respond=(body:any,status=200)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  if(path==="/__reset"){bundle.awards=[];bundle.canManage=true;providerSuccess=false;requests.length=0;return respond({ok:true});}
  if(path==="/__requests")return respond(requests);
  if(path==="/__mode"){if(data.captain!==undefined)bundle.canManage=data.captain;if(data.providerSuccess!==undefined)providerSuccess=data.providerSuccess;return respond({ok:true});}
  if(path==="/__seed"){
    for(let n=0;n<3;n++)bundle.awards.push(makeAward({name:`Captain award ${n+1}`,cadence:"week",holder:{id:"captain",name:"Alex Captain"}}));
    bundle.awards.push(makeAward({name:"Teammate only",cadence:"week",holder:{id:"player",name:"Jordan Player"}}));
    return respond({ok:true});
  }
  requests.push({path,method:req.method,data});
  if(path==="/api/team-awards/config")return respond({enabled:true});
  if(path==="/api/team-awards/holders")return respond(holders());
  if(path==="/api/teams/team-a/awards"&&req.method==="GET")return respond(bundle);
  if(path==="/api/teams/team-a/award-settings"){bundle.timezone=data.timezone;return respond({ok:true});}
  const award=bundle.awards.find(a=>path.includes(a.id));
  if(req.method==="POST"&&path==="/api/teams/team-a/awards"){
    const existing=bundle.awards.find(a=>a.id===data.id);
    if(existing)Object.assign(existing,data);
    else{const fresh=makeAward(data);bundle.awards.push(fresh);return respond({id:fresh.id});}
    return respond({id:existing!.id});
  }
  if(path.endsWith("/grants")&&award){
    if(award.currentGrant&&!data.reassign)return respond({message:"Already awarded this period"},409);
    const p=bundle.roster.find(p=>p.id===data.playerId)!;
    if(award.currentGrant?.playerId===p.id)return respond({id:award.currentGrant.id,changed:false});
    const grant={id:award.currentGrant?.id||randomUUID(),playerId:p.id,playerName:p.name,periodKey:data.periodKey,grantedAt:new Date().toISOString(),grantedById:"captain",grantedByName:"Alex Captain"};
    award.holder=p;award.currentGrant=grant;award.history.unshift({...grant,id:randomUUID()});return respond({id:grant.id,changed:true});
  }
  if(path.endsWith("/remove-background"))return providerSuccess
    ? respond({image:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="})
    : respond({message:"Provider unavailable. You can still save the original."},503);
  if(path.endsWith("/image")&&award){award.imageUrl=`data:image/png;base64,${data.image}`;return respond({ok:true});}
  if(req.method==="PATCH"&&award){award.archived=true;return respond({ok:true});}
  respond({message:"Unknown fixture API"},404);
}).listen(3001,"0.0.0.0",()=>console.log("Isolated awards fixture ready"));
function makeAward(data:any):TeamAward {
  return {id:randomUUID(),teamId:"team-a",name:data.name,description:data.description||"",presetIcon:data.presetIcon||"star",imageUrl:null,imageVersion:"1",
    cadence:data.cadence||"game",archived:false,holder:data.holder||null,
    window:{periodKey:"game-a",gameId:"game-a",opensAt:new Date().toISOString(),closesAt:null},currentGrant:null,history:[]};
}
