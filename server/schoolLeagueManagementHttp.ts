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
      const duplicate = (error as { code?: string })?.code === "23505";
      res.status(known ? error.status : duplicate ? 409 : error instanceof ZodError ? 400 : 503).json({
        code: known ? error.code : duplicate ? "PROGRAM_ALREADY_EXISTS_FOR_SCHOOL" : error instanceof ZodError ? "INVALID_SCHOOL_LEAGUE_INPUT" : "SCHOOL_LEAGUE_UNAVAILABLE",
        ...(error instanceof OnboardingError && error.code === "SCHOOL_STRUCTURE_UPDATE_REQUIRED" ? {
          message: "The school and program database update has not been installed. Existing teams and permissions are unchanged.",
        } : {}),
      });
    }
  };
  app.get(base, handle((r, a) => service.workspace(a, r.params.leagueId)));
  app.get(`${base}/eligibility`, handle((r, a) => service.eligibility(a, r.params.leagueId)));
  app.post(`${base}/eligibility/:teamId/:playerId`, handle((r, a) =>
    service.setEligibility(a, r.params.leagueId, r.params.teamId, r.params.playerId, r.body)));
  app.post(`${base}/schools`, handle((r, a) => service.school(a, r.params.leagueId, r.body)));
  app.post(`${base}/programs`, handle((r, a) => service.program(a, r.params.leagueId, r.body)));
  app.post(`${base}/programs/:id`, handle((r, a) => service.updateProgram(a, r.params.leagueId, r.params.id, r.body)));
  app.post(`${base}/teams`, handle((r, a) => service.team(a, r.params.leagueId, r.body)));
  app.post(`${base}/invitations`, handle((r, a) => service.invitation(a, r.params.leagueId, r.body)));
  app.post(`${base}/staff/:id/decision`, handle((r, a) => service.staffDecision(a, r.params.leagueId, r.params.id, r.body)));
  app.post(`${base}/parents/:id/decision`, handle((r, a) => service.parentDecision(a, r.params.leagueId, r.params.id, r.body)));
  app.post(`${base}/schedule/preview`, handle((r, a) => service.schedulePreview(a, r.params.leagueId, r.body)));
  app.post(`${base}/schedule/import`, handle((r, a) => service.scheduleImport(a, r.params.leagueId, r.body)));
}
