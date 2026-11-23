import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { screens } from "./catalog";
import { SignupFlowPreview } from "@/pages/Login";
import { AuthModal } from "@/components/AuthModal";
import { EmailVerificationModal } from "@/components/EmailVerificationModal";
import AdultProfile from "@/pages/Onboarding";
import Questionnaire from "@/pages/OnboardingQuestionnaire";
import ParentVerification from "@/pages/ParentVerification";
import Under18Onboarding from "@/pages/Under18Onboarding";
import HighSchoolYouthOnboarding from "@/pages/HighSchoolYouthOnboarding";
import * as Entry from "@/components/high-school-onboarding/EntryScreens";
import * as Parent from "@/components/high-school-onboarding/ParentScreens";
import * as Staff from "@/components/high-school-onboarding/StaffScreens";
import * as League from "@/components/high-school-onboarding/LeagueScreens";
import { AgeConfirmationScreen } from "@/components/high-school-onboarding/AgeConfirmationScreen";
import { ProfileScreen } from "@/components/high-school-onboarding/ProfileScreen";
import { ReferralScreen } from "@/components/high-school-onboarding/ReferralScreen";
import { StaffSchoolRequestScreen } from "@/components/high-school-onboarding/StaffSchoolRequestScreen";
import { ChildProfileScreen } from "@/components/high-school-onboarding/ChildProfileScreen";
import { Under18ShareScreen } from "@/components/high-school-onboarding/Under18ShareScreen";
import { HS_CONSENT_VERSION } from "@shared/highSchoolOnboarding";

const noop=()=>{};
const player={id:"00000000-0000-4000-8000-000000000081",firstName:"Sample",lastName:"Player",gradYear:2028,position:"F",jerseyNumber:"12",consent:false,consentVersion:HS_CONSENT_VERSION,photoConsent:false,publicNameConsent:false};
const schools=[{id:"school-1",name:"Example High School",town:"Example Town",teams:[{id:"team-1",name:"Varsity 2026–27",season:"2026–27"},{id:"team-2",name:"JV 2026–27",season:"2026–27",headCoach:"Assigned"}]}];
const childData={child:{firstName:"Sample",lastName:"Player"},schedule:[{id:"game-1",title:"Example Varsity vs Sample High",startsAt:"2026-12-04T19:00:00-05:00",location:"Example Ice Center"}],chats:[{id:"team-chat",name:"Example team chat",kind:"team"},{id:"family-chat",name:"Example family chat",kind:"family"}]};
const draft={details:{name:"Example High School Hockey",state:"MA",season:"2026–27"},schools:[],schedule:[],invitations:[]};
const savedState=(parent:boolean)=>async(_method:string,route:string)=>route.endsWith("/referral-partners")?[]:{
  active:true,path:parent?"parent":"player",hockeyType:parent?"high_school_youth":"adult",
  revision:1,status:parent?"parent_verification_required":"draft",draft:{players:[]},journey:{},
};
const AdultSetupReady=()=> <HighSchoolYouthOnboarding request={savedState(false)} onAdult={noop}/>;
const ParentAuthorityRequired=()=> <HighSchoolYouthOnboarding request={savedState(true)}/>;
const components:Record<string,any>={...Entry,...Parent,...Staff,...League,SignupFlowPreview,AuthModal,EmailVerificationModal,AdultProfile,Questionnaire,ParentVerification,Under18Onboarding,AgeConfirmationScreen,ProfileScreen,ReferralScreen,StaffSchoolRequestScreen,ChildProfileScreen,Under18ShareScreen,AdultSetupReady,ParentAuthorityRequired};
const base:any={onBack:noop,onContinue:noop,busy:false,update:noop,onChange:noop,onSignup:noop,onUnder18:noop,onComplete:noop,onSkip:noop,onOpenChange:noop,onVerificationSuccess:noop,onRefresh:noop,onRetry:noop,onReset:noop};
const props:Record<string,any>={
  SignupFlowPreview:{onComplete:noop},
  AuthModal:{open:true},
  EmailVerificationModal:{open:true,email:"parent@example.invalid"},
  HockeyTypeScreen:{value:"",setValue:noop},
  AdultRoleScreen:{value:"",setValue:noop},
  HighSchoolRoleScreen:{value:"",setValue:noop},
  ReferralScreen:{partners:[{id:"association-1",orgName:"Example Hockey Association"}],partnerId:"",source:"",otherSource:"",onPartner:noop,onSource:noop,onOther:noop},
  ProfileScreen:{profile:{firstName:"",lastName:"",timezone:""}},
  StaffRoleScreen:{role:"head_coach",setRole:noop},
  FindSchoolScreen:{search:"",setSearch:noop,programs:schools,selectedProgram:"",selectProgram:noop,onAddSchool:noop},
  StaffSchoolRequestScreen:{value:{name:"",town:"",leagueId:""},leagues:[{id:"league-1",name:"Example School League"}],onSubmit:noop},
  PickTeamScreen:{program:schools[0],teamId:"",setTeamId:noop,roleName:"Head Coach"},
  StaffWaitingScreen:{status:"waiting_approval",programName:schools[0].name,teamName:"Varsity 2026–27",roleName:"Head Coach"},
  AddPlayersScreen:{players:[player],add:noop,remove:noop},
  ConsentScreen:{player,index:0,total:2,guardian:false,setGuardian:noop},
  JoinTeamScreen:{players:[{...player,consent:true}],entry:"",setEntry:noop,onLookup:noop,onJoin:noop,imported:false,dirty:false},
  ParentAllSetScreen:{players:[player],children:[],activationAvailable:false,onCode:noop,onRequests:noop},
  SetupCodeScreen:{child:{firstName:"Sample",lastName:"Player"},code:"ABCDEF",expiresAt:new Date(Date.now()+600000).toISOString(),onNew:noop,onShare:noop},
  ParentDeviceRequestsScreen:{requests:[{id:"fixture-request",childId:player.id,childFirstName:"Sample",firstName:"Sample",deviceLabel:"Example phone",status:"pending",createdAt:new Date().toISOString()}],decide:noop},
  Under18ShareScreen:{onCode:noop},
  Under18Onboarding:{initialView:"code",challengeId:"pdf-fixture-not-real",request:async()=>({status:"waiting"})},
  ChildProfileScreen:{data:childData,request:async()=>({messages:[{id:"m1",sender:"Example teammate",body:"See you at practice!",createdAt:new Date().toISOString()}]})},
  LeagueDetailsScreen:{details:{name:"",state:"",season:""}},
  LeagueSchoolsScreen:{schools:[]},
  LeagueScheduleScreen:{schedule:[],schools:[]},
  LeagueInvitesScreen:{schools:[],invitations:[]},
  LeagueDraftHomeScreen:{draft},
};
export function ReviewScreen(){
  const query=new URLSearchParams(window.location.search);
  const spec=screens.find(screen=>screen.id===query.get("id"));
  if(!spec)return <h1>Unknown review screen</h1>;
  const extra:any={};
  if(spec.component==="StaffWaitingScreen"&&spec.params?.status)extra.status=spec.params.status;
  if(spec.component==="ParentVerification"){
    extra.unavailable=spec.params?.guard==="unavailable";
    extra.enrolled=spec.params?.guard!=="not-enrolled";
    extra.authenticated=spec.params?.guard!=="signed-out";
  }
  if(spec.component==="Under18Onboarding"&&spec.params?.challenge==="missing")extra.challengeId="";
  return <QueryClientProvider client={queryClient}>{React.createElement(components[spec.component],{...base,...props[spec.component],...extra})}</QueryClientProvider>;
}
