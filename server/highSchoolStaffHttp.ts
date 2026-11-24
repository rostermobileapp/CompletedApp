import type { Express, Request, RequestHandler } from "express";
import { z } from "zod";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { HighSchoolParentSecurity, ParentSecurityError, isParentSecurityDevelopment } from "./highSchoolParentSecurity";
import { parentGrantHeader } from "./highSchoolParentHttp";
import type { HighSchoolStaffOperations } from "./highSchoolStaffOperations";
import type { HighSchoolStaffEvents } from "./highSchoolStaffEvents";
import type { HighSchoolStaffChat } from "./highSchoolStaffChat";
import { importText, previewEvents, previewRoster } from "./highSchoolStaffImports";

export function registerHighSchoolStaffRoutes(app: Express, staff: HighSchoolStaffOperations,
  events: HighSchoolStaffEvents, chat: HighSchoolStaffChat, parent: HighSchoolParentSecurity,
  authenticate: (req: Request) => Promise<OnboardingActor>) {
  const base = "/api/high-school/staff/teams/:teamId";
  const handle = (work: (req: Request, actor: OnboardingActor) => Promise<unknown>): RequestHandler => async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Pragma", "no-cache");
    if (!isParentSecurityDevelopment()) { res.sendStatus(404); return; }
    try {
      const actor = await authenticate(req);
      if (await parent.enrolled(actor.authId) && !await parent.authorized(actor, req.get(parentGrantHeader)))
        throw new ParentSecurityError("PARENT_VERIFICATION_REQUIRED", 403);
      if (!await staff.installed()) throw new OnboardingError("DEV_STAFF_INSTALL_REQUIRED", 503);
      res.json(await work(req, actor));
    } catch (error) {
      const known = error instanceof OnboardingError || error instanceof ParentSecurityError;
      res.status(known ? error.status : error instanceof z.ZodError ? 400 : 503)
        .json({ code: known ? error.code : error instanceof z.ZodError ? "INVALID_STAFF_INPUT" : "STAFF_OPERATIONS_UNAVAILABLE",
          ...(error instanceof z.ZodError ? { errors: error.issues.map(i => ({ field: i.path.join("."), message: i.message })) } : {}) });
    }
  };
  app.get(base, handle((r, a) => staff.workspace(a, r.params.teamId)));
  app.put(`${base}/settings`, handle((r, a) => staff.settings(a, r.params.teamId, r.body)));
  app.post(`${base}/roster/import/preview`, handle(async (r, a) => {
    await staff.authorize(a, r.params.teamId);
    return previewRoster(z.object({ text: importText }).strict().parse(r.body).text);
  }));
  app.post(`${base}/roster/import`, handle((r, a) => staff.importRoster(a, r.params.teamId, r.body)));
  app.post(`${base}/invitations`, handle((r, a) => staff.invitation(a, r.params.teamId, r.body)));
  app.post(`${base}/approvals/:id`, handle((r, a) => staff.approve(a, r.params.teamId, r.params.id, r.body)));
  app.delete(`${base}/staff/:id`, handle((r, a) => staff.revoke(a, r.params.teamId, r.params.id)));
  app.post(`${base}/teams`, handle((r, a) => staff.newTeam(a, r.params.teamId, r.body)));
  app.post(`${base}/events`, handle((r, a) => events.create(a, r.params.teamId, r.body)));
  app.put(`${base}/events/:id`, handle((r, a) => events.update(a, r.params.teamId, r.params.id, r.body)));
  app.delete(`${base}/events/:id`, handle((r, a) => events.remove(a, r.params.teamId, r.params.id, r.body)));
  app.post(`${base}/events/import/preview`, handle(async (r, a) => {
    await staff.authorize(a, r.params.teamId);
    const { format, text } = z.object({ format: z.enum(["csv", "ical"]), text: importText }).strict().parse(r.body);
    return previewEvents(format, text);
  }));
  app.post(`${base}/events/import`, handle((r, a) => events.import(a, r.params.teamId, r.body)));
  app.post(`${base}/dispatch/retry`, handle((r, a) => events.retryDispatch(a, r.params.teamId)));
  app.get(`${base}/events/:id/lineup`, handle((r, a) => events.lineup(a, r.params.teamId, r.params.id)));
  app.put(`${base}/events/:id/lineup`, handle((r, a) => events.saveLineup(a, r.params.teamId, r.params.id, r.body)));
  app.post(`${base}/events/:id/report`, handle((r, a) => events.report(a, r.params.teamId, r.params.id, r.body)));
  app.get(`${base}/rooms/:id/messages`, handle((r, a) => chat.messages(a, r.params.teamId, r.params.id)));
  app.post(`${base}/rooms/:id/messages`, handle((r, a) => chat.send(a, r.params.teamId, r.params.id, r.body)));
  app.post(`${base}/messages/:id/report`, handle((r, a) => chat.reportMessage(a, r.params.teamId, r.params.id, r.body)));
  app.post(`${base}/reports/:id/resolve`, handle((r, a) => chat.resolve(a, r.params.teamId, r.params.id)));
  app.post(`${base}/payments`, handle((r, a) => staff.createPayment(a, r.params.teamId, r.body)));
  app.patch(`${base}/payments/:id/recipients/:recipientId`, handle((r, a) => staff.confirmPayment(a, r.params.teamId, r.params.id, r.params.recipientId, r.body)));
}
