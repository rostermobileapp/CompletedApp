import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { AdultSignupConfirmation } from "@/components/AdultSignupConfirmation";
import { ParentAssistedSetupPreview } from "@/components/ParentAssistedSetupPreview";
import { AdultOnboardingPreview } from "@/components/AdultOnboardingPreview";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import { supabase } from "@/lib/supabase";
import { HS_CONSENT_TEXT, HS_CONSENT_VERSION, HS_STAFF_ROLES, type HsPath } from "@shared/highSchoolOnboarding";

const API="/api/high-school/onboarding";
type RequestFn=(method:string,path:string,body?:unknown)=>Promise<any>;
const realRequest:RequestFn=async(method,path,body)=>(await apiRequest(method,path,body)).json();
const labels:Record<string,string>={head_coach:"Head Coach",assistant_coach:"Assistant Coach",athletic_director:"Athletic Director",team_manager:"Team Manager"};
const errors:Record<string,string>={
  DEV_FIXTURE_REQUIRED:"This DEV phase accepts operator-created synthetic test accounts only. No real family was activated.",
  INVALID_ONBOARDING_INPUT:"Check the required fields, player limit and consent for every player.",
  DRAFT_CONFLICT:"This draft changed in another session. Reload the latest saved version before continuing.",
  HOUSEHOLD_LIMIT:"A household can have at most four players. A fifth player cannot be added.",
  DUPLICATE_PLAYER:"That player is already listed. Review the existing entry instead.",
  APPROVAL_FORBIDDEN:"You do not have authority to approve this request.",
  INVALID_INVITATION:"This invitation is invalid, expired, revoked or addressed to another account.",
  PLAYER_ALREADY_CLAIMED:"That imported player was already claimed by another household. Contact the school staff.",
  INVALID_TEAM_CODE:"That code does not match an approved DEV team.",
  INVITATION_REQUIRED:"Use the same coach invitation used to match these imported players.",
  INVITATION_PLAYER_MISMATCH:"Imported player details must match the coach's staged record.",
  SCHOOL_CREATION_ROLE_REQUIRED:"Only a Head Coach or Athletic Director can request a new school.",
  PARENT_CONTEXT_FOUNDATION_PENDING:"Adding a family context to an existing adult account is not enabled in this phase. Your adult account is unchanged.",
  REQUEST_ALREADY_SUBMITTED:"This request was already submitted. Reload its latest status.",
  PATH_ALREADY_SELECTED:"This account already has an onboarding path. Reload the saved path.",
  TEAM_REQUIRED:"Choose a team at the selected school.",
  PREVIEW_OPERATION_UNAVAILABLE:"This action is not simulated. Invitation and approval security are checked with guarded synthetic DEV accounts.",
};
const field="block w-full rounded-lg border bg-background p-3 text-foreground";
const button="rounded-lg border px-4 py-3 text-sm font-medium disabled:opacity-50";
const emptyPlayer=()=>({id:crypto.randomUUID(),firstName:"",lastName:"",gradYear:new Date().getFullYear()+1,position:"F",jerseyNumber:"",
  consent:false,consentVersion:HS_CONSENT_VERSION,photoConsent:false,publicNameConsent:false});
export default function HighSchoolOnboarding({request=realRequest,onChange,authenticated=true,preview=false}:{
  request?:RequestFn;onChange?:()=>void;authenticated?:boolean;preview?:boolean;
}){
  const authorityRevision=useSyncExternalStore(parentVerificationSession.subscribe,parentVerificationSession.snapshot,parentVerificationSession.snapshot);
  const [savedState,setSavedState]=useState<any>();
  const state=savedState?.authorityRevision===authorityRevision?savedState.value:undefined;
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [adult,setAdult]=useState<boolean|null>(null);
  const [parentTakeover,setParentTakeover]=useState(false);
  const [catalog,setCatalog]=useState<any>({programs:[],leagues:[]});
  const [search,setSearch]=useState("");
  const [role,setRole]=useState("head_coach");
  const [programId,setProgram]=useState("");
  const [teamId,setTeam]=useState("");
  const [creating,setCreating]=useState(false);
  const [school,setSchool]=useState({leagueId:"",name:"",town:""});
  const [players,setPlayers]=useState<any[]>([emptyPlayer()]);
  const [guardian,setGuardian]=useState(false);
  const [entry,setEntry]=useState("");
  const [entryKind,setEntryKind]=useState<"code"|"invitation">("code");
  const [approvals,setApprovals]=useState<any[]|null>(null);
  const apply=(next:any)=>{
    setSavedState({value:next,authorityRevision});
    if(next.draft?.players){setPlayers(next.draft.players);setGuardian(!!next.draft.guardianConfirmed);}
    if(next.draft?.role)setRole(next.draft.role);
  };
  const refresh=async()=>{apply(await request("GET",`${API}/state`));onChange?.();};
  const run=async(fn:()=>Promise<void>)=>{
    setBusy(true);setError("");setMessage("");
    try{await fn();}
    catch(e){const code=e instanceof ApiError?e.data?.code:(e as any)?.code;
      if(["PARENT_VERIFICATION_REQUIRED","INVALID_SESSION"].includes(code))parentVerificationSession.clear();
      setError(errors[code]??(code==="PARENT_VERIFICATION_REQUIRED"?"Verify through the parent's email to continue.":"DEV onboarding is unavailable. Nothing was activated."));}
    finally{setBusy(false);}
  };
  useEffect(()=>{if(authenticated)void run(refresh);else setSavedState(undefined);},[authenticated,request,authorityRevision]);
  useEffect(()=>{if(!state?.path || !["staff","parent"].includes(state.path))return;
    let alive=true;const timer=setTimeout(()=>{request("GET",`${API}/catalog?q=${encodeURIComponent(search)}`).then(data=>{if(alive)setCatalog(data);}).catch(()=>{});},250);
    return()=>{alive=false;clearTimeout(timer);};
  },[state?.path,search,request]);
  const choose=(path:HsPath)=>void run(async()=>{
    if(adult!==true){setError("Confirm you are 18 or older before continuing.");return;}
    await request("POST",`${API}/choose`,{path,adultConfirmed:true});await refresh();
  });
  const lookup=()=>void run(async()=>{
    await request("POST",`${API}/lookup`,{invitation:entry.trim(),revision:state.revision});await refresh();
    setMessage("Invitation matched. No active player or team access was created.");
  });
  const continueParentPreview=(fromMinor=false)=>run(async()=>{
    if(!preview)return;
    if(fromMinor)await request("POST",`${API}/choose`,{path:"parent",adultConfirmed:true});
    await request("POST",`${API}/preview-checkpoint`,{});setParentTakeover(false);await refresh();
  });
  const waiting=state && !["draft","choose","parent_verification_required"].includes(state.status);
  const dirty=JSON.stringify(players)!==JSON.stringify(state?.draft?.players??[])||guardian!==!!state?.draft?.guardianConfirmed;
  const selected=catalog.programs.find((p:any)=>p.id===programId);
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground">
    <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">{preview?"Preview · synthetic data · never saved":"DEV only · guarded onboarding"}</p>
      {preview&&<p role="note" className="rounded-lg border border-amber-500 p-3 text-sm">Screen demonstration only. No verification, approval or registration occurs. Do not enter real child information. Reloading clears all preview changes.</p>}
      <h1 className="text-2xl font-semibold">How will you use Roster?</h1>
      <p className="text-sm text-muted-foreground">Set up your adult account or request a High School role. A selection is not permission to see a roster.</p>
      {!authenticated?<p>Sign in to continue. <Link href="/login" className="underline">Go to sign in</Link></p>:!state?<p role="status">Loading your saved progress…</p>:<>
        {!state.path&&<>
          <AdultSignupConfirmation value={adult} onChange={v=>{setAdult(v);setParentTakeover(false);}}
            onParentSetup={preview?()=>setParentTakeover(true):undefined}/>
          {preview&&adult===false&&parentTakeover&&<ParentAssistedSetupPreview busy={busy} onContinue={()=>continueParentPreview(true)}/>}
          {adult!==false&&<div className="grid gap-3 sm:grid-cols-2">
            {([["player","Player","Continue existing player setup"],["organizer","Captain or league admin","Keep the existing organizer options"],["staff","Coach or school staff","Request an approved school role"],["parent","Parent of a player","Set up a household of up to four players"]] as const).map(([path,title,subtitle])=>
              <button key={path} disabled={busy||adult!==true} className={`${button} text-left`} onClick={()=>choose(path)}><strong className="block">{title}</strong><span className="text-xs text-muted-foreground">{subtitle}</span></button>)}
          </div>}
        </>}
        {["player","organizer"].includes(state.path)&&(preview?<AdultOnboardingPreview organizer={state.path==="organizer"}/>:
          <div className="space-y-3"><p role="status">Your existing adult onboarding is ready to continue. No High School role was granted.</p><Link href="/" className={button}>Continue existing setup</Link></div>)}
        {state.status==="parent_verification_required"&&<div className="space-y-3">
          <p>Shared credentials let you sign in, but parent setup needs a code sent to the parent's registered email. This device is not automatically approved.</p>
          {preview?<ParentAssistedSetupPreview busy={busy} onContinue={()=>continueParentPreview()}/>:<Link href="/high-school/parent-verification" className={button}>Verify parent access</Link>}
        </div>}
        {waiting&&<div role="status" className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">{preview?"Preview: ":""}{state.status==="waiting_approval"?"Waiting for staff approval":state.status==="waiting_staff_review"?"Waiting for staff review":state.status==="denied"?"Request was not approved":state.status==="team_setup_pending"?"Approval recorded · team setup pending":"Approval recorded · coverage pending"}</h2>
          <p>{state.status==="waiting_approval"?"The league administrator approves the first staff member. Later approvals follow the Head Coach/AD hierarchy.":state.status==="waiting_staff_review"?"Staff must review a self-entered join before participation can be considered.":"No roster, protected chats or child access has been enabled."}</p>
          <p className="text-sm text-muted-foreground">Seat allocation, purchases and protected chats are not enabled in this phase. No notification was sent. {state.status==="waiting_staff_review"?"Staff review of player details remains blocked until protected roster access is available.":"Authorized staff reviewers can use the Approvals list."}</p>
          <button className={button} disabled={busy} onClick={()=>void run(refresh)}>Check status</button>
        </div>}
        {state.path==="staff"&&state.status==="draft"&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{
          await request("POST",`${API}/draft`,{kind:"staff",revision:state.revision,role,...creating?{newSchool:school}:{programId,teamId}});
          await refresh();
        });}}>
          <h2 className="font-semibold">Request a school staff role</h2>
          <label className="block text-sm">Staff role<select aria-label="Staff role" className={field} value={role} onChange={e=>{setRole(e.target.value);setCreating(false);}}>{HS_STAFF_ROLES.map(r=><option value={r} key={r}>{labels[r]}</option>)}</select></label>
          <div className="flex flex-wrap gap-2"><input aria-label="Staff invitation" className={`${field} flex-1`} placeholder="Coach/AD invitation token" value={entry} onChange={e=>setEntry(e.target.value)}/><button type="button" className={button} disabled={busy||!entry.trim()} onClick={lookup}>Use staff invitation</button></div>
          <label className="block text-sm">Find a school or co-op<input className={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or town"/></label>
          {!creating&&<>
            <label className="block text-sm">School<select aria-label="School" className={field} value={programId} onChange={e=>{setProgram(e.target.value);setTeam("");}}><option value="">Choose a school</option>{catalog.programs.map((p:any)=><option key={p.id} value={p.id}>{p.name} · {p.town}</option>)}</select></label>
            <label className="block text-sm">Team<select aria-label="Team" className={field} value={teamId} onChange={e=>setTeam(e.target.value)}><option value="">Choose a team</option>{selected?.teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          </>}
          {["head_coach","athletic_director"].includes(role)&&<button type="button" className={button} onClick={()=>setCreating(!creating)}>{creating?"Use an existing school":"Request a new school or co-op"}</button>}
          {creating&&<div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm">Creation is a request, not approval. A league administrator must approve the initial staff member.</p>
            <label>League<select className={field} value={school.leagueId} onChange={e=>setSchool({...school,leagueId:e.target.value})}><option value="">Choose a DEV league</option>{catalog.leagues.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>School or co-op name<input className={field} required maxLength={80} value={school.name} onChange={e=>setSchool({...school,name:e.target.value})}/></label>
            <label>Town<input className={field} required maxLength={80} value={school.town} onChange={e=>setSchool({...school,town:e.target.value})}/></label>
          </div>}
          {!catalog.programs.length&&!creating&&<p className="text-sm">No matching DEV school fixtures are available. Nothing from production is searched.</p>}
          <button className={button} disabled={busy||(!creating&&(!programId||!teamId))||(creating&&!school.leagueId)}>Submit staff request</button>
        </form>}
        {state.path==="parent"&&state.status==="draft"&&<div className="space-y-5">
          <h2 className="font-semibold">Set up your players</h2>
          <p className="text-sm">Coach-first invitations reuse the staged players, not duplicate profiles. Use self-entry only when you do not have an invitation.</p>
          <div className="flex flex-wrap gap-2"><input aria-label="Parent invitation" className={`${field} flex-1`} value={entryKind==="invitation"?entry:""} onChange={e=>{setEntryKind("invitation");setEntry(e.target.value);}} placeholder="Coach invitation token"/><button className={button} disabled={busy||!entry.trim()||entryKind!=="invitation"} onClick={lookup}>Match coach invitation</button></div>
          <p className="text-sm">How many players are you setting up? {players.length} of 4</p>
          {players.map((p,i)=><fieldset key={p.id} className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 font-medium">Player {i+1}</legend>
            {(["firstName","lastName"] as const).map(key=><label className="block text-sm" key={key}>{key==="firstName"?"First name":"Last name"}<input aria-label={`${key==="firstName"?"First name":"Last name"} ${i+1}`} className={field} readOnly={state.draft?.imported} maxLength={80} value={p[key]} onChange={e=>setPlayers(players.map((v,j)=>j===i?{...v,[key]:e.target.value,consent:false}:v))}/></label>)}
            <div className="grid grid-cols-2 gap-3"><label>Graduation year<input aria-label={`Graduation year ${i+1}`} className={field} type="number" min="2026" max="2040" readOnly={state.draft?.imported} value={p.gradYear} onChange={e=>setPlayers(players.map((v,j)=>j===i?{...v,gradYear:Number(e.target.value),consent:false}:v))}/></label>
              <label>Position<select aria-label={`Position ${i+1}`} className={field} disabled={state.draft?.imported} value={p.position} onChange={e=>setPlayers(players.map((v,j)=>j===i?{...v,position:e.target.value,consent:false}:v))}>{["F","D","G"].map(v=><option key={v}>{v}</option>)}</select></label></div>
            <label className="block">Jersey number (optional)<input aria-label={`Jersey number ${i+1}`} className={field} inputMode="numeric" maxLength={2} readOnly={state.draft?.imported} value={p.jerseyNumber} onChange={e=>setPlayers(players.map((v,j)=>j===i?{...v,jerseyNumber:e.target.value.replace(/\D/g,""),consent:false}:v))}/></label>
            <p className="text-xs text-muted-foreground">{HS_CONSENT_TEXT}</p>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.consent} aria-label={`Consent for player ${i+1}`} onChange={e=>setPlayers(players.map((v,j)=>j===i?{...v,consent:e.target.checked}:v))}/>I consent to the stated use for this player.</label>
            {(["photoConsent","publicNameConsent"] as const).map(key=><label className="flex gap-2 text-sm" key={key}><input type="checkbox" checked={p[key]} onChange={e=>setPlayers(players.map((v,j)=>j===i?{...v,[key]:e.target.checked,consent:false}:v))}/>{key==="photoConsent"?"Allow a player photo to be shown to the team (optional)":"Allow the player's name in public results (optional)"}</label>)}
            {!state.draft?.imported&&players.length>1&&<button className={button} onClick={()=>setPlayers(players.filter((_,j)=>j!==i))}>Remove player {i+1}</button>}
          </fieldset>)}
          {!state.draft?.imported&&<button className={button} disabled={players.length>=4} onClick={()=>setPlayers([...players,emptyPlayer()])}>Add another player</button>}
          {players.length>=4&&<p role="status" className="text-sm">Four-player limit reached. A fifth player cannot be added.</p>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={guardian} onChange={e=>setGuardian(e.target.checked)}/>I am the authorized adult guardian for these players.</label>
          <button className={button} disabled={busy||!guardian||players.some(p=>!p.consent||!p.firstName.trim()||!p.lastName.trim())} onClick={()=>void run(async()=>{
            await request("POST",`${API}/draft`,{kind:"parent",revision:state.revision,guardianConfirmed:true,players});await refresh();setMessage(preview?"Preview intake updated in memory only. No consent or child record was saved.":"Player intake and versioned consent saved privately. No child profile is active.");
          })}>Save players and consent</button>
          {state.draft?.guardianConfirmed&&<div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold">Request the team join</h3>
            {!state.draft?.imported&&<><label>Team code<input aria-label="Team code" className={field} value={entryKind==="code"?entry:""} onChange={e=>{setEntryKind("code");setEntry(e.target.value);}}/></label><p className="text-xs">Self-entered joins require staff review.</p></>}
            {preview&&<p className="text-sm">Use PREVIEW as the demonstration team code. This does not join a real team.</p>}
            {state.draft?.imported&&<p className="text-sm">Keep the matched invitation token entered above to claim these exact staged records.</p>}
            {dirty&&<p className="text-sm">Save the latest player details and consent before joining.</p>}
            <button className={button} disabled={busy||!entry.trim()||dirty} onClick={()=>void run(async()=>{
              await request("POST",`${API}/join`,{revision:state.revision,...(state.draft?.imported?{invitation:entry.trim()}:{teamCode:entry.trim()})});await refresh();
            })}>Submit team join</button>
          </div>}
        </div>}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <button className={button} disabled={busy} onClick={()=>void run(refresh)}>Reload saved progress</button>
          {!preview&&state.path==="parent"&&state.status!=="parent_verification_required"&&<button className={button} disabled={busy} onClick={()=>void run(async()=>{
            try{await request("POST","/api/high-school/parent-verification/revoke",{});}finally{parentVerificationSession.clear();}
          })}>Lock parent controls</button>}
          {state.path!=="parent"&&<button className={button} disabled={busy} onClick={()=>void run(async()=>setApprovals(await request("GET",`${API}/approvals`)))}>Approvals</button>}
        </div>
        {approvals&&<section className="space-y-3"><h2 className="font-semibold">Approvals</h2>{!approvals.length&&<p>No requests you are authorized to review.</p>}{approvals.map(a=><div key={a.id} className="rounded border p-3"><p>{a.school} · {labels[a.role]}</p><div className="flex gap-2">{[true,false].map(approve=><button key={String(approve)} className={button} disabled={busy} onClick={()=>void run(async()=>{await request("POST",`${API}/decision`,{id:a.id,approve});setApprovals(await request("GET",`${API}/approvals`));})}>{approve?"Approve":"Deny"}</button>)}</div></div>)}</section>}
      </>}
      {message&&<p role="status" className="rounded border p-3 text-sm">{message}</p>}
      {error&&<p role="alert" className="rounded border border-red-400 p-3 text-sm">{error}</p>}
      {authenticated&&!preview&&<button className={button} disabled={busy} onClick={()=>void run(async()=>{
        parentVerificationSession.clear();const{error}=await supabase.auth.signOut({scope:"local"});if(error)throw error;window.location.assign("/login");
      })}>Sign out</button>}
      <p className="text-xs text-muted-foreground">Synthetic DEV testing only. No purchases, outgoing email/push, real-family activation or automatic parent-device approval.</p>
    </section>
  </main>;
}
