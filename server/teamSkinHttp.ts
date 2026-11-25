import type { Express, Request } from "express";
import type { OnboardingActor } from "./highSchoolOnboarding";
import { ParentSecurityError, isParentSecurityDevelopment, type HighSchoolParentSecurity } from "./highSchoolParentSecurity";
import { parentGrantHeader } from "./highSchoolParentHttp";
import type { HighSchoolChildDevices } from "./highSchoolChildDevices";
import type { TeamSkinService } from "./teamSkinService";

export function registerTeamSkinRoutes(
  app: Express, service: TeamSkinService, parent: HighSchoolParentSecurity,
  children: HighSchoolChildDevices, authenticate: (req: Request) => Promise<OnboardingActor>,
  allowProduction = false,
) {
  app.get("/api/high-school/skin-context", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isParentSecurityDevelopment() && !allowProduction) { res.sendStatus(404); return; }
    try {
      const actor = await authenticate(req);
      if (await parent.enrolled(actor.authId) && !await parent.authorized(actor, req.get(parentGrantHeader))) {
        throw new ParentSecurityError("PARENT_VERIFICATION_REQUIRED", 403);
      }
      res.json(await service.context({ id: actor.authId, type: "adult" }));
    } catch (error) {
      res.status(error instanceof ParentSecurityError ? error.status : 503)
        .json({ code: error instanceof ParentSecurityError ? error.code : "SKIN_CONTEXT_UNAVAILABLE" });
    }
  });
  app.get("/api/high-school/child-device/skin-context", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isParentSecurityDevelopment() && !allowProduction) { res.sendStatus(404); return; }
    try {
      // This retains the disabled-by-default activation, parent-session,
      // consent, device, registry and expiry checks. No parent Auth fallback.
      const actor = await children.skinActor(req.get("authorization")?.replace(/^Bearer /, ""));
      res.json(await service.context(actor));
    } catch {
      res.status(403).json({ code: "CHILD_SKIN_UNAVAILABLE" });
    }
  });
}
