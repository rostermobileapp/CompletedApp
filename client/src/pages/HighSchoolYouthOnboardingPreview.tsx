import { useMemo, useState } from "react";
import { HS_CONSENT_VERSION, hsChoosePath, hsSaveDraft, hsTeamEntry } from "@shared/highSchoolOnboarding";
import { hsHockeyType, hsJourneyInput, hsLeagueDraftInput, validateHsLeagueDraft } from "@shared/highSchoolYouthOnboarding";
import HighSchoolYouthOnboarding, { type RequestFn } from "./HighSchoolYouthOnboarding";
import Under18Onboarding from "./Under18Onboarding";
import { AgeConfirmationScreen } from "@/components/high-school-onboarding/AgeConfirmationScreen";
import { Under18ShareScreen } from "@/components/high-school-onboarding/Under18ShareScreen";
import { SignupFlowPreview } from "./Login";

const makeMemoryAdapter=():RequestFn=>{
  let state:any={active:true,path:null,revision:1,status:"choose",draft:{role:null,programId:null,teamId:null,players:[],guardianConfirmed:false,imported:false},journey:{}};
  let league:any={stage:"details",details:{name:"",state:"",season:""},schools:[],schedule:[],invitations:[]};
  let childRequest=false;let parentApproved=false;
  const childMessages=new Map<string,Array<{id:string;body:string;sender:string;createdAt:string}>>();
  let matchedInvitation="";
  let stagedPlayerIds:string[]=[];
  let consentedPlayerIds=new Set<string>();
  return async(method,path,body:any)=>{
    if(method==="GET"&&path.endsWith("/state"))return structuredClone(state);
    if(method==="GET"&&path.endsWith("/referral-partners"))return [{id:"00000000-0000-4000-8000-000000000001",orgName:"Preview Hockey Association"}];
    if(method==="GET"&&path.includes("/catalog"))return {programs:[
      {id:"00000000-0000-4000-8000-000000000010",name:"Northfield High School",town:"Northfield",teams:[{id:"00000000-0000-4000-8000-000000000011",name:"Varsity 2026–27",season:"2026–27"},{id:"00000000-0000-4000-8000-000000000012",name:"JV 2026–27",season:"2026–27",headCoach:"Assigned"}]},
      {id:"00000000-0000-4000-8000-000000000020",name:"Northbrook Regional",town:"Northbrook",teams:[{id:"00000000-0000-4000-8000-000000000021",name:"Varsity 2026–27"}]},
    ],leagues:[{id:"00000000-0000-4000-8000-000000000030",name:"Preview High School Hockey"}]};
    if(method==="GET"&&path.endsWith("/league-draft"))return {...structuredClone(league),revision:state.revision,status:"draft",seats:{allocated:0,total:0},price:"[Price]"};
    if(method==="GET"&&path.endsWith("/children"))return {children:[],activationAvailable:false};
    if(method==="GET"&&path.endsWith("/device-requests"))return {requests:[]};
    if(method==="POST"&&path.endsWith("/hockey-type")){const data=hsHockeyType.parse(body);state.hockeyType=data.hockeyType;return {saved:true,hockeyType:data.hockeyType};}
    if(method==="POST"&&path.endsWith("/choose")){const data=hsChoosePath.parse(body);state.path=data.path;state.status="draft";state.draft={...state.draft,role:null};state.revision++;return structuredClone(state);}
    if(method==="POST"&&path.endsWith("/journey")){
      const data=hsJourneyInput.parse(body);if(data.revision!==state.revision)throw new Error("DRAFT_CONFLICT");
      state.journey={...state.journey,...data};state.revision++;
      return {saved:true,journey:structuredClone(state.journey),revision:state.revision};
    }
    if(method==="POST"&&path.endsWith("/draft")){
      const data=hsSaveDraft.parse(body);if(data.revision!==state.revision)throw new Error("DRAFT_CONFLICT");
      if(data.kind==="parent"){
        if(state.draft.imported&&(data.players.length!==stagedPlayerIds.length||data.players.some(p=>!stagedPlayerIds.includes(p.id))))throw new Error("INVITATION_PLAYER_MISMATCH");
        consentedPlayerIds=new Set(data.players.map(p=>p.id));
      }
      const role="role" in data?data.role:state.draft.role;
      state.revision++;state.draft={...state.draft,...data,role};
      if(data.kind==="staff"){state.status="waiting_approval";state.draft.programId=data.programId;state.draft.teamId=data.teamId;}
      return structuredClone(state);
    }
    if(method==="POST"&&path.endsWith("/lookup")){
      if(body.revision!==state.revision)throw new Error("DRAFT_CONFLICT");
      if(body.invitation!=="preview-parent-invitation-abcdef123456")throw new Error("INVALID_INVITATION");
      matchedInvitation=body.invitation;consentedPlayerIds=new Set();
      const players=[
        {id:"00000000-0000-4000-8000-000000000081",firstName:"Imported",lastName:"Forward",gradYear:2028,position:"F",jerseyNumber:"12"},
        {id:"00000000-0000-4000-8000-000000000082",firstName:"Imported",lastName:"Goalie",gradYear:2029,position:"G",jerseyNumber:"30"},
      ].map(player=>({...player,consent:false,photoConsent:false,publicNameConsent:false,consentVersion:HS_CONSENT_VERSION}));
      stagedPlayerIds=players.map(p=>p.id);
      state.draft={players,guardianConfirmed:false,imported:true,teamId:"00000000-0000-4000-8000-000000000011"};
      state.revision++;
      return {matched:true};
    }
    if(method==="POST"&&path.endsWith("/join")){
      const data=hsTeamEntry.parse(body);if(data.revision!==state.revision)throw new Error("DRAFT_CONFLICT");
      const draft=hsSaveDraft.parse({kind:"parent",revision:state.revision,guardianConfirmed:state.draft.guardianConfirmed,players:state.draft.players});
      if(draft.kind!=="parent"||draft.players.some(p=>!consentedPlayerIds.has(p.id)))throw new Error("PLAYER_CONSENT_REQUIRED");
      if(state.draft.imported&&data.invitation!==matchedInvitation)throw new Error("INVITATION_REQUIRED");
      if(data.invitation&&(!state.draft.imported||data.invitation!==matchedInvitation))throw new Error("LOOK_UP_INVITATION_FIRST");
      state.status=data.invitation?"coverage_pending":"waiting_staff_review";state.revision++;return structuredClone(state);
    }
    if(method==="POST"&&path.endsWith("/league-draft")){
      const data=hsLeagueDraftInput.parse(body);if(data.revision!==state.revision)throw new Error("DRAFT_CONFLICT");
      league=validateHsLeagueDraft(league,data);state.revision++;
      return {...structuredClone(league),revision:state.revision,status:"draft",activated:false,invitationsSent:0,price:"[Price]"};
    }
    if(method==="POST"&&path.endsWith("/device-codes"))throw Object.assign(new Error("Child setup codes are not enabled in this simulation."),{code:"CHILD_ACTIVATION_PENDING"});
    if(method==="POST"&&path.endsWith("/start")){
      if(body?.challengeId!=="preview-challenge"||!/^[A-HJ-NP-Z2-9]{6}$/.test(body?.code??""))throw new Error("Invalid preview pairing challenge.");
      childRequest=true;parentApproved=false;return {requestId:"preview-request",requestToken:"preview-request-token",expiresAt:new Date(Date.now()+600000).toISOString(),status:"waiting"};
    }
    if(method==="POST"&&path.endsWith("/poll"))return parentApproved?{status:"approved",sessionToken:"preview-child-session"}:{status:"waiting"};
    if(method==="POST"&&path==="/preview-approve"){
      if(!childRequest)throw new Error("Start a simulated child request before parent approval.");
      parentApproved=true;return {status:"simulation_only"};
    }
    if(method==="GET"&&path.endsWith("/session")){
      if(body?.sessionToken!=="preview-child-session"||!parentApproved)throw new Error("The simulated parent device has not approved this request.");
      return {child:{id:"00000000-0000-4000-8000-000000000099",firstName:"Preview",lastName:"Player"},schedule:[{id:"preview-game-1",startsAt:"2026-12-04T19:00:00-05:00",title:"Preview Varsity",location:"Preview Ice Center"}],chats:[{id:"00000000-0000-4000-8000-000000000097",kind:"team",name:"Preview team chat"},{id:"00000000-0000-4000-8000-000000000098",kind:"family",name:"Preview family chat"}]};
    }
    if(/^\/api\/high-school\/child-device\/chats\/00000000-0000-4000-8000-00000000009[78]\/messages$/.test(path)){
      if(body?.sessionToken!=="preview-child-session"||!parentApproved)throw new Error("The simulated parent has not approved this request.");
      const messages=childMessages.get(path)??[];
      if(method==="POST"){if(!body?.body?.trim())throw new Error("A message is required.");messages.push({id:crypto.randomUUID(),body:body.body,sender:"You",createdAt:new Date().toISOString()});childMessages.set(path,messages);return {saved:true};}
      if(method==="GET")return {messages:structuredClone(messages)};
    }
    throw new Error(`Preview adapter has no simulated operation for ${method} ${path}.`);
  };
};

export default function HighSchoolYouthOnboardingPreview({startAtSignup=false}:{startAtSignup?:boolean}={}) {
  const startsFromSignup=startAtSignup||new URLSearchParams(window.location.search).get("screen")==="signup";
  const request=useMemo(()=>makeMemoryAdapter(),[]);
  const [childDemo,setChildDemo]=useState(false);
  const [previewMessage,setPreviewMessage]=useState("");
  const [agePreview,setAgePreview]=useState(new URLSearchParams(window.location.search).get("screen")==="age");
  const [ageAnswer,setAgeAnswer]=useState<boolean|null>(null);
  const [under18Preview,setUnder18Preview]=useState(false);
  const [signupPreview,setSignupPreview]=useState(startsFromSignup);
  if(under18Preview)return <Under18ShareScreen onBack={()=>{setUnder18Preview(false);if(startsFromSignup)setSignupPreview(true);}}
    onCode={()=>{setUnder18Preview(false);setAgePreview(false);setChildDemo(true);}}/>;
  if(signupPreview)return <><div style={{position:"fixed",top:12,left:0,right:0,zIndex:100,textAlign:"center",pointerEvents:"none",font:"500 12px Inter, sans-serif",color:"#64748b"}}>PREVIEW ONLY · No account will be created</div>
    <SignupFlowPreview onComplete={adult=>{setSignupPreview(false);if(!adult)setUnder18Preview(true);}}/></>;
  if(agePreview)return <AgeConfirmationScreen value={ageAnswer} onChange={setAgeAnswer}
    onBack={()=>window.location.assign("/login?signup=1")}
    onContinue={()=>{if(ageAnswer===false)setUnder18Preview(true);else if(ageAnswer===true)setAgePreview(false);}}/>;
  return <div>
    <aside style={{position:"sticky",top:0,zIndex:20,background:"#7c2d12",color:"#fff",padding:"10px 16px",font:"600 13px/1.4 Inter,system-ui,sans-serif",textAlign:"center"}}>
      SIMULATION ONLY · Memory-only preview. No API, auth, browser storage, real family information, approval, or security proof.
      <button style={{display:"block",margin:"6px auto 0",border:"1px solid #fff8",borderRadius:8,padding:"6px 12px",background:"#fff",color:"#7c2d12",fontWeight:700,cursor:"pointer"}} onClick={()=>setChildDemo(v=>!v)}>{childDemo?"Back to family / staff demo":"Open child-phone role demo"}</button>
      {childDemo&&<button style={{display:"block",margin:"6px auto 0",border:"1px solid #fff8",borderRadius:8,padding:"6px 12px",background:"#fff",color:"#7c2d12",fontWeight:700,cursor:"pointer"}} onClick={()=>void request("POST","/preview-approve",{}).then(()=>setPreviewMessage("Parent device approved this simulation only. No real child session or access was granted.")).catch(e=>setPreviewMessage(e.message))}>Simulate approval on parent phone</button>}
      {previewMessage&&<p role="status" style={{margin:"8px 0 0"}}>{previewMessage}</p>}
    </aside>
    {childDemo?<Under18Onboarding request={request} initialView="code" challengeId="preview-challenge"/>:<HighSchoolYouthOnboarding request={request} authenticated preview/>}
  </div>;
}
