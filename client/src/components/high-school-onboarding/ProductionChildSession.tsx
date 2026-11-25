import { useCallback, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { childSkinSession, requestChildSession } from "@/lib/highSchoolChildSession";
import { ChildProfileScreen } from "./ChildProfileScreen";

export function ProductionChildSession({token}:{token:string}) {
  useLayoutEffect(()=>{
    void queryClient.cancelQueries({predicate:q=>q.queryKey[0]!=="production-child-session"});
    queryClient.removeQueries({predicate:q=>q.queryKey[0]!=="production-child-session"});
  },[token]);
  const session=useQuery({
    queryKey:["production-child-session",childSkinSession.revision()],
    queryFn:({signal})=>requestChildSession(token,"GET","/api/high-school/child-device/session",undefined,signal),
    retry:false,gcTime:0,staleTime:0,refetchInterval:20_000,refetchOnWindowFocus:true,
  });
  const request=useCallback((method:string,path:string,body?:unknown)=>requestChildSession(token,method,path,body),[token]);
  const leave=()=>{queryClient.clear();childSkinSession.clear();window.location.assign("/under-18");};
  if(session.isError)return <main className="hsy"><div className="hsy-frame"><section className="hsy-content">
    <h1>Player access could not be verified</h1><p>Retry, or ask your parent to check your device approval and team access.</p>
    <div className="hsy-stack">
      <button className="hsy-primary" onClick={()=>void session.refetch()}>Retry player access</button>
      <button className="hsy-secondary" style={{width:"100%"}} onClick={leave}>Leave player session</button>
    </div>
  </section></div></main>;
  if(!session.data)return <main className="hsy" role="status" aria-live="polite">Checking player access…</main>;
  return <>
    {!childSkinSession.persistenceAvailable()&&<p role="alert" className="bg-background text-destructive p-4">
      This device is not saving player sign-in. Enable app storage to stay signed in after closing the app.
    </p>}
    <ChildProfileScreen data={session.data} request={request} autoRefresh={false} onSignOut={leave}/>
  </>;
}
