import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { ScreenFrame } from "./shared";

export function ProductionOnboardingTest({actorId,approvals=false}:{actorId:string;approvals?:boolean}) {
  const [,navigate]=useLocation();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const requests=useQuery<Array<{id:string;role:string;school:string}>>({
    queryKey:["production-staff-approvals",actorId],
    queryFn:async()=>(await apiRequest("GET","/api/high-school/onboarding/approvals")).json(),
    enabled:approvals,retry:false,
  });
  const decide=async(id:string,approve:boolean)=>{
    setBusy(true);setError("");
    try{await apiRequest("POST","/api/high-school/onboarding/decision",{id,approve});await requests.refetch();}
    catch{setError("The decision could not be saved. Your existing permissions have not changed.");}
    finally{setBusy(false);}
  };
  return <ScreenFrame error={error} action={<button className="hsy-secondary" style={{width:"100%"}} onClick={()=>navigate("/profile")}>Back to my account</button>}>
    <section className="hsy-content">
      <h1>{approvals?"School staff requests":"Production onboarding test"}</h1>
      <p className="hsy-subtitle">Your existing adult account and teams stay intact. School access still requires the appropriate approvals.</p>
      {approvals?<>
        {requests.isLoading&&<p role="status">Loading requests…</p>}
        {requests.isError&&<p role="alert">Requests could not be loaded. Please retry.</p>}
        {requests.data?.length===0&&<p>No requests are awaiting your approval.</p>}
        {requests.data?.map(row=><div className="hsy-card" key={row.id} style={{marginTop:12}}>
          <strong>{row.school}</strong><p>{row.role.replaceAll("_"," ")}</p>
          <div className="hsy-grid2">
            <button className="hsy-secondary" disabled={busy} onClick={()=>void decide(row.id,false)}>Deny</button>
            <button className="hsy-primary" disabled={busy} onClick={()=>void decide(row.id,true)}>Approve</button>
          </div>
        </div>)}
      </>:<div className="hsy-stack">
        <button className="hsy-primary" onClick={()=>navigate("/high-school/onboarding")}>Open onboarding</button>
        <button className="hsy-secondary" onClick={()=>navigate("/high-school/family")}>Family and child devices</button>
        <button className="hsy-secondary" onClick={()=>navigate("/high-school/onboarding/approvals")}>Review staff requests</button>
        <button className="hsy-secondary" onClick={()=>navigate("/high-school/home")}>Choose an approved school team</button>
        <p className="hsy-note">Staff approval, guardian consent and coverage are required before child pairing. Device setup uses a secure link, a separate code, and approval on a verified parent device. Purchases and test notification delivery are not enabled.</p>
      </div>}
    </section>
  </ScreenFrame>;
}
