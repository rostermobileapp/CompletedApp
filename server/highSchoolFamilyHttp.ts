import type { Express, Request, RequestHandler } from "express";
import { ZodError } from "zod";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { isParentSecurityDevelopment, ParentSecurityError, type HighSchoolParentSecurity } from "./highSchoolParentSecurity";
import { parentGrantHeader } from "./highSchoolParentHttp";
import type { HighSchoolFamilySetup, HighSchoolFamilyReview } from "./highSchoolFamilySetup";

export function registerHighSchoolFamilyRoutes(app: Express, family: HighSchoolFamilySetup,
  review: HighSchoolFamilyReview, parent: HighSchoolParentSecurity, authenticate: (req: Request) => Promise<OnboardingActor>,
  allowProduction = false) {
  const base = "/api/high-school/family";
  const handle = (work: (r: Request, a: OnboardingActor, grant?: string) => Promise<unknown>, bootstrap = false): RequestHandler => async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Pragma", "no-cache");
    if (!isParentSecurityDevelopment() && !allowProduction) { res.sendStatus(404); return; }
    try {
      if (!await family.installed()) throw new OnboardingError("DEV_FAMILY_INSTALL_REQUIRED", 503);
      const actor = await authenticate(req), grant = req.get(parentGrantHeader);
      if (!bootstrap && await parent.enrolled(actor.authId) && !await parent.authorized(actor, grant))
        throw new ParentSecurityError("PARENT_VERIFICATION_REQUIRED", 403);
      res.json((await work(req, actor, grant)) ?? { saved: true });
    } catch (error) {
      const known = error instanceof OnboardingError || error instanceof ParentSecurityError;
      res.status(known ? error.status : error instanceof ZodError ? 400 : (error as any)?.code === "23505" ? 409 : 503)
        .json({ code: known ? error.code : error instanceof ZodError ? "INVALID_FAMILY_INPUT" : "FAMILY_SETUP_UNAVAILABLE" });
    }
  };
  app.get(`${base}/availability`, handle(async (_r, actor) => ({
    enabled: family.enrollmentEnabled || await parent.enrolled(actor.authId),
  }), true));
  // Returning to the existing adult app must not require parent email proof.
  // Still validate the server-side Auth session and return only canonical adult
  // team IDs, never children or school-team authority.
  app.get(`${base}/adult-team-ids`, handle(async (_r, a) => {
    await parent.status(a);
    return family.adultTeamIds(a);
  }, true));
  app.get(`${base}/state`, handle((_r, a, g) => family.state(a, g), true));
  app.post(`${base}/begin`, handle((_r, a) => family.begin(a), true));
  app.post(`${base}/draft`, handle((r, a, g) => family.draft(a, r.body, g)));
  app.post(`${base}/consent`, handle((r, a, g) => family.consent(a, r.body, g)));
  app.post(`${base}/lookup`, handle((r, a, g) => family.intake.lookup(a, r.body?.invitation, r.body?.revision, g)));
  app.post(`${base}/join`, handle((r, a, g) => family.intake.join(a, r.body, g)));
  app.post(`${base}/new-draft`, handle((r, a, g) => family.newDraft(a, r.body, g)));
  const staff = `${base}/staff/teams/:teamId/requests`;
  app.get(`${base}/staff/teams`, handle((_r, a) => review.teams(a)));
  app.get(staff, handle((r, a) => review.requests(a, r.params.teamId)));
  app.post(`${staff}/:id/decision`, handle((r, a) => review.decide(a, r.params.teamId, r.params.id, r.body)));
}
