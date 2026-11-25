import { ArrowLeft, Copy, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { ScreenFrame } from "./shared";

export function Under18ShareScreen({ onCode, onBack }: {onCode?:()=>void;onBack:()=>void}) {
  const [fallback,setFallback]=useState(false); const [notice,setNotice]=useState("");
  const signupLink=`${window.location.origin}/login?signup=1&source=under18`;
  const share=async()=>{
    setNotice("");setFallback(false);
    if(navigator.share){
      try{await navigator.share({title:"Set up Roster for your player",text:"A parent sets up a Roster account for players under 18.",url:signupLink});}
      catch(error:any){if(error?.name==="AbortError"){setNotice("Share cancelled. You can copy the link below instead.");setFallback(true);}else{setNotice("Sharing isn't available right now. Copy the link below.");setFallback(true);}}
    }else{setNotice("Sharing isn't available on this device. Copy the link below.");setFallback(true);}
  };
  const copy=async()=>{
    try{await navigator.clipboard.writeText(signupLink);setNotice("Signup link copied.");}
    catch{setFallback(true);setNotice("Select and copy this signup link.");}
  };
  return <ScreenFrame action={<button className="hsy-secondary" style={{width:"100%"}} onClick={onBack}>Back</button>}>
    <section className="hsy-content" style={{paddingTop:34}}><button className="hsy-back" aria-label="Back" onClick={onBack}><ArrowLeft size={22}/></button>
      <div style={{display:"inline-flex",padding:14,borderRadius:16,background:"#eff6ff",color:"#2563eb",marginBottom:18}}><Link2 size={26}/></div>
      <h1>Players under 18 join through a parent</h1><p className="hsy-subtitle">Your parent's Roster account connects you to your team.</p>
      <div className="hsy-stack">
        {onCode&&<button className="hsy-choice" onClick={onCode}><span className="hsy-choice-icon"><span style={{fontWeight:800}}>•••</span></span><span className="hsy-choice-copy"><strong>I have a code from my parent</strong><small>Enter their 6-character setup code</small></span></button>}
        <button className="hsy-choice" onClick={()=>void share()}><span className="hsy-choice-icon"><Share2 size={24}/></span><span className="hsy-choice-copy"><strong>Share with a parent</strong><small>Send them a link to set up Roster and add you</small></span></button>
      </div>
      {notice&&<div role="status" className="hsy-card tint" style={{marginTop:16}}><p className="hsy-note" style={{margin:"0 0 8px"}}>{notice}</p>{fallback&&<div className="hsy-row"><input className="hsy-field" aria-label="Signup link to copy" readOnly value={signupLink} onFocus={e=>e.currentTarget.select()}/><button className="hsy-secondary" onClick={()=>void copy()}><Copy size={17}/></button></div>}</div>}
      <p className="hsy-footer-note">{onCode?"A parent must set up and approve your access.":"Your parent needs to give you a setup code, then approve your phone. Device setup is currently limited to participating test families."}</p>
    </section>
  </ScreenFrame>;
}
