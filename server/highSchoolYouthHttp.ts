import type { Express, Request, RequestHandler } from "express";
import { ZodError } from "zod";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { ParentSecurityError, isParentSecurityDevelopment } from "./highSchoolParentSecurity";
import { parentGrantHeader } from "./highSchoolParentHttp";
import { HighSchoolYouthOnboarding } from "./highSchoolYouthOnboarding";
import { HighSchoolChildDevices } from "./highSchoolChildDevices";

export function registerHighSchoolYouthRoutes(
  app: Express, service: HighSchoolYouthOnboarding, children: HighSchoolChildDevices,
  authenticate: (req: Request) => Promise<OnboardingActor>,
) {
  const respond = (work: (req: Request) => Promise<unknown>): RequestHandler => async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    if (!isParentSecurityDevelopment()) { res.sendStatus(404); return; }
    try {
      if (!await service.installed()) throw new OnboardingError("DEV_YOUTH_INSTALL_REQUIRED", 503);
      res.json(await work(req));
    } catch (error) {
      const known = error instanceof OnboardingError || error instanceof ParentSecurityError;
      res.status(known ? error.status : error instanceof ZodError ? 400 : 503)
        .json({ code: known ? error.code : error instanceof ZodError ? "INVALID_ONBOARDING_INPUT" : "ONBOARDING_UNAVAILABLE" });
    }
  };
  const parent = (work: (req: Request, actor: OnboardingActor, grant?: string) => Promise<unknown>) =>
    respond(async req => work(req, await authenticate(req), req.get(parentGrantHeader)));
  const base = "/api/high-school/onboarding";
  app.post(`${base}/hockey-type`, parent((req, actor) => service.hockeyType(actor, req.body)));
  app.post(`${base}/journey`, parent((req, actor, grant) => service.journey(actor, req.body, grant)));
  app.get(`${base}/referral-partners`, parent((_req, actor) => service.referralPartners(actor)));
  app.get(`${base}/league-draft`, parent((_req, actor, grant) => service.leagueDraft(actor, grant)));
  app.post(`${base}/league-draft`, parent((req, actor, grant) => service.saveLeagueDraft(actor, req.body, grant)));
  app.get(`${base}/children`, parent((_req, actor, grant) => children.children(actor, grant)));
  app.post(`${base}/device-codes`, parent((req, actor, grant) => children.createCode(actor, req.body, grant)));
  app.get(`${base}/device-requests`, parent((_req, actor, grant) => children.requests(actor, grant)));
  app.post(`${base}/device-requests/:id/decision`, parent((req, actor, grant) => children.decision(actor, req.params.id, req.body, grant)));
  app.post(`${base}/children/:id/revoke`, parent((req, actor, grant) => children.revoke(actor, req.params.id, grant)));

  const child = "/api/high-school/child-device";
  // These endpoints never call the parent Auth sign-in/update APIs.
  app.post(`${child}/start`, respond(req => children.start(req.body, req.ip ?? req.socket.remoteAddress ?? "unknown-peer")));
  app.post(`${child}/poll`, respond(req => children.poll(req.body)));
  const childToken = (req: Request) => req.get("authorization")?.replace(/^Bearer /, "");
  app.get(`${child}/session`, respond(req => children.ownSession(childToken(req))));
  app.get(`${child}/chats/:id/messages`, respond(req => children.messages(childToken(req), req.params.id)));
  app.post(`${child}/chats/:id/messages`, respond(req => children.sendMessage(childToken(req), req.params.id, req.body)));
}
