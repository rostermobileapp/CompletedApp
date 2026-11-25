import { Check, Plus } from "lucide-react";
import { HS_CONSENT_TEXT, HS_MAX_FAMILY_PLAYERS } from "@shared/highSchoolOnboarding";
import { useSubscriptionPrices } from "@/hooks/useSubscriptionPrices";
import { ScreenFrame, StepHeader } from "./shared";

export type ParentPlayer = {
  id: string; firstName: string; lastName: string; gradYear?: number; birthYear?: number; position: "F"|"D"|"G"; jerseyNumber: string;
  consent: boolean; consentVersion: string; photoConsent: boolean; publicNameConsent: boolean;
};

export function AddPlayersScreen({ players, update, add, remove, onBack, onContinue, busy }: {
  players: ParentPlayer[]; update: (id: string, patch: Partial<ParentPlayer>) => void; add: () => void; remove: (id: string) => void;
  onBack: () => void; onContinue: () => void; busy?: boolean;
}) {
  const valid = players.length > 0 && players.length <= HS_MAX_FAMILY_PLAYERS && players.every(p => p.firstName.trim() && p.lastName.trim() && p.birthYear);
  return <ScreenFrame header={<StepHeader step={1} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!valid || busy} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>Who are you setting up?</h1><p className="hsy-subtitle">Up to {HS_MAX_FAMILY_PLAYERS} players. Birth year only—no full birthday, email, phone or address.</p>
      {players.length > HS_MAX_FAMILY_PLAYERS && <p className="hsy-alert" role="alert">This plan covers up to {HS_MAX_FAMILY_PLAYERS} players. Remove extra players from this draft to continue.</p>}
      <div className="hsy-between hsy-card" style={{marginBottom:14}}><strong>Players</strong><div className="hsy-row"><button type="button" className="hsy-secondary" aria-label="Remove a player" disabled={players.length<=1} onClick={() => remove(players[players.length-1].id)}>−</button><strong style={{fontSize:20,width:20,textAlign:"center"}}>{players.length}</strong><button type="button" className="hsy-secondary" aria-label="Add a player" disabled={players.length>=HS_MAX_FAMILY_PLAYERS} onClick={add}><Plus size={20}/></button></div></div>
      <div className="hsy-stack">{players.map((p, i) => <fieldset className="hsy-card selected" key={p.id} style={{padding:16,margin:0}}>
        <legend className="hsy-section-label" style={{padding:"0 4px",color:"#2563eb"}}>Player {i+1}</legend>
        <div className="hsy-grid2"><label className="hsy-label">First name<input className="hsy-field" maxLength={80} value={p.firstName} onChange={e=>update(p.id,{firstName:e.target.value,consent:false})}/></label><label className="hsy-label">Last name<input className="hsy-field" maxLength={80} value={p.lastName} onChange={e=>update(p.id,{lastName:e.target.value,consent:false})}/></label></div>
        <label className="hsy-label">Birth year (required)<select className="hsy-field" aria-label="Birth year" value={p.birthYear??""} onChange={e=>update(p.id,{birthYear:e.target.value?Number(e.target.value):undefined,consent:false})}><option value="">Choose birth year</option>{Array.from({length:101},(_,j)=>new Date().getFullYear()-j).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
        <div className="hsy-grid2"><label className="hsy-label">Grad year (optional)<select className="hsy-field" aria-label="Graduation year" value={p.gradYear??""} onChange={e=>update(p.id,{gradYear:e.target.value?Number(e.target.value):undefined,consent:false})}><option value="">Not specified</option>{Array.from({length:15},(_,j)=>2026+j).map(y=><option key={y}>{y}</option>)}</select></label><label className="hsy-label">Jersey # <span style={{color:"#64748b",fontWeight:400}}>(optional)</span><input className="hsy-field" inputMode="numeric" maxLength={2} value={p.jerseyNumber} onChange={e=>update(p.id,{jerseyNumber:e.target.value.replace(/\D/g,""),consent:false})}/></label></div>
        <label className="hsy-label">Position</label><div className="hsy-inline-choice">{([["F","Forward"],["D","Defense"],["G","Goalie"]] as const).map(([id,label])=><button type="button" key={id} className={p.position===id?"active":""} onClick={()=>update(p.id,{position:id,consent:false})}>{label}</button>)}</div>
        {players.length>1&&<button type="button" className="hsy-link" style={{marginTop:12,border:0,background:"none",padding:0}} onClick={()=>remove(p.id)}>Remove player</button>}
      </fieldset>)}</div>
      <button type="button" disabled={players.length>=HS_MAX_FAMILY_PLAYERS} className="hsy-secondary" style={{width:"100%",marginTop:12}} onClick={add}>Add another player</button>
    </section>
  </ScreenFrame>;
}

export function ConsentScreen({ player, index, total, guardian, setGuardian, update, onBack, onContinue, busy }: {
  player: ParentPlayer; index: number; total: number; guardian: boolean; setGuardian: (v: boolean) => void; update: (patch: Partial<ParentPlayer>) => void;
  onBack: () => void; onContinue: () => void; busy?: boolean;
}) {
  const name = player.firstName.trim() || "your player";
  return <ScreenFrame header={<StepHeader step={2} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!player.birthYear || !player.consent || (index===total-1&&!guardian) || busy} onClick={onContinue}>Agree and continue</button>}>
    <section className="hsy-content"><div className="hsy-section-label" style={{marginBottom:8}}>Consent for {name} · Player {index+1} of {total}</div><h1>Review player privacy</h1><p className="hsy-subtitle">Your choice applies to this player only.</p>
      <div className="hsy-stack"><Info title="What Roster stores" detail="Name, required birth year, optional grad year, position, optional jersey number, team schedule and results."/><Info title="Who sees it" detail={`${name}'s coaches, team parents and teammates. Other teams see a first name and last initial.`}/><Info title="Never collected" detail="Email, phone, address or full birthday."/></div>
      <label className="hsy-label" style={{marginTop:18}}>Birth year (required)<select className="hsy-field" aria-label="Birth year" value={player.birthYear??""} onChange={e=>update({birthYear:e.target.value?Number(e.target.value):undefined,consent:false})}><option value="">Choose birth year</option>{Array.from({length:101},(_,j)=>new Date().getFullYear()-j).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      <p className="hsy-section-label" style={{margin:"22px 0 12px"}}>Optional · off until you turn them on</p>
      <div className="hsy-stack"><label className="hsy-toggle"><input type="checkbox" checked={player.photoConsent} onChange={e=>update({photoConsent:e.target.checked,consent:false})}/>Show {name}'s photo to the team</label><label className="hsy-toggle"><input type="checkbox" checked={player.publicNameConsent} onChange={e=>update({publicNameConsent:e.target.checked,consent:false})}/>Include {name}'s name in public results</label></div>
      <div className="hsy-card tint" style={{marginTop:20}}><p className="hsy-note" style={{margin:0}}>{HS_CONSENT_TEXT}</p></div>
      <label className="hsy-toggle" style={{marginTop:18}}><input type="checkbox" checked={player.consent} onChange={e=>update({consent:e.target.checked})}/>I'm this player's parent or legal guardian, and I agree to the privacy terms.</label>
      {index===total-1&&<label className="hsy-toggle" style={{marginTop:12}}><input type="checkbox" checked={guardian} onChange={e=>setGuardian(e.target.checked)}/>I am the authorized adult guardian for these players.</label>}
    </section>
  </ScreenFrame>;
}
function Info({title,detail}:{title:string;detail:string}){return <div className="hsy-card"><strong>{title}</strong><p className="hsy-note" style={{margin:"5px 0 0"}}>{detail}</p></div>}

export function JoinTeamScreen({ players, entry, setEntry, onLookup, onJoin, onBack, busy, imported, dirty, onSkip }: {
  players: ParentPlayer[]; entry:string; setEntry:(v:string)=>void; onLookup:()=>void; onJoin:()=>void; onBack:()=>void; busy?:boolean; imported?:boolean; dirty?:boolean; onSkip?:()=>void;
}) {
  return <ScreenFrame header={<StepHeader step={3} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={busy || dirty} onClick={onJoin}>Continue</button>}>
    <section className="hsy-content"><h1>Join your team</h1><p className="hsy-subtitle">Your coach may have already added a player.</p>
      <div className="hsy-card tint"><span className="hsy-section-label">Coach invitation</span><p style={{margin:"8px 0"}}>Match an invitation to connect staged player details to the right roster.</p><div className="hsy-row"><input className="hsy-field" value={entry} onChange={e=>setEntry(e.target.value)} placeholder="Invitation link or token"/><button className="hsy-secondary" disabled={!entry.trim()||busy} onClick={onLookup}>Match</button></div></div>
      {!imported&&<div style={{marginTop:18}}><div className="hsy-section-label" style={{textAlign:"center",marginBottom:16}}>or use a team code</div><label className="hsy-label">Team code<input className="hsy-field" value={entry} onChange={e=>setEntry(e.target.value)} placeholder="Enter team code"/></label><p className="hsy-note">A coach reviews players added with a code. Players can also join a team later.</p></div>}
      {players.map(p=><div className="hsy-list-row" key={p.id}><span><strong>{p.firstName} {p.lastName}</strong><small style={{display:"block",color:"#64748b"}}>{p.gradYear?`${p.gradYear} · `:""}{p.position==="F"?"Forward":p.position==="D"?"Defense":"Goalie"}</small></span></div>)}
      {dirty&&<p className="hsy-alert">Save the latest player details and consent before requesting a team join.</p>}
      {onSkip&&<button type="button" className="hsy-secondary" style={{width:"100%",marginTop:18}} disabled={busy||dirty} onClick={onSkip}>Connect a team later · Set up phone now</button>}
    </section>
  </ScreenFrame>;
}

export function FamilyPlanScreen({ onBack, onContinue, busy }: { onBack:()=>void; onContinue:()=>void; busy?:boolean }) {
  const { playerProMonthly, isLoading } = useSubscriptionPrices();
  return <ScreenFrame header={<StepHeader step={4} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={busy} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>Your family plan</h1><p className="hsy-subtitle">One plan covers your family and up to {HS_MAX_FAMILY_PLAYERS} players.</p>
      <div className="hsy-alert" style={{marginBottom:16}}>Your league hasn't added seats yet. If it does, coverage may be provided by the league.</div>
      <div className="hsy-card selected"><div className="hsy-section-label">Family plan</div><h2 style={{fontSize:22,margin:"8px 0 0"}}>Player Pro</h2><p style={{color:"#64748b",margin:"2px 0 12px"}}>For parents of high school players</p><strong style={{fontSize:22}}>{playerProMonthly ?? (isLoading ? "Loading…" : "Price unavailable")}</strong>{playerProMonthly && <span style={{color:"#64748b"}}> / month</span>}
        <ul style={{paddingLeft:20,lineHeight:1.9}}><li>Covers parent accounts in your family</li><li>Up to {HS_MAX_FAMILY_PLAYERS} players, on any teams</li><li>Schedule changes with rink directions</li><li>Fee and payment tracking</li><li>Team and Parents chats</li></ul>
      </div><p className="hsy-note" style={{textAlign:"center"}}>Players never need their own plan. No subscription or purchase is made during onboarding.</p>
    </section>
  </ScreenFrame>;
}

export function ParentAllSetScreen({ players, children, activationAvailable, onBack, onContinue, onCode, onRequests, onTeam, busy, verificationRequired }: {
  players: ParentPlayer[]; children?: any[]; activationAvailable?:boolean; onBack:()=>void; onContinue:()=>void; onCode:(id:string)=>void; onRequests?:()=>void; onTeam?:()=>void; busy?:boolean; verificationRequired?:boolean;
}) {
  return <ScreenFrame action={<button className="hsy-primary" onClick={onContinue}>Check setup status</button>}>
    <section className="hsy-content"><div className="hsy-success" style={{display:"inline-flex",padding:12,marginBottom:18}}><Check size={24}/></div><h1 className="hsy-title-success">You're all set</h1>
      <p className="hsy-subtitle">Player information and guardian consent have been saved privately. Team access is still subject to approval and coverage.</p>
      <div className="hsy-card tint"><strong>This phone is your parent device</strong><p className="hsy-note" style={{marginBottom:0}}>Only verified parent devices can open parent controls. Child phones need approval here after their code is entered.</p></div>
      {verificationRequired&&<a className="hsy-link" href="/high-school/parent-verification" style={{display:"block",marginTop:16}}>Verify parent access</a>}
      <div style={{marginTop:22}}><strong>Set up a player's phone</strong><p className="hsy-note">A setup code alone never gives parent access.</p>
        <div className="hsy-stack">{players.map(p=>{const child=children?.find(c=>c.playerKey===p.id||c.id===p.id);return <div className="hsy-list-row" key={p.id}><span><strong>{p.firstName} {p.lastName}</strong><small style={{display:"block",color:"#64748b"}}>{child?.teamName ?? "Team can be added later"}</small></span><button className="hsy-secondary" disabled={!activationAvailable||!child||!(child.canActivate??child.enabled)||busy} onClick={()=>onCode(child.id)}>Get setup code</button></div>;})}</div>
      </div>
      {!activationAvailable&&<div className="hsy-alert" style={{marginTop:14}}>Child phone activation is not available in this phase. No setup code or child session can be issued.</div>}
      {onRequests&&<button className="hsy-secondary" style={{width:"100%",marginTop:14}} onClick={onRequests}>Review child phone requests</button>}
      {onTeam&&<button className="hsy-secondary" style={{width:"100%",marginTop:14}} disabled={busy} onClick={onTeam}>Connect a team or accept an invitation</button>}
      <div className="hsy-card tint" style={{marginTop:18}}><p className="hsy-note" style={{margin:0}}>Adding another parent? They use the shared login and must complete parent verification on their own device.</p></div>
    </section>
  </ScreenFrame>;
}

export function SetupCodeScreen({ child, code, expiresAt, onBack, onNew, onShare, busy }: {
  child?:any; code:string; expiresAt?:string; onBack:()=>void; onNew:()=>void; onShare:()=>void; busy?:boolean;
}) {
  const name=child?.firstName || "player";
  return <ScreenFrame action={<div className="hsy-grid2"><button className="hsy-secondary" disabled={busy} onClick={onNew}>New code</button><button className="hsy-primary" disabled={!code} onClick={onShare}>Share code</button></div>}>
    <section className="hsy-content"><button className="hsy-back" onClick={onBack} aria-label="Back"><span>‹</span></button><p className="hsy-section-label">Family · {name}</p><h1>Set up {name}'s phone</h1><p className="hsy-subtitle">On their phone, open Roster, tap “Under 18?” at sign-up, then “I have a code from my parent.”</p>
      <div className="hsy-card selected" style={{textAlign:"center",padding:"24px 18px"}}><span className="hsy-section-label">Setup code</span><div style={{fontSize:32,fontWeight:800,letterSpacing:7,margin:"14px 0"}}>{code ? code.split("").join(" ") : "— — — — — —"}</div><p className="hsy-note" style={{margin:0}}>Expires {expiresAt ? new Date(expiresAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}) : "in 10 minutes"} · works once</p></div>
      <p className="hsy-note" style={{marginTop:12}}>Your child only needs this code. No setup link is required.</p>
      <div className="hsy-card tint" style={{marginTop:16}}><p className="hsy-note" style={{margin:0}}>You'll still approve the phone on this device after the code is entered. The code alone never gives parent access.</p></div>
    </section>
  </ScreenFrame>;
}

export function ParentDeviceRequestsScreen({ requests, decide, onBack, busy }: {
  requests:any[]; decide:(id:string,approve:boolean)=>void; onBack:()=>void; busy?:boolean;
}) {
  return <ScreenFrame action={<button className="hsy-primary" onClick={onBack}>Done</button>}>
    <section className="hsy-content"><p className="hsy-section-label">Family · Parent's phone</p><h1>Approve a player's phone</h1><p className="hsy-subtitle">Only approve a request you recognize.</p>
      {!requests.length?<div className="hsy-card tint">No child-phone requests are waiting.</div>:<div className="hsy-stack">{requests.map(r=><div className="hsy-card" key={r.id}><div className="hsy-between"><strong>Approve {r.firstName}'s phone?</strong><span className="hsy-section-label">{r.deviceLabel}</span></div><p className="hsy-note">Approval signs the device in to this child's player profile only: Team chat, Family chat and schedule. No payments, parent access or messaging coaches.</p><div className="hsy-grid2"><button className="hsy-secondary" disabled={busy} onClick={()=>decide(r.id,false)}>Deny</button><button className="hsy-primary" disabled={busy} onClick={()=>decide(r.id,true)}>Approve</button></div></div>)}</div>}
      <p className="hsy-footer-note">Not expecting this? Tap Deny.</p>
    </section>
  </ScreenFrame>;
}
