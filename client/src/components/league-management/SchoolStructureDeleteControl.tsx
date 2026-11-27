import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SchoolLeagueActionResult, SchoolStructureDeletionPreview } from "@shared/schoolLeagueManagement";

type Props = {
  leagueId: string; kind: "program" | "team"; id: string; name: string; isPending: boolean;
  runAction: (path: string, body: unknown, success: string, done?: (result: SchoolLeagueActionResult) => void) => Promise<void>;
};
const button="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const destructive=`${button} border-destructive/40 text-destructive hover:bg-destructive/10`;

export function SchoolStructureDeleteControl(props: Props) {
  const [open,setOpen]=useState(false);
  return <div className="mt-3">
    {!open ? <button type="button" className={destructive} disabled={props.isPending}
      aria-label={`Delete ${props.kind} ${props.name}`} onClick={()=>setOpen(true)}>Delete {props.kind}</button>
      : <DeletionConfirmation {...props} onClose={()=>setOpen(false)} />}
  </div>;
}

function DeletionConfirmation({leagueId,kind,id,isPending,runAction,onClose}:Props&{onClose:()=>void}) {
  const [confirmation,setConfirmation]=useState("");
  const [failed,setFailed]=useState(false);
  const path=`/${kind}s/${encodeURIComponent(id)}`;
  const preview=useQuery<SchoolStructureDeletionPreview>({
    queryKey:["school-structure-deletion-preview",leagueId,kind,id],
    gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false,
    queryFn:async({signal})=>{
      const response=await apiRequest("GET",`/api/high-school/leagues/${encodeURIComponent(leagueId)}/management${path}/deletion-preview`,undefined,signal);
      const data=await response.json();
      if(data?.kind!==kind||data.id!==id||typeof data.name!=="string"||typeof data.programId!=="string"||
        !(data.schoolId===null||typeof data.schoolId==="string")||!Array.isArray(data.teamIds)||
        !data.teamIds.every((teamId:unknown)=>typeof teamId==="string")||data.teamCount!==data.teamIds.length)
        throw new Error("The deletion preview was incomplete. Reload it before continuing.");
      return data;
    },
  });
  const reload=()=>{setConfirmation("");setFailed(false);void preview.refetch();};
  return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    role="group" aria-label={`Confirm ${kind} deletion`}>
    <h3 className="font-semibold">Delete {kind}?</h3>
    {preview.isError ? <p role="alert" className="mt-2 text-sm text-destructive">{preview.error.message}</p>
      : preview.data ? <>
        <p role="alert" className="mt-2 text-sm">
          {kind==="program"
            ? <><strong>{preview.data.name}</strong> and all {preview.data.teamCount} linked {preview.data.teamCount===1?"team":"teams"} will be deleted. The school and other programs will remain.</>
            : <><strong>{preview.data.name}</strong> will be deleted. Only this team is affected; its school, program and other teams will remain.</>}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Affected team memberships and access will be removed. Player and child accounts, child logins, private parent-child chats and historical records are retained.</p>
        <label className="mt-3 block text-sm">
          Type <strong>{preview.data.name}</strong> to confirm.
          <input autoFocus aria-label={`Type ${kind} name to confirm deletion`} autoComplete="off"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={isPending}/>
        </label>
        {failed&&<p role="alert" className="mt-2 text-sm text-destructive">Deletion was not completed. Reload the preview and confirm again.</p>}
      </> : <p className="mt-2 text-sm text-muted-foreground" role="status">Loading the current deletion preview…</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={destructive} disabled={isPending||preview.isFetching||preview.isError||!preview.data||confirmation!==preview.data.name}
        onClick={async()=>{
          const data=preview.data;if(!data)return;
          let saved=false;setFailed(false);
          await runAction(`${path}/delete`,{expectedName:data.name,schoolId:data.schoolId,
            programId:data.programId,teamIds:data.teamIds,confirmation},
          kind==="program"?"Program and its teams deleted.":"Team deleted.",()=>{saved=true;onClose();});
          if(!saved)setFailed(true);
        }}>{kind==="program"?"Delete program and teams":"Delete team"}</button>
      <button type="button" className={button} disabled={isPending||preview.isFetching} onClick={reload}>Reload preview</button>
      <button type="button" className={button} disabled={isPending} onClick={onClose}>Cancel</button>
    </div>
  </div>;
}
