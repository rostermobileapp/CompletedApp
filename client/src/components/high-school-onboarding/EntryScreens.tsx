import { Check, Trophy } from "lucide-react";
import { ChoiceCard, ProgressChoiceIcon, ScreenFrame, StepHeader } from "./shared";

export function SignupEntryScreen({ onSignup, onUnder18 }: { onSignup:()=>void; onUnder18:()=>void }) {
  return <ScreenFrame action={<button className="hsy-primary" onClick={onSignup}>Sign Up</button>}>
    <section className="hsy-content" style={{paddingTop:48}}>
      <div style={{fontSize:18,fontWeight:800,letterSpacing:3,marginBottom:48}}>ROSTER</div><h1>Sign up</h1>
      <p className="hsy-subtitle">Continue to the secure signup form to create your account.</p>
      <p className="hsy-footer-note">Already have an account? <a className="hsy-link" href="/login">Sign in</a></p>
      <div style={{textAlign:"center",marginTop:28}}><button className="hsy-link" style={{border:0,background:"none",padding:8}} onClick={onUnder18}>Under 18? A parent sets up your account.</button></div>
    </section>
  </ScreenFrame>;
}

export function HockeyTypeScreen({ value, setValue, onBack, onContinue, busy }: {
  value:"adult"|"high_school_youth"|""; setValue:(v:"adult"|"high_school_youth")=>void; onBack:()=>void; onContinue:()=>void; busy?:boolean;
}) {
  return <ScreenFrame header={<StepHeader step={3} total={10} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!value||busy} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>What kind of hockey?</h1><p className="hsy-subtitle">We'll show the roles that fit.</p>
      <div className="hsy-stack">
        <ChoiceCard title="Adult Hockey" description="Beer league, rec league, drop-ins and tournaments" selected={value==="adult"} icon={<ProgressChoiceIcon kind="adult"/>} onClick={()=>setValue("adult")}/>
        <ChoiceCard title="High School / Youth Hockey" description="School teams and co-ops, run by coaches with parents" selected={value==="high_school_youth"} icon={<ProgressChoiceIcon kind="hs"/>} onClick={()=>setValue("high_school_youth")}/>
      </div>
    </section>
  </ScreenFrame>;
}

export function AdultRoleScreen({ value,setValue,onBack,onContinue,busy }: {
  value:string;setValue:(v:string)=>void;onBack:()=>void;onContinue:()=>void;busy?:boolean;
}) {
  const roles=[["Player","Player"],["Team Captain","Team Captain"],["League Manager","League Manager"],["Tournament Organizer","Tournament Organizer"],["Scorekeeper","Scorekeeper"]];
  return (
    <ScreenFrame header={<StepHeader step={4} total={10} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!value||busy} onClick={onContinue}>Continue</button>}>
      <section className="hsy-content"><h1>What is your Role?</h1><p className="hsy-subtitle">Adult Hockey · Pick the one that fits best.</p><div className="hsy-stack hsy-adult-role-options">
        {roles.map(([v,title])=><button key={v} className="hsy-choice" onClick={()=>setValue(v)} type="button" aria-pressed={value===v}><span className="hsy-choice-icon"><Trophy size={24}/></span><span className="hsy-choice-copy"><strong>{title}</strong></span>{value===v&&<Check className="hsy-check" size={20}/>}</button>)}
      </div></section>
    </ScreenFrame>
  );
}

export function HighSchoolRoleScreen({ value,setValue,onBack,onContinue,busy,onReferralChange,referral,onOtherReferralChange,otherReferral,partners,partnerId,onPartnerChange }: {
  value:string;setValue:(v:string)=>void;onBack:()=>void;onContinue:()=>void;busy?:boolean;onReferralChange?:(v:string)=>void;referral?:string;
  onOtherReferralChange?:(v:string)=>void;otherReferral?:string;partners?:any[];partnerId?:string;onPartnerChange?:(v:string)=>void;
}) {
  const roles=[
    ["staff","Coach or school staff","Head coach, assistant, AD or team manager","staff"],
    ["parent","Parent of a player","Set up your family and up to 4 players","parent"],
    ["league_admin","League admin","Run a league: schools, approvals, seats","league"],
  ] as const;
  return <ScreenFrame header={<StepHeader step={4} total={10} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!value||busy} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>What is your Role?</h1><p className="hsy-subtitle">High School / Youth Hockey · Pick the one that fits best.</p><div className="hsy-stack">
      {roles.map(([v,title,description,icon])=><ChoiceCard key={v} title={title} description={description} selected={value===v} icon={<ProgressChoiceIcon kind={icon}/>} onClick={()=>setValue(v)}/>)}
    </div>
    <div className="hsy-card tint" style={{marginTop:16}}><strong>Players don't sign up here.</strong><p className="hsy-note" style={{margin:"4px 0 0"}}>A parent adds them and approves their phone.</p></div>
    {onReferralChange&&<div style={{marginTop:20}}><label className="hsy-label">How did you hear about Roster? <span style={{color:"#64748b",fontWeight:400}}>(optional)</span><select className="hsy-field" value={referral??""} onChange={e=>onReferralChange(e.target.value)}><option value="">Choose one</option><option value="coach">Coach or school</option><option value="league">League</option><option value="friend">Family or friend</option><option value="search">Online search</option><option value="other">Other</option></select></label>
      {referral==="other"&&onOtherReferralChange&&<label className="hsy-label">Tell us where<input className="hsy-field" maxLength={120} value={otherReferral??""} onChange={e=>onOtherReferralChange(e.target.value)}/></label>}
      {!!partners?.length&&onPartnerChange&&<label className="hsy-label">Referred by a league or partner? <span style={{color:"#64748b",fontWeight:400}}>(optional)</span><select className="hsy-field" value={partnerId??""} onChange={e=>onPartnerChange(e.target.value)}><option value="">No partner selected</option>{partners.map(p=><option key={p.id} value={p.id}>{p.orgName}</option>)}</select></label>}
    </div>}
    </section>
  </ScreenFrame>;
}
