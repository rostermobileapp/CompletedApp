import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

test("the real permission provider isolates account extras, team selection, tournament access and copied profiles",async()=>{
  const subscriptionSource=await readFile(new URL("../../client/src/pages/Subscription.tsx",import.meta.url),"utf8");
  const noticeSource=subscriptionSource.match(/function LeagueProActiveSeatNotice\(\) \{[\s\S]+?\n\}/)?.[0];
  assert.ok(noticeSource);
  const result=await build({stdin:{contents:`
    import React from "react";
    import {renderToStaticMarkup} from "react-dom/server";
    import {QueryClient,QueryClientProvider,useQuery} from "@tanstack/react-query";
    import {PermissionProvider,usePermissions} from "./client/src/context/SubscriptionContext";
    import {hasUncoveredTeams} from "./shared/proCoverage";
    import {state} from "fixture-state";
    const Crown=()=>null;
    const formatMonthYM=month=>month;
    const apiRequest=()=>{throw new Error("Unexpected request");};
    ${noticeSource}
    function Probe(){const p=usePermissions();return <pre>{JSON.stringify({
      active:p.canAccessPremiumFeatures(),account:p.hasPersonalProAccess(),
      hs:p.canAccessPremiumFeatures({teamId:"school"}),adult:p.canAccessPremiumFeatures({teamId:"adult"}),
      spoof:p.canAccessPremiumFeatures({teamId:"adult",leagueId:"HS"}),
      tournament:p.canAccessPremiumFeatures({tournamentId:"CUP"}),role:p.role,unavailable:p.coverageUnavailable
    })}</pre>;}
    export function render(userId,selectedType,selectedId,personal=false,coverageUserId=userId,allCovered=false,personalUnavailable=false,manual=false){
      state.auth={id:"real-auth"};state.selectedType=selectedType;state.selectedId=selectedId;
      const q=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0,queryFn:()=>{throw new Error("Unexpected request");}}}});
      q.setQueryData(["/api/user"],{id:userId,role:"free_tier"});
      q.setQueryData(["/api/user/league-memberships"],[]);
      q.setQueryData(["/api/user/tournament-participations"],[{tournamentId:"CUP"}]);
      q.setQueryData(["/api/user/pro-coverage",userId,null],{
        userId:coverageUserId,account:{personal,legacy:manual,source:manual?"manual_override":personal?"apple":"none"},personalVerificationUnavailable:personalUnavailable,
        teams:[{id:"school",leagueId:"HS"},{id:"adult",leagueId:"ADULT"}],
        seats:[{leagueId:"HS",startMonth:"2026-11",endMonth:"2027-02"},...(allCovered?[{leagueId:"ADULT",startMonth:"2026-11",endMonth:"2027-02"}]:[])]
      });
      q.setQueryData(["/api/user/league-pro-seats",userId],[{leagueId:"HS",leagueName:"School",grantId:"grant",startMonth:"2026-11",endMonth:"2027-02"}]);
      const html=renderToStaticMarkup(<QueryClientProvider client={q}><PermissionProvider><Probe/></PermissionProvider></QueryClientProvider>);
      const notice=renderToStaticMarkup(<QueryClientProvider client={q}><PermissionProvider><LeagueProActiveSeatNotice/></PermissionProvider></QueryClientProvider>);
      q.clear();return {...JSON.parse(html.replace(/<[^>]+>/g,"").replaceAll("&quot;",'"')),notice:notice.replace(/<[^>]+>/g,"")};
    }`,resolveDir:process.cwd(),loader:"tsx"},
    bundle:true,platform:"node",format:"cjs",packages:"external",write:false,jsx:"automatic",
    plugins:[{name:"fixture-hooks",setup(b){
      b.onResolve({filter:/^fixture-state$|^@\/hooks\/(useAuth|useDashboardSelection)$|^@\/lib\/queryClient$/},
        args=>({path:args.path,namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="fixture-state"?"export const state={};":
        args.path.includes("useAuth")?'import {state} from "fixture-state";export const useAuth=()=>({user:state.auth,isLoading:false});':
        args.path.includes("useDashboardSelection")?'import {state} from "fixture-state";export const useDashboardSelection=()=>state;':
        'export const apiRequest=()=>{throw new Error("Unexpected network request");};',loader:"js"}));
    }}]});
  const module={exports:{} as any};
  new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const render=module.exports.render;
  const hs=render("copied-profile","team","school");
  assert.equal(hs.active,true);assert.equal(hs.hs,true);assert.equal(hs.adult,false);assert.equal(hs.account,false);assert.equal(hs.role,"free_tier");
  assert.equal(render("copied-profile","team","adult").active,false);
  assert.equal(render("copied-profile","league","HS").active,true);
  assert.equal(render("copied-profile","league","ADULT").active,false);
  assert.equal(render("copied-profile","tournament","CUP").active,true);
  assert.equal(hs.spoof,false);
  assert.equal(render("copied-profile","team","adult",true).active,true);
  assert.equal(render("copied-profile","league","HS",true).account,true);
  const stale=render("new-profile","team","school",true,"old-profile");
  assert.equal(stale.active,false);assert.equal(stale.account,false);
  assert.match(hs.notice,/School covers your Player Pro on School teams through 2027-02/);
  assert.match(hs.notice,/Your other teams are on the Free plan/);
  assert.doesNotMatch(render("copied-profile","league","HS",true).notice,/Your other teams are on the Free plan/);
  assert.doesNotMatch(render("copied-profile","league","HS",false,"copied-profile",true).notice,/Your other teams are on the Free plan/);
  assert.equal(stale.notice,"");
  const manual=render("manual-profile","team","adult",false,"manual-profile",false,false,true);
  assert.equal(manual.active,true);
  assert.equal(manual.account,true);
  assert.equal(manual.adult,true);
  assert.equal(manual.hs,true);
  assert.equal(manual.spoof,false);
  // Coverage enables Pro, not administrative role escalation.
  assert.equal(manual.role,"free_tier");
  const wrongManual=render("new-profile","team","adult",false,"manual-profile",false,false,true);
  assert.equal(wrongManual.active,false);
  assert.equal(wrongManual.account,false);
  const outage=render("copied-profile","team","school",false,"copied-profile",false,true);
  assert.equal(outage.active,true);
  assert.equal(outage.account,false);
  assert.equal(outage.adult,false);
  assert.equal(outage.unavailable,true);
  assert.match(outage.notice,/Player Pro coverage could not be verified/);
  assert.match(outage.notice,/your account and subscription have not been changed/);
  assert.doesNotMatch(outage.notice,/Your other teams are on the Free plan/);
});
