import type { Express, Request } from "express";
import { ZodError } from "zod";
import { HighSchoolOnboarding, OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { HighSchoolParentSecurity, ParentSecurityError } from "./highSchoolParentSecurity";
import { parentGrantHeader } from "./highSchoolParentHttp";

export const HS_ONBOARDING_API = "/api/high-school/onboarding";
export function registerHighSchoolOnboarding(
  app: Express, service: HighSchoolOnboarding, _parent: HighSchoolParentSecurity,
  authenticate: (req: Request) => Promise<OnboardingActor>,
  state?: (actor: OnboardingActor, grant?: string) => Promise<unknown>,
) {
  const handler = (work: (req: Request, actor: OnboardingActor) => Promise<unknown>) =>
    async (req: Request, res: any) => {
      res.setHeader("Cache-Control","no-store");
      try {
        const actor=await authenticate(req);
        // Parent intake methods validate the persisted parent flow and proof
        // themselves. Staff and league-admin work must not inherit Family gates.
        const result=await work(req,actor);
        res.json(result??{saved:true});
      } catch(e) {
        const known=e instanceof OnboardingError || e instanceof ParentSecurityError;
        const duplicate=(e as any)?.code==="23505";
        res.status(known?e.status:e instanceof ZodError?400:duplicate?409:503)
          .json({code:known?e.code:e instanceof ZodError?"INVALID_ONBOARDING_INPUT":duplicate?"CONFLICT_RELOAD":"ONBOARDING_UNAVAILABLE"});
      }
    };
  app.get(`${HS_ONBOARDING_API}/state`,handler((req,a)=>(state??service.state.bind(service))(a,req.get(parentGrantHeader))));
  app.post(`${HS_ONBOARDING_API}/choose`,handler((req,a)=>service.choose(a,req.body)));
  app.get(`${HS_ONBOARDING_API}/catalog`,handler((req,a)=>service.catalog(a,String(req.query.q??""))));
  app.post(`${HS_ONBOARDING_API}/draft`,handler((req,a)=>service.save(a,req.body,req.get(parentGrantHeader))));
  app.post(`${HS_ONBOARDING_API}/lookup`,handler((req,a)=>service.lookup(a,req.body?.invitation,req.body?.revision,req.get(parentGrantHeader))));
  app.post(`${HS_ONBOARDING_API}/join`,handler((req,a)=>service.join(a,req.body,req.get(parentGrantHeader))));
  app.get(`${HS_ONBOARDING_API}/approvals`,handler((_req,a)=>service.approvals(a)));
  app.post(`${HS_ONBOARDING_API}/decision`,handler((req,a)=>service.decide(a,req.body?.id,req.body?.approve)));
}
