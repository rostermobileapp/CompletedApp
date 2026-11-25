import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiRequest } from "@/lib/queryClient";
import { HS_CONSENT_VERSION, HS_MAX_FAMILY_PLAYERS, hsParentPlayersMatchSaved } from "@shared/highSchoolOnboarding";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import {
  AddPlayersScreen, ConsentScreen, FamilyPlanScreen, JoinTeamScreen, ParentAllSetScreen,
  ParentDeviceRequestsScreen, SetupCodeScreen, type ParentPlayer,
} from "@/components/high-school-onboarding/ParentScreens";
import {
  AdultRoleScreen, HighSchoolRoleScreen, HockeyTypeScreen, SignupEntryScreen,
} from "@/components/high-school-onboarding/EntryScreens";
import {
  FindSchoolScreen, PickTeamScreen, StaffRoleScreen, StaffWaitingScreen,
} from "@/components/high-school-onboarding/StaffScreens";
import {
  LeagueDetailsScreen, LeagueInvitesScreen, LeaguePlanScreen, LeagueScheduleScreen,
  LeagueSchoolsScreen, LeagueDraftHomeScreen, type LeagueDraft,
} from "@/components/high-school-onboarding/LeagueScreens";
import { Under18ShareScreen } from "@/components/high-school-onboarding/Under18ShareScreen";
import { ScreenFrame } from "@/components/high-school-onboarding/shared";
import { StaffSchoolRequestScreen, type SchoolRequest } from "@/components/high-school-onboarding/StaffSchoolRequestScreen";
import { ProfileScreen, type HsProfileDraft } from "@/components/high-school-onboarding/ProfileScreen";
import { ReferralScreen } from "@/components/high-school-onboarding/ReferralScreen";

const API="/api/high-school/onboarding";
export type RequestFn=(method:string,path:string,body?:unknown)=>Promise<any>;
const realRequest:RequestFn=async(method,path,body)=>(await apiRequest(method,path,body)).json();
type Hockey="adult"|"high_school_youth"|"";
type View = "signup"|"hockey"|"adult-role"|"hs-role"|"referral"|"profile"|"staff-role"|"staff-school"|"staff-new-school"|"staff-team"|"staff-wait"|"parent-add"|"parent-consent"|"parent-join"|"parent-plan"|"parent-done"|"parent-code"|"parent-requests"|"under18-share"|"league-details"|"league-schools"|"league-schedule"|"league-invites"|"league-plan"|"league-home"|"verification";
const roleNames:Record<string,string>={head_coach:"Head Coach",assistant_coach:"Assistant Coach",athletic_director:"Athletic Director",team_manager:"Team Manager"};

function newPlayer():ParentPlayer{return{id:crypto.randomUUID(),firstName:"",lastName:"",gradYear:new Date().getFullYear()+1,position:"F",jerseyNumber:"",consent:false,consentVersion:HS_CONSENT_VERSION,photoConsent:false,publicNameConsent:false};}
const blankLeague=():LeagueDraft=>({details:{name:"",state:"",season:""},schools:[],schedule:[],invitations:[]});

export default function HighSchoolYouthOnboarding({request=realRequest,authenticated=true,preview=false,onChange,onAdult,onParent}:{
  request?:RequestFn;authenticated?:boolean;preview?:boolean;onChange?:()=>void;onAdult?:(role?:string)=>void;onParent?:()=>void;
}) {
  const [state,setState]=useState<any>(); const [view,setView]=useState<View>(authenticated?"hockey":"signup");
  const [hockey,setHockey]=useState<Hockey>(""); const [adultRole,setAdultRole]=useState("");
  const [hsRole,setHsRole]=useState(""); const [staffRole,setStaffRole]=useState("head_coach");
  const [programs,setPrograms]=useState<any[]>([]); const [search,setSearch]=useState(""); const [programId,setProgramId]=useState(""); const [teamId,setTeamId]=useState("");
  const [catalogLoading,setCatalogLoading]=useState(false);
  const [schoolLeagues,setSchoolLeagues]=useState<Array<{id:string;name:string}>>([]);
  const [schoolRequest,setSchoolRequest]=useState<SchoolRequest>({name:"",town:"",leagueId:""});
  const [players,setPlayers]=useState<ParentPlayer[]>([newPlayer()]); const [consentIndex,setConsentIndex]=useState(0); const [guardian,setGuardian]=useState(false);
  const [entry,setEntry]=useState(""); const [imported,setImported]=useState(false); const [children,setChildren]=useState<any[]>([]);
  const [matchedInvitation,setMatchedInvitation]=useState("");
  const [activationAvailable,setActivationAvailable]=useState(false);
  const [codeInfo,setCodeInfo]=useState<any>(); const [requests,setRequests]=useState<any[]>([]);
  const [league,setLeague]=useState<LeagueDraft>(blankLeague()); const [referral,setReferral]=useState(""); const [otherReferral,setOtherReferral]=useState(""); const [referralPartnerId,setReferralPartnerId]=useState("");
  const [profile,setProfile]=useState<HsProfileDraft>({firstName:"",lastName:"",timezone:""});
  const [partners,setPartners]=useState<any[]>([]); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true);
  const [error,setError]=useState(""); const [message,setMessage]=useState(""); const [authorityLost,setAuthorityLost]=useState(false);
  const authorityRevision=useSyncExternalStore(parentVerificationSession.subscribe,parentVerificationSession.snapshot,parentVerificationSession.snapshot);
  const lastAuthorityRevision=useRef(authorityRevision); const latestState=useRef<any>(); latestState.current=state;

  const refresh=useCallback(async()=>{
    const result=await request("GET",`${API}/state`);latestState.current=result;setState(result);onChange?.();
    return result;
  },[request,onChange]);

  useEffect(()=>{
    let live=true;
    if(!authenticated){setLoading(false);setView("signup");return;}
    void (async()=>{
      try{
        const res=await request("GET",`${API}/state`);
        if(!live)return;
        latestState.current=res;setState(res);
        const type=(res.hockeyType==="adult"||res.hockeyType==="high_school_youth")?res.hockeyType:"";
        setHockey(type);
        if(["staff","parent","league_admin"].includes(res.path))setHsRole(res.path);
        if(type==="high_school_youth"||["staff","parent","league_admin"].includes(res.path)){
          const partnerList=await request("GET",`${API}/referral-partners`);
          if(!live)return;
          setPartners(Array.isArray(partnerList)?partnerList:[]);
        }
        if(res.journey?.referralPartnerId)setReferralPartnerId(res.journey.referralPartnerId);
        else if(res.suggestedReferralPartnerId)setReferralPartnerId(res.suggestedReferralPartnerId);
        if(res.journey?.referralSourceOther){
          const known:Record<string,string>={"Coach or school":"coach","League":"league","Family or friend":"friend","Online search":"search"};
          const source=res.journey.referralSourceOther;
          setReferral(known[source]??"other");setOtherReferral(known[source]?"":source);
        }
        if(res.journey?.profile)setProfile({...res.journey.profile});
        const profileSaved=!!res.journey?.profile;
        const referralSaved=!!(res.journey?.referralPartnerId||res.journey?.referralSourceOther);
        if(res.path==="staff"){
          const savedProgramId=res.journey&&Object.prototype.hasOwnProperty.call(res.journey,"programId")?(res.journey.programId??""):(res.draft?.programId??"");
          const savedTeamId=res.journey&&Object.prototype.hasOwnProperty.call(res.journey,"teamId")?(res.journey.teamId??""):(res.draft?.teamId??"");
          setStaffRole(res.journey?.staffRole??res.draft?.role??"head_coach");setProgramId(savedProgramId);setTeamId(savedTeamId);
          if(savedProgramId){const cat=await request("GET",`${API}/catalog?q=`);if(live)setPrograms(cat.programs??[]);}
          setView(!profileSaved?(referralSaved?"profile":"referral"):res.status==="draft"?(savedProgramId?"staff-team":"staff-role"):"staff-wait");
        }
        else if(res.path==="parent"){
          if(res.status==="parent_verification_required"){setView("verification");}
          else if(["waiting_approval","waiting_staff_review","coverage_pending"].includes(res.status)){
            if(res.draft?.players?.length)setPlayers(res.draft.players);
            const childData=await request("GET",`${API}/children`);if(live){setChildren(childData.children??[]);setActivationAvailable(childData.activationAvailable===true);setView("parent-done");}
          }
          else if(!profileSaved){setView(referralSaved?"profile":"referral");}
          else if(res.status==="draft"&&res.draft?.guardianConfirmed){
            setPlayers(res.draft.players?.length?res.draft.players:[newPlayer()]);setGuardian(true);
            if(res.journey?.screen==="parent_complete"){
              const childData=await request("GET",`${API}/children`);
              if(live){setChildren(childData.children??[]);setActivationAvailable(childData.activationAvailable===true);}
              setView("parent-done");
            }else setView(res.journey?.screen==="parent_plan"?"parent-plan":"parent-join");
          }
          else {setPlayers(res.draft?.players?.length?res.draft.players:[newPlayer()]);setView("parent-add");}
        } else if(res.path==="league_admin"){
          const d=await request("GET",`${API}/league-draft`);
          if(!live)return;
          if(d){
            setLeague({...blankLeague(),...d,details:{...blankLeague().details,...d.details}});
            setView(!profileSaved?(referralSaved?"profile":"referral"):
              res.journey?.screen==="league_home"?"league-home":
              d.stage==="schools"?"league-schools":d.stage==="schedule"?"league-schedule":
              d.stage==="invitations"?"league-invites":d.stage==="plan"?"league-plan":"league-details");
          }
          else setView(!profileSaved?(referralSaved?"profile":"referral"):"league-details");
        } else if(res.path==="player"||res.path==="organizer")setView("adult-role");
        else setView(type==="adult"?"adult-role":type==="high_school_youth"?"hs-role":"hockey");
      }catch{if(live){setError("Onboarding is unavailable. Your saved data remains private. Try again.");setView("hockey");}}
      finally{if(live)setLoading(false);}
    })();
    return()=>{live=false;};
  },[authenticated,request]);

  useEffect(()=>{
    if(lastAuthorityRevision.current!==authorityRevision){
      lastAuthorityRevision.current=authorityRevision;
      setPlayers([newPlayer()]);setGuardian(false);setMatchedInvitation("");setEntry("");setChildren([]);setActivationAvailable(false);setCodeInfo(undefined);setRequests([]);
      if(latestState.current?.path==="parent"){setAuthorityLost(true);setView("verification");}
    }
  },[authorityRevision]);

  useEffect(()=>{
    if(view!=="staff-school"||!authenticated)return;
    let live=true;setCatalogLoading(true);
    const timer=window.setTimeout(()=>{
      request("GET",`${API}/catalog?q=${encodeURIComponent(search)}`)
        .then(data=>{if(live){setPrograms(data.programs??[]);setSchoolLeagues(data.leagues??[]);}})
        .catch(()=>{if(live){setPrograms([]);setError("Schools could not be loaded. Try searching again.");}})
        .finally(()=>{if(live)setCatalogLoading(false);});
    },220);
    return()=>{live=false;window.clearTimeout(timer);};
  },[view,search,request,authenticated]);

  const run=useCallback(async(fn:()=>Promise<void>)=>{
    setBusy(true);setError("");setMessage("");
    try{await fn();}
    catch(e:any){
      const code=e?.data?.code??e?.code;
      if(code==="PARENT_VERIFICATION_REQUIRED"||code==="INVALID_SESSION"){parentVerificationSession.clear();setAuthorityLost(true);setView("verification");}
      setError(e?.message??(code==="PARENT_VERIFICATION_REQUIRED"?"Verify through the parent's email to continue.":"Onboarding could not be saved. Nothing was activated."));
    }finally{setBusy(false);}
  },[]);
  const progress=async(screen:string, extra:any={})=>{
    const revision=latestState.current?.revision;
    if(!Number.isInteger(revision))throw new Error("Saved onboarding revision is unavailable. Reload your progress before continuing.");
    const sourceText=referral==="other"?otherReferral.trim():({coach:"Coach or school",league:"League",friend:"Family or friend",search:"Online search"} as Record<string,string>)[referral]??"";
    const result=await request("POST",`${API}/journey`,{revision,screen,...(referralPartnerId?{referralPartnerId}:{}),...(!referralPartnerId&&sourceText?{referralSourceOther:sourceText}:{}),...extra});
    if(Number.isInteger(result?.revision)){const next={...latestState.current,revision:result.revision,journey:result.journey??latestState.current?.journey};latestState.current=next;setState(next);}
  };
  const go=async(next:View,screen:string,extra:any={})=>{
    setError("");setMessage("");
    await run(async()=>{await progress(screen,extra);setView(next);});
  };
  const beginHockey=()=>void run(async()=>{
    if(!hockey)return;
    await request("POST",`${API}/hockey-type`,{hockeyType:hockey});await refresh();
    if(hockey==="high_school_youth"){
      const partnerList=await request("GET",`${API}/referral-partners`);
      setPartners(Array.isArray(partnerList)?partnerList:[]);
    }
    setView(hockey==="adult"?"adult-role":"hs-role");
  });
  const chooseHs=()=>void run(async()=>{
    if(!hsRole)return;
    // Existing live adults use additive, email-protected Family setup. Never
    // convert their primary account into the original DEV-only parent flow.
    if(hsRole==="parent"&&onParent){onParent();return;}
    const current=latestState.current;
    if(current?.path!==hsRole)await request("POST",`${API}/choose`,{path:hsRole});
    const next=await refresh();
    if(hsRole==="parent"&&next.status==="parent_verification_required"){setView("verification");return;}
    await progress("hs_role");
    setView("referral");
  });
  const saveReferral=()=>void run(async()=>{
    await progress("referral");
    setView("profile");
  });
  const saveProfile=()=>void run(async()=>{
    await progress("profile",{profile});
    if(hsRole==="staff"){setStaffRole(latestState.current?.draft?.role??"head_coach");await progress("staff_role");setView("staff-role");}
    if(hsRole==="parent"){setPlayers(current=>current.length?current:[newPlayer()]);setGuardian(false);await progress("parent_players");setView("parent-add");}
    if(hsRole==="league_admin"){setLeague(blankLeague());await progress("league_details");setView("league-details");}
  });
  const continueAdult=()=>void run(async()=>{
    if(!adultRole)return;
    const path=adultRole==="Player"||adultRole==="Scorekeeper"?"player":"organizer";
    await request("POST",`${API}/choose`,{path});
    await refresh();
    if(onAdult)onAdult(adultRole);else window.location.assign("/get-started");
  });
  const updatePlayer=(id:string,patch:Partial<ParentPlayer>)=>setPlayers(current=>current.map(p=>p.id===id?{...p,...patch}:p));
  const savePlayers=async()=>{
    if(state?.revision==null)throw new Error("Reload saved progress before saving players.");
    const payload={kind:"parent",revision:state.revision,guardianConfirmed:true,players};
    await request("POST",`${API}/draft`,payload);setGuardian(true);await refresh();
  };
  const nextConsent=()=>void run(async()=>{
    if(consentIndex<players.length-1){setConsentIndex(consentIndex+1);return;}
    await savePlayers();await progress("parent_join");setView("parent-join");
  });
  const lookupInvitation=()=>void run(async()=>{
    const invitation=entry.trim();
    if(!invitation)return;
    const data=await request("POST",`${API}/lookup`,{revision:latestState.current.revision,invitation});
    if(data?.state){latestState.current=data.state;setState(data.state);}else await refresh();
    const next=data?.state??latestState.current;
    if(!next?.draft?.players?.length||!next.draft.imported)throw new Error("The matched player details could not be loaded. Reload before continuing.");
    setPlayers(next.draft.players);setGuardian(false);setConsentIndex(0);
    setMatchedInvitation(invitation);setEntry(invitation);setImported(true);
    await progress("parent_consent");setView("parent-consent");
    setMessage("Invitation matched. Review consent for every imported player before joining. No player access was activated.");
  });
  const joinTeam=()=>void run(async()=>{
    const invitation=imported||latestState.current?.draft?.imported;
    const token=invitation?(matchedInvitation||entry.trim()):entry.trim();
    if(invitation&&!token)throw new Error("Re-enter the matched invitation token before joining. It is kept only on this device while this page is open.");
    if(token){
      await request("POST",`${API}/join`,{revision:latestState.current.revision,...(invitation?{invitation:token}:{teamCode:token})});
      await refresh();
    }
    await progress("parent_plan");setView("parent-plan");
    if(invitation)setMessage("Invitation-backed player requests were submitted. Team access is still pending coverage and approval.");
  });
  const loadChildren=async()=>{const data=await request("GET",`${API}/children`);setChildren(data.children??[]);setActivationAvailable(data.activationAvailable===true);};
  const createChildCode=(childId:string)=>void run(async()=>{
    if(!activationAvailable)throw Object.assign(new Error("Child phone activation is unavailable in this phase."),{code:"CHILD_ACTIVATION_PENDING"});
    const result=await request("POST",`${API}/device-codes`,{childId});setCodeInfo({...result,childId});setView("parent-code");await progress("parent_code");
  });
  const loadRequests=()=>void run(async()=>{const data=await request("GET",`${API}/device-requests`);setRequests(data.requests??[]);setView("parent-requests");});
  const decideRequest=(id:string,approve:boolean)=>void run(async()=>{
    await request("POST",`${API}/device-requests/${encodeURIComponent(id)}/decision`,{approve});
    const data=await request("GET",`${API}/device-requests`);setRequests(data.requests??[]);
    setMessage(approve?"Decision recorded. Child activation remains unavailable in this phase.":"Request denied. No child session was created.");
  });
  const lockParent=async()=>{
    parentVerificationSession.clear();
    setPlayers([newPlayer()]);setMatchedInvitation("");setEntry("");setChildren([]);setRequests([]);setCodeInfo(undefined);
    setState(undefined);latestState.current=undefined;setAuthorityLost(true);setView("verification");
    try{await request("POST","/api/high-school/parent-verification/revoke",{});}
    catch{setError("Parent controls are locked on this device. The server lock could not be confirmed.");}
    finally{onChange?.();}
  };
  const saveLeagueStage=async(stage:"details"|"schools"|"schedule"|"invitations"|"plan")=>{
    let saved=false;
    await run(async()=>{
    if(!Number.isInteger(latestState.current?.revision))throw new Error("Saved onboarding revision is unavailable. Reload your progress before continuing.");
    const payload:any={revision:latestState.current.revision,stage};
    if(stage==="details")payload.details=league.details;
    if(stage==="schools")payload.schools=league.schools;
    if(stage==="schedule")payload.schedule=league.schedule;
    if(stage==="invitations")payload.invitations=league.invitations;
    const result=await request("POST",`${API}/league-draft`,payload);
    if(result&&typeof result==="object"){
      setLeague(current=>({...current,...result,details:{...current.details,...result.details}}));
      if(Number.isInteger(result.revision)){const next={...latestState.current,revision:result.revision};latestState.current=next;setState(next);}
    }
    await progress(stage==="plan"?"league_home":`league_${stage}`);
    saved=true;
    });
    return saved;
  };

  if(!authenticated&&view!=="under18-share")return <SignupEntryScreen onSignup={()=>window.location.assign("/login?signup=1")} onUnder18={()=>setView("under18-share")}/>;
  if(loading)return <main className="hsy"><div className="hsy-frame"><header className="hsy-head"><span className="hsy-back"/><div className="hsy-progress"><span style={{width:"24%"}}/></div><span className="hsy-count">…</span></header><section className="hsy-content"><div className="hsy-card tint" style={{height:34,width:"70%",marginBottom:12}}/><div className="hsy-card tint" style={{height:90,marginBottom:12}}/><div className="hsy-card tint" style={{height:90}}/></section></div></main>;
  if(view==="under18-share")return <Under18ShareScreen onCode={()=>window.location.assign("/under-18/code")} onBack={()=>setView("signup")}/>;
  const errorBox=error?<div className="hsy-error" role="alert" style={{maxWidth:430,margin:"12px auto"}}>{error}<button className="hsy-link" style={{marginLeft:12,border:0,background:"none"}} onClick={()=>{setError("");void run(refresh);}}>Retry</button></div>:null;
  let screen:any=null;
  if(view==="signup")screen=<SignupEntryScreen onSignup={()=>window.location.assign("/login?signup=1")} onUnder18={()=>setView("under18-share")}/>;
  else if(view==="hockey")screen=<HockeyTypeScreen value={hockey} setValue={setHockey} onBack={()=>window.history.back()} onContinue={beginHockey} busy={busy}/>;
  else if(view==="adult-role"&&(state?.path==="player"||state?.path==="organizer"))screen=<ScreenFrame action={<button className="hsy-primary" onClick={()=>onAdult?onAdult(state.path):window.location.assign("/get-started")}>Continue existing adult setup</button>}><section className="hsy-content"><h1>Your adult setup is ready</h1><p className="hsy-subtitle">Continue in the existing adult onboarding flow. No High School role was selected.</p></section></ScreenFrame>;
  else if(view==="adult-role")screen=<AdultRoleScreen value={adultRole} setValue={setAdultRole} onBack={()=>setView("hockey")} onContinue={continueAdult} busy={busy}/>;
  else if(view==="hs-role")screen=<HighSchoolRoleScreen value={hsRole} setValue={setHsRole} onBack={()=>setView("hockey")} onContinue={chooseHs} busy={busy}/>;
  else if(view==="referral")screen=<ReferralScreen partners={partners} partnerId={referralPartnerId} source={referral} otherSource={otherReferral} locked={!!latestState.current?.journey?.referralPartnerId||!!latestState.current?.journey?.referralSourceOther} onPartner={setReferralPartnerId} onSource={setReferral} onOther={setOtherReferral} onBack={()=>setView("hs-role")} onContinue={saveReferral} busy={busy}/>;
  else if(view==="profile")screen=<ProfileScreen profile={profile} update={patch=>setProfile(current=>({...current,...patch}))} onBack={()=>setView("referral")} onContinue={saveProfile} busy={busy}/>;
  else if(view==="staff-role")screen=<StaffRoleScreen role={staffRole} setRole={setStaffRole} onBack={()=>setView("hs-role")} onContinue={()=>void go("staff-school","staff_role",{staffRole})} busy={busy}/>;
  else if(view==="staff-school")screen=<FindSchoolScreen search={search} setSearch={setSearch} programs={programs} selectedProgram={programId} selectProgram={id=>{setProgramId(id);setTeamId("");}} loading={catalogLoading} onRetry={()=>setSearch(search+" ")} onBack={()=>setView("staff-role")}
    onAddSchool={["head_coach","athletic_director"].includes(staffRole)?()=>setView("staff-new-school"):undefined}
    onContinue={()=>{const selected=programs.find(p=>p.id===programId);void run(async()=>{if(!selected)throw new Error("Choose a school before continuing.");setTeamId("");await progress("staff_team",{programId:selected.id,teamId:null});setView("staff-team");});}}/>;
  else if(view==="staff-new-school")screen=<StaffSchoolRequestScreen value={schoolRequest} update={patch=>setSchoolRequest(current=>({...current,...patch}))} leagues={schoolLeagues} busy={busy} onBack={()=>setView("staff-school")} onSubmit={()=>void run(async()=>{
    await request("POST",`${API}/draft`,{kind:"staff",revision:latestState.current.revision,role:staffRole,newSchool:schoolRequest});
    const next=await refresh();
    setProgramId(next.draft?.programId??"");setTeamId("");
    await progress("staff_waiting",{staffRole,programId:next.draft?.programId??null,teamId:null});setView("staff-wait");
  })}/>;
  else if(view==="staff-team"){
    const program=programs.find(p=>p.id===programId);
    screen=<PickTeamScreen program={program} teamId={teamId} setTeamId={setTeamId} roleName={roleNames[staffRole]??"Staff"} onBack={()=>setView("staff-school")} busy={busy} onContinue={()=>void run(async()=>{
       await progress("staff_team",{programId,teamId});
       await request("POST",`${API}/draft`,{kind:"staff",revision:latestState.current.revision,role:staffRole,programId,teamId});
       const next=await refresh();
       if(next.status!=="draft"){await progress("staff_waiting");setView("staff-wait");}else setView("staff-team");
    })}/>;
  }
  else if(view==="staff-wait")screen=<StaffWaitingScreen status={state?.status??"waiting_approval"} programName={programs.find(p=>p.id===programId)?.name} teamName={programs.find(p=>p.id===programId)?.teams?.find((t:any)=>t.id===teamId)?.name} roleName={roleNames[staffRole]??staffRole} onBack={()=>setView("staff-team")} busy={busy} onRefresh={()=>void run(refresh)}/>;
  else if(view==="parent-add")screen=<AddPlayersScreen players={players} update={updatePlayer} add={()=>setPlayers(current=>current.length<HS_MAX_FAMILY_PLAYERS?[...current,newPlayer()]:current)} remove={id=>players.length>1&&setPlayers(players.filter(p=>p.id!==id))} onBack={()=>setView("profile")} onContinue={()=>void run(async()=>{setConsentIndex(0);await progress("parent_consent");setView("parent-consent");})} busy={busy}/>;
  else if(view==="parent-consent")screen=<ConsentScreen player={players[consentIndex]??players[0]} index={consentIndex} total={players.length} guardian={guardian} setGuardian={setGuardian} update={patch=>updatePlayer(players[consentIndex]?.id,patch)} onBack={()=>consentIndex?setConsentIndex(consentIndex-1):setView("parent-add")} onContinue={nextConsent} busy={busy}/>;
  else if(view==="parent-join")screen=<JoinTeamScreen players={players} entry={entry} setEntry={setEntry} onLookup={lookupInvitation} onJoin={joinTeam} onBack={()=>setView("parent-consent")} busy={busy} imported={imported||!!state?.draft?.imported} dirty={!state?.draft?.guardianConfirmed||!hsParentPlayersMatchSaved(players,state?.draft?.players)} onSkip={()=>void run(async()=>{await loadChildren();await progress("parent_complete");setView("parent-done");})}/>;
  else if(view==="parent-plan")screen=<FamilyPlanScreen onBack={()=>setView("parent-join")} busy={busy} onContinue={()=>void run(async()=>{await loadChildren();await progress("parent_complete");setView("parent-done");})}/>;
  else if(view==="parent-done")screen=<ParentAllSetScreen players={players} children={children} activationAvailable={activationAvailable} onBack={()=>setView("parent-plan")} onContinue={()=>void run(async()=>{await refresh();await loadChildren();setMessage("Setup status refreshed. Team information appears on the child's phone after membership and coverage are approved.");})} onCode={createChildCode} onRequests={loadRequests} onTeam={()=>setView("parent-join")} busy={busy} verificationRequired={authorityLost||state?.status==="parent_verification_required"}/>;
  else if(view==="parent-code")screen=<SetupCodeScreen child={children.find(c=>c.id===codeInfo?.childId)} code={codeInfo?.code??""} expiresAt={codeInfo?.expiresAt} onBack={()=>setView("parent-done")} busy={busy} onNew={()=>codeInfo?.childId&&void createChildCode(codeInfo.childId)} onShare={()=>void run(async()=>{
    if(!codeInfo?.challengeId)throw new Error("No secure challenge link is available. Do not share a code-only setup.");
    const pairingLink=`${window.location.origin}/under-18/code?challengeId=${encodeURIComponent(codeInfo.challengeId)}`;
    const shareText=`Roster setup code: ${codeInfo.code}\nOpen this setup link, then enter the code: ${pairingLink}`;
    if(navigator.share){try{await navigator.share({title:"Player phone setup code",text:shareText,url:pairingLink});setMessage("Share sheet opened. Your parent phone must still review any device request.");}catch(e:any){if(e?.name==="AbortError")setMessage("Sharing cancelled. The code remains on this parent phone; select it to copy.");else setMessage("Sharing is unavailable. Select the code and copy the secure setup link.");}}
    else setMessage("Sharing is unavailable. Select the code and copy the secure setup link.");
    if(!navigator.share){try{await navigator.clipboard.writeText(shareText);setMessage("Setup code and secure challenge link copied. Parent approval is still required.");}catch{/* The code is selectable in the card; manual copy is the fallback. */}}
  })}/>;
  else if(view==="parent-requests")screen=<ParentDeviceRequestsScreen requests={requests} decide={decideRequest} onBack={()=>setView("parent-done")} busy={busy}/>;
  else if(view==="verification")screen=<ScreenFrame action={<button className="hsy-primary" onClick={()=>window.location.assign("/high-school/parent-verification")}>Verify parent access</button>}><section className="hsy-content"><h1>Parent verification required</h1><p className="hsy-subtitle">A shared login does not automatically authorize parent controls. Verify through the parent's registered email to continue.</p><div className="hsy-card tint">Child information was cleared from this screen because parent authority is unavailable.</div><p className="hsy-footer-note">{authorityLost?"Parent verification expired or was revoked.":"No parent authority has been granted on this device."}</p></section></ScreenFrame>;
  else if(view==="league-details")screen=<LeagueDetailsScreen details={league.details} update={patch=>setLeague({...league,details:{...league.details,...patch}})} onBack={()=>setView("hs-role")} busy={busy} onContinue={()=>void saveLeagueStage("details").then(saved=>saved&&setView("league-schools"))}/>;
  else if(view==="league-schools")screen=<LeagueSchoolsScreen schools={league.schools} update={schools=>setLeague({...league,schools})} onBack={()=>setView("league-details")} busy={busy} onContinue={()=>void saveLeagueStage("schools").then(saved=>saved&&setView("league-schedule"))}/>;
  else if(view==="league-schedule")screen=<LeagueScheduleScreen schedule={league.schedule} schools={league.schools} update={schedule=>setLeague({...league,schedule})} onBack={()=>setView("league-schools")} busy={busy} onContinue={()=>void saveLeagueStage("schedule").then(saved=>saved&&setView("league-invites"))}/>;
  else if(view==="league-invites")screen=<LeagueInvitesScreen schools={league.schools} invitations={league.invitations} update={invitations=>setLeague({...league,invitations})} onBack={()=>setView("league-schedule")} busy={busy} onContinue={()=>void saveLeagueStage("invitations").then(saved=>saved&&setView("league-plan"))}/>;
  else if(view==="league-plan")screen=<LeaguePlanScreen onBack={()=>setView("league-invites")} busy={busy} onContinue={()=>void saveLeagueStage("plan").then(saved=>saved&&setView("league-home"))}/>;
  else if(view==="league-home")screen=<LeagueDraftHomeScreen draft={league} onReset={()=>void run(async()=>{await progress("league_home");setView("league-details");})}/>;
  return <>{!preview&&state?.path==="parent"&&view!=="verification"&&<div className="hsy" style={{minHeight:0}}>
    <div style={{maxWidth:430,margin:"0 auto",padding:"8px 20px"}}><button className="hsy-secondary" onClick={()=>void lockParent()}>Lock parent controls</button></div>
  </div>}{screen}{errorBox}{message&&<div role="status" className="hsy-success" style={{maxWidth:430,margin:"12px auto"}}>{message}</div>}</>;
}
