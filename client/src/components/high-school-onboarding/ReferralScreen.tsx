import { ScreenFrame, StepHeader } from "./shared";

export function ReferralScreen({partners,partnerId,source,otherSource,locked,onPartner,onSource,onOther,onBack,onContinue,busy}:{
  partners:any[];partnerId:string;source:string;otherSource:string;locked?:boolean;onPartner:(id:string)=>void;onSource:(source:string)=>void;onOther:(value:string)=>void;onBack:()=>void;onContinue:()=>void;busy?:boolean;
}){
  const valid=source!=="other"||!!otherSource.trim();
  return <ScreenFrame header={<StepHeader step={1} total={2} onBack={onBack}/>} action={<button className="hsy-primary" disabled={busy||!valid} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>How did you find Roster?</h1><p className="hsy-subtitle">Referral details help us connect families with their school or league.</p>
      {!!partners.length&&<label className="hsy-label">School or league partner<select className="hsy-field" disabled={locked} value={partnerId} onChange={e=>{onPartner(e.target.value);if(e.target.value)onSource("");}}><option value="">Choose a partner (optional)</option>{partnerId&&!partners.some(p=>p.id===partnerId)&&<option value={partnerId}>Previously selected partner</option>}{partners.map(p=><option key={p.id} value={p.id}>{p.orgName}</option>)}</select></label>}
      <div className="hsy-section-label" style={{margin:"16px 0 10px"}}>Or tell us another source</div>
      <div className="hsy-stack">{[["coach","Coach or school"],["league","League"],["friend","Family or friend"],["search","Online search"],["other","Other"],["","Skip this question"]].map(([id,title])=><button type="button" key={id||"skip"} className={`hsy-list-row${source===id?" hsy-card selected":""}`} disabled={locked} onClick={()=>{onSource(id);onPartner("");}} style={{textAlign:"left",background:source===id?"#eff6ff":"#fff",cursor:"pointer"}}><strong>{title}</strong>{source===id&&<span style={{color:"#2563eb"}}>Selected</span>}</button>)}</div>
      {source==="other"&&<label className="hsy-label" style={{marginTop:14}}>Where did you hear about us?<input className="hsy-field" maxLength={200} value={otherSource} onChange={e=>onOther(e.target.value)}/></label>}
      {locked&&<div className="hsy-card tint" style={{marginTop:16}}>The first confirmed referral source is kept with your onboarding context.</div>}
      <p className="hsy-footer-note">Referral information does not grant access or change approval requirements.</p>
    </section>
  </ScreenFrame>;
}
