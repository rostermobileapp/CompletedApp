import { HsyInput, HsyLabel, ScreenFrame, StepHeader } from "./shared";

export type HsProfileDraft={firstName:string;lastName:string;timezone:string};
export function ProfileScreen({profile,update,onBack,onContinue,busy}:{
  profile:HsProfileDraft;update:(patch:Partial<HsProfileDraft>)=>void;onBack:()=>void;onContinue:()=>void;busy?:boolean;
}){
  const valid=!!profile.firstName.trim()&&!!profile.lastName.trim()&&!!profile.timezone.trim();
  return <ScreenFrame header={<StepHeader step={1} total={2} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!valid||busy} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>Your profile</h1><p className="hsy-subtitle">Add your adult contact details. Player details are managed separately by a parent.</p>
      <HsyLabel>First name<HsyInput autoComplete="given-name" maxLength={100} value={profile.firstName} onChange={e=>update({firstName:e.target.value})}/></HsyLabel>
      <HsyLabel>Last name<HsyInput autoComplete="family-name" maxLength={100} value={profile.lastName} onChange={e=>update({lastName:e.target.value})}/></HsyLabel>
      <HsyLabel>Time zone<HsyInput placeholder="e.g. America/New_York" maxLength={100} value={profile.timezone} onChange={e=>update({timezone:e.target.value})}/></HsyLabel>
      <div className="hsy-card tint"><p className="hsy-note" style={{margin:0}}>This profile contains no player type, child contact details, or child profile setup.</p></div>
    </section>
  </ScreenFrame>;
}
