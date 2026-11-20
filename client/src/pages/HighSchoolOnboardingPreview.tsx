import { useMemo, useState } from "react";
import HighSchoolOnboarding from "./HighSchoolOnboarding";
import { hsChoosePath,hsSaveDraft } from "@shared/highSchoolOnboarding";

/** DEV visual review only: no fetch, Auth calls, storage, grants or records. */
export default function HighSchoolOnboardingPreview(){
  const [revision,setRevision]=useState(0);
  return <><nav aria-label="Preview navigation" className="mx-auto max-w-2xl px-4 pt-5">
    <button type="button" className="rounded-lg border px-4 py-3" onClick={()=>setRevision(r=>r+1)}>Choose another path</button>
    <p className="mt-2 text-xs text-muted-foreground">Restarts this demonstration only. No account or saved onboarding is changed.</p>
  </nav><PreviewFlow key={revision}/></>;
}
function PreviewFlow(){
  const request=useMemo(()=>{
    let state:any={active:true,path:null,revision:0,status:"choose"};
    const leagueId="00000000-0000-4000-8000-000000000001",programId="00000000-0000-4000-8000-000000000002",teamId="00000000-0000-4000-8000-000000000003";
    return async(method:string,url:string,body?:any)=>{
      const pathname=url.split("?")[0];
      if(method==="GET"&&pathname.endsWith("/state"))return structuredClone(state);
      if(method==="GET"&&pathname.endsWith("/catalog"))return {leagues:[{id:leagueId,name:"Preview League"}],
        programs:[{id:programId,name:"Preview High School",town:"Sample Town",teams:[{id:teamId,name:"Varsity"}]}]};
      if(method==="GET"&&pathname.endsWith("/approvals"))return [];
      if(method==="POST"&&pathname.endsWith("/choose")){
        const {path}=hsChoosePath.parse(body);
        state={...state,path,status:path==="parent"?"parent_verification_required":"draft"};
        return {saved:false,preview:true};
      }
      if(method==="POST"&&pathname.endsWith("/preview-checkpoint")&&state.path==="parent"){
        state={...state,status:"draft",draft:{},revision:state.revision+1};
        return {saved:false,preview:true};
      }
      if(method==="POST"&&pathname.endsWith("/draft")){
        const data=hsSaveDraft.parse(body);
        state={...state,revision:state.revision+1,draft:data,
          status:data.kind==="staff"?"waiting_approval":"draft"};
        return {saved:false,preview:true};
      }
      if(method==="POST"&&pathname.endsWith("/join")&&state.path==="parent"&&state.draft?.guardianConfirmed){
        if(body.teamCode!=="PREVIEW")throw {code:"INVALID_TEAM_CODE"};
        state={...state,status:"waiting_staff_review",revision:state.revision+1};
        return {saved:false,preview:true};
      }
      throw {code:"PREVIEW_OPERATION_UNAVAILABLE"};
    };
  },[]);
  return <HighSchoolOnboarding preview request={request}/>;
}
