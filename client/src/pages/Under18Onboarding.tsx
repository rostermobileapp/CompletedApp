import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requestChildSession, childSkinSession } from "@/lib/highSchoolChildSession";
import { ChildProfileScreen } from "@/components/high-school-onboarding/ChildProfileScreen";
import { ScreenFrame } from "@/components/high-school-onboarding/shared";
import { Under18ShareScreen } from "@/components/high-school-onboarding/Under18ShareScreen";

type RequestFn = (method:string,path:string,body?:unknown)=>Promise<any>;
const realRequest:RequestFn=async(method,path,body)=>{
  if(method!=="POST"||!["/api/high-school/child-device/start","/api/high-school/child-device/poll"].includes(path))throw new Error("Player setup action is unavailable.");
  const response=await fetch(path,{method,cache:"no-store",credentials:"omit",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok){
    if(response.status===503)throw new Error("Child phone activation is temporarily unavailable. Ask your parent to retry.");
    throw new Error("That setup request could not be completed. Check with your parent.");
  }
  return response.json();
};
const API="/api/high-school/child-device";
const cleanCode=(value:string)=>value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,"").slice(0,6);

export default function Under18Onboarding({ request=realRequest,initialView,challengeId:challengeIdProp }: {request?:RequestFn;initialView?:"share"|"code";challengeId?:string}) {
  const [code,setCode]=useState("");
  const [view,setView]=useState<"share"|"entry"|"waiting"|"denied"|"expired"|"approved">(()=>initialView==="code"||(typeof window!=="undefined"&&window.location.pathname.endsWith("/code"))?"entry":"share");
  const [deviceLabel,setDeviceLabel]=useState("This phone");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [waiting,setWaiting]=useState<{requestId:string;requestToken:string}|null>(null);
  const [session,setSession]=useState<any>(null);
  const childRequest=useCallback<RequestFn>((method,path,body)=>{
    if(request===realRequest)return requestChildSession(session?.token??"",method,path,body);
    return request(method,path,{...(body&&typeof body==="object"?body:{}),sessionToken:session?.token});
  },[request,session?.token]);
  const suppliedChallengeId=challengeIdProp??(typeof window!=="undefined"?new URLSearchParams(window.location.search).get("challengeId")??"":"");
  const challengeId=suppliedChallengeId;
  useEffect(()=>{
    if(view!=="waiting"||!waiting)return;
    let cancelled=false;
    const poll=async()=>{
      try{
        const result=await request("POST",`${API}/poll`,waiting);
        if(cancelled)return;
        if(result.status==="approved"){
          const token=result.sessionToken as string;
          let data:any;
          if(request===realRequest)data=await requestChildSession(token,"GET",`${API}/session`);
          else data=await request("GET",`${API}/session`,{sessionToken:token});
          if(cancelled)return;
          if(request===realRequest) childSkinSession.save(token);
          setSession({data,token});setView("approved");return;
        }
        if(result.status==="denied"||result.status==="expired"){setView(result.status);return;}
      }catch(e:any){if(!cancelled)setError(e?.message??"Could not check approval. Try again.");}
      if(!cancelled)window.setTimeout(poll,2500);
    };
    const timeout=window.setTimeout(poll,1800);
    return()=>{cancelled=true;window.clearTimeout(timeout);};
  },[view,waiting,request]);

  const start=async()=>{
    setBusy(true);setError("");
    try{
      const result=await request("POST",`${API}/start`,{code,deviceLabel,...(challengeId?{challengeId}:{})});
      setWaiting({requestId:result.requestId,requestToken:result.requestToken});
      setView("waiting");
    }catch(e:any){setError(e?.message??"That code couldn't be used. Check it with your parent.");}
    finally{setBusy(false);}
  };

  // The secret code is typed here, never carried in a URL. Existing nonsecret
  // challenge links remain usable, but code-only entry needs no link.
  if(view==="share")return <Under18ShareScreen
    onCode={()=>setView("entry")}
    onBack={()=>window.location.assign("/login?signup=1")}/>;
  if(view==="approved"&&session)return <ChildProfileScreen data={session.data} request={childRequest}
    onSignOut={()=>{childSkinSession.clear();setSession(null);setView("entry");setWaiting(null);setCode("");}}/>;
  return <ScreenFrame action={view==="entry"?<button className="hsy-primary" disabled={code.length!==6||busy} onClick={()=>void start()}>{busy?"Checking…":"Continue"}</button>:view==="waiting"?<button className="hsy-secondary" style={{width:"100%"}} onClick={()=>{setView("entry");setWaiting(null);setCode("");}}>Cancel</button>:<button className="hsy-primary" onClick={()=>{setView("entry");setWaiting(null);setCode("");setError("");}}>Try another code</button>}>
    <section className="hsy-content" style={{paddingTop:36}}>
      {view==="entry"?<>
        <button className="hsy-back" aria-label="Back" onClick={()=>setView("share")}><ArrowLeft size={22}/></button>
        <h1>Enter your parent's code</h1><p className="hsy-subtitle">Enter the 6-character setup code from your parent. No setup link is needed.</p>
        <label className="hsy-label" style={{textAlign:"center",marginTop:38}}>Setup code</label>
        <div className="hsy-code-grid" role="group" aria-label="Six-character setup code">{Array.from({length:6},(_,i)=><input key={i} className="hsy-code-cell" aria-label={`Code character ${i+1}`} maxLength={1} value={code[i]??""} onChange={e=>{const chars=code.padEnd(6," ").split("");chars[i]=cleanCode(e.target.value).slice(-1)||" ";setCode(cleanCode(chars.join("")));if(e.target.value&&i<5)(document.querySelector(`[aria-label="Code character ${i+2}"]`) as HTMLInputElement)?.focus();}} onKeyDown={e=>{if(e.key==="Backspace"&&!code[i]&&i>0)(document.querySelector(`[aria-label="Code character ${i}"]`) as HTMLInputElement)?.focus();}}/> )}</div>
        <label className="hsy-label" style={{marginTop:20}}>This device<input className="hsy-field" value={deviceLabel} maxLength={80} onChange={e=>setDeviceLabel(e.target.value)}/></label>
        <div className="hsy-card tint" style={{marginTop:22}}><strong>Where's the code?</strong><p className="hsy-note" style={{margin:"5px 0 0"}}>Your parent opens RosterHockey, goes to Family and child device setup, then chooses “Get setup code.”</p></div>
      </>:view==="waiting"?<><div className="hsy-card tint" style={{display:"inline-flex",padding:14,marginBottom:18}}><ShieldCheck size={24}/></div><h1>Waiting for your parent</h1><p className="hsy-subtitle">Code accepted. Your parent needs to approve this phone on their device.</p><div className="hsy-card"><strong>Request sent</strong><p className="hsy-note" style={{marginBottom:0}}>This page will update when approval is decided. The code alone does not sign you in.</p></div></>
      :<><h1>{view==="denied"?"Your parent didn't approve this phone":"This request expired"}</h1><p className="hsy-subtitle">Ask your parent for help before trying again.</p></>}
      {error&&<div role="alert" className="hsy-error" style={{marginTop:14}}>{error}</div>}
      <p className="hsy-footer-note">No parent profile, payments or coach messaging are available from this phone.</p>
    </section>
  </ScreenFrame>;
}
