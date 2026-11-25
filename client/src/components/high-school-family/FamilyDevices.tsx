import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const base="/api/high-school/onboarding";
export function FamilyDevices({actorId}:{actorId:string}) {
  const [code,setCode]=useState<{code:string;challengeId:string;expiresAt:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const children=useQuery<{children:Array<{id:string;firstName:string;lastName:string;canActivate?:boolean}>}>({
    queryKey:["family-device-children",actorId],
    queryFn:async()=>(await apiRequest("GET",`${base}/children`)).json(),retry:false,
  });
  const requests=useQuery<{requests:Array<{id:string;firstName:string;deviceLabel:string}>}>({
    queryKey:["family-device-requests",actorId],
    queryFn:async()=>(await apiRequest("GET",`${base}/device-requests`)).json(),retry:false,refetchInterval:10_000,
  });
  const act=async(work:()=>Promise<void>)=>{
    setBusy(true);setError("");setNotice("");
    try{await work();}
    catch{setError("Device setup could not be completed. Check parent verification, team approval and Player Pro coverage, then retry.");}
    finally{setBusy(false);}
  };
  const link=code?`${window.location.origin}/under-18/code?challengeId=${encodeURIComponent(code.challengeId)}`:"";
  return <section className="family-panel" style={{marginTop:18}} aria-label="Child device setup">
    <h2>Child device setup</h2>
    <p className="hsy-note">An approved team, guardian consent and Player Pro coverage are required. Each phone needs your approval.</p>
    {(children.isLoading||requests.isLoading)&&<p role="status">Checking child devices…</p>}
    {(children.isError||requests.isError)&&<p role="alert">Device access could not be checked. Verify your parent session and refresh.</p>}
    {children.data?.children.length===0&&<p className="hsy-note">A child will appear here after team staff approves their request.</p>}
    {children.data?.children.map(child=><div className="hsy-card" key={child.id} style={{marginTop:12}} role="group" aria-label={`${child.firstName} ${child.lastName} device controls`}>
      <strong>{child.firstName} {child.lastName}</strong>
      {!child.canActivate&&<p className="hsy-note">Waiting for approved team membership and coverage.</p>}
      <div className="hsy-stack" style={{marginTop:10}}>
        <button className="hsy-primary" disabled={busy||!child.canActivate} aria-label={`Get setup code for ${child.firstName}`} onClick={()=>void act(async()=>{
          const response=await apiRequest("POST",`${base}/device-codes`,{childId:child.id});
          setCode(await response.json());
        })}>Get setup code</button>
        <button className="hsy-secondary" disabled={busy} aria-label={`Sign out ${child.firstName}'s devices`} onClick={()=>void act(async()=>{
          await apiRequest("POST",`${base}/children/${encodeURIComponent(child.id)}/revoke`,{});
          setCode(null);setNotice("This child's device sessions and pending setup codes were revoked.");
        })}>Sign out child devices</button>
      </div>
    </div>)}
    {code&&<div className="hsy-card tint" style={{marginTop:14}}>
      <strong>Setup code</strong><p style={{fontSize:28,letterSpacing:5,fontWeight:750}} aria-label={`Child setup code: ${code.code}`}>{code.code}</p>
      <p className="hsy-note">Expires <time dateTime={code.expiresAt}>{new Date(code.expiresAt).toLocaleTimeString()}</time>. Share the setup link, then give your child this code separately. You will still approve their phone here.</p>
      <label className="hsy-label">Secure setup link<input className="hsy-field" readOnly value={link} onFocus={event=>event.currentTarget.select()}/></label>
      <button className="hsy-secondary" style={{width:"100%",marginTop:10}} onClick={()=>void act(async()=>{await navigator.clipboard.writeText(link);setNotice("Setup link copied. The code is not included in the link.");})}>Copy setup link</button>
    </div>}
    {requests.data?.requests.map(request=><div className="hsy-card tint" key={request.id} style={{marginTop:14}}>
      <strong>Approve {request.firstName}'s phone?</strong><p className="hsy-note">{request.deviceLabel}</p>
      <p className="hsy-note">Approval opens only this child's profile, covered team schedules and approved Team/Family chats—not your adult account, payments or coach messages.</p>
      <div className="hsy-grid2">{[false,true].map(approve=><button key={String(approve)} className={approve?"hsy-primary":"hsy-secondary"} disabled={busy} aria-label={`${approve?"Approve":"Deny"} ${request.firstName}'s phone`}
        onClick={()=>void act(async()=>{await apiRequest("POST",`${base}/device-requests/${encodeURIComponent(request.id)}/decision`,{approve});
          setCode(null);await requests.refetch();setNotice(approve?"Phone approved. The child's device will finish signing in.":"Phone request denied.");})}>{approve?"Approve":"Deny"}</button>)}</div>
    </div>)}
    {error&&<p role="alert" className="hsy-error">{error}</p>}
    {notice&&<p role="status" className="hsy-success">{notice}</p>}
  </section>;
}
