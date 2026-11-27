import type { Express, Request, RequestHandler } from "express";
import { ZodError } from "zod";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { ParentSecurityError } from "./highSchoolParentSecurity";
import type { SchoolLeagueManagement } from "./schoolLeagueManagement";

export function registerSchoolLeagueManagement(app: Express, service: SchoolLeagueManagement,
  authenticate: (req: Request) => Promise<OnboardingActor>) {
  const base = "/api/high-school/leagues/:leagueId/management";
  const handle = (work: (req: Request, actor: OnboardingActor) => Promise<unknown>): RequestHandler => async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");res.setHeader("Pragma", "no-cache");
    try { res.json(await work(req, await authenticate(req)) ?? { saved: true }); }
    catch (error) {
      const known = error instanceof OnboardingError || error instanceof ParentSecurityError;
      res.status(known ? error.status : error instanceof ZodError ? 400 : 503).json({
        code: known ? error.code : error instanceof ZodError ? "INVALID_SCHOOL_LEAGUE_INPUT" : "SCHOOL_LEAGUE_UNAVAILABLE",
      });
    }
  };
  app.get(base, handle((r, a) => service.workspace(a, r.params.leagueId)));
  app.post(`${base}/programs`, handle((r, a) => service.program(a, r.params.leagueId, r.body)));
  app.post(`${base}/teams`, handle((r, a) => service.team(a, r.params.leagueId, r.body)));
  app.post(`${base}/invitations`, handle((r, a) => service.invitation(a, r.params.leagueId, r.body)));
  app.post(`${base}/staff/:id/decision`, handle((r, a) => service.staffDecision(a, r.params.leagueId, r.params.id, r.body)));
  app.post(`${base}/parents/:id/decision`, handle((r, a) => service.parentDecision(a, r.params.leagueId, r.params.id, r.body)));
  app.post(`${base}/schedule/preview`, handle((r, a) => service.schedulePreview(a, r.params.leagueId, r.body)));
  app.post(`${base}/schedule/import`, handle((r, a) => service.scheduleImport(a, r.params.leagueId, r.body)));
}
