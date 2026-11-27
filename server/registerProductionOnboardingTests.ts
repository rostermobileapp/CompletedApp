import type { Express, Request } from "express";
import type { ParentSql, HighSchoolParentSecurity } from "./highSchoolParentSecurity";
import { ParentSecurityError } from "./highSchoolParentSecurity";
import { HighSchoolOnboarding, type OnboardingActor } from "./highSchoolOnboarding";
import { HighSchoolYouthOnboarding } from "./highSchoolYouthOnboarding";
import { HighSchoolChildDevices } from "./highSchoolChildDevices";
import { HighSchoolStaffOperations } from "./highSchoolStaffOperations";
import { SchoolLeagueManagement } from "./schoolLeagueManagement";
import { registerSchoolLeagueManagement } from "./schoolLeagueManagementHttp";
import { HighSchoolStaffEvents } from "./highSchoolStaffEvents";
import { HighSchoolStaffChat } from "./highSchoolStaffChat";
import { TeamSkinService } from "./teamSkinService";
import { registerHighSchoolOnboarding } from "./highSchoolOnboardingHttp";
import { registerHighSchoolYouthRoutes } from "./highSchoolYouthHttp";
import { registerHighSchoolStaffRoutes } from "./highSchoolStaffHttp";
import { SchoolEligibilityAlerts } from "./schoolEligibilityAlerts";
import { registerTeamSkinRoutes } from "./teamSkinHttp";
import { productionOnboardingTester, productionOnboardingTestsInstalled, requireProductionOnboardingTester, syncProductionSchoolLeagues } from "./productionOnboardingTests";

export async function registerProductionOnboardingTests(
  app: Express, pool: ParentSql, parent: HighSchoolParentSecurity,
  authenticate: (request: Request) => Promise<OnboardingActor>,
  adultTeams: (authId: string) => Promise<{id:string}[]>,
  coverage: (parentId: string, leagueId: string) => Promise<boolean>,
) {
  app.get("/api/high-school/test-access",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    try{
      const actor=await authenticate(req);
      res.json({enabled:await productionOnboardingTestsInstalled(pool)&&await productionOnboardingTester(pool,actor)});
    }catch(error){res.status(error instanceof ParentSecurityError?error.status:503).json({code:"ONBOARDING_TEST_ACCESS_UNAVAILABLE"});}
  });
  if(!await productionOnboardingTestsInstalled(pool))return;
  const authenticateTester=async(req:Request)=>{
    const actor=await authenticate(req);
    if(!await productionOnboardingTestsInstalled(pool))throw new ParentSecurityError("ONBOARDING_TESTS_DISABLED",403);
    await requireProductionOnboardingTester(pool,actor);
    if(req.path.endsWith("/catalog")||req.path.endsWith("/approvals")||req.path.endsWith("/decision"))
      await syncProductionSchoolLeagues(pool);
    return {...actor,productionTest:true};
  };
  const intake=new HighSchoolOnboarding(pool,parent);
  const youth=new HighSchoolYouthOnboarding(pool,parent,intake);
  const child=new HighSchoolChildDevices(pool,parent,true,{production:true,coverage});
  // Real storage and permissions, but no subscription changes or pretend
  // notification delivery. The test rollout cannot charge anyone.
  const staff=new HighSchoolStaffOperations(pool,async()=>false,undefined,true);
  const events=new HighSchoolStaffEvents(pool,async()=>false,async()=>{throw Error("TEST_NOTIFICATION_DELIVERY_DISABLED");},true);
  const chat=new HighSchoolStaffChat(pool,async()=>false,undefined,true);
  intake.staffDecisions=staff;
  registerSchoolLeagueManagement(app,new SchoolLeagueManagement(pool,true),authenticateTester);
  registerHighSchoolOnboarding(app,intake,parent,authenticateTester,(actor,grant)=>youth.state(actor,grant));
  registerHighSchoolYouthRoutes(app,youth,child,authenticateTester,true);
  registerHighSchoolStaffRoutes(app,staff,events,chat,parent,authenticateTester,true,new SchoolEligibilityAlerts(pool,true));
  registerTeamSkinRoutes(app,new TeamSkinService(pool,adultTeams),parent,child,authenticateTester,true);
}
