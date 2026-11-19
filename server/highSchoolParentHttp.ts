import type { Express, Request, RequestHandler } from "express";
import {
  HighSchoolParentSecurity, ParentSecurityError, isUuid,
  type ParentActor, type ParentPurpose,
} from "./highSchoolParentSecurity";

export const PARENT_API = "/api/high-school/parent-verification";
export const parentGrantHeader = "x-parent-verification";
export function parentActorFromVerifiedToken(token: string, authId: string, issuer: string): ParentActor {
  // Only call AFTER the configured Auth server has validated this exact token.
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (payload.sub !== authId || !isUuid(authId) || !isUuid(payload.session_id)
      || payload.iss !== issuer || payload.aud !== "authenticated"
      || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) throw new Error();
    return { authId, sessionId: payload.session_id };
  } catch { throw new ParentSecurityError("INVALID_SESSION", 401); }
}
export function parentErrorResponse(res: any, error: unknown) {
  const known = error instanceof ParentSecurityError;
  return res.status(known ? error.status : 503).json({
    code: known ? error.code : "PARENT_SECURITY_UNAVAILABLE",
    message: known && error.code === "PARENT_VERIFICATION_REQUIRED"
      ? "Verify through the parent's email before using parent controls."
      : "The parent-verification request could not be completed.",
  });
}
export function registerParentVerificationRoutes(
  app: Express, security: HighSchoolParentSecurity,
  authenticate: (req: Request) => Promise<ParentActor>,
) {
  const handler = (fn: (req: Request, actor: ParentActor) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      // Codes, email addresses and capability tokens must never be cached.
      res.setHeader("Cache-Control", "no-store");
      try { res.json(await fn(req, await authenticate(req))); }
      catch (error) { parentErrorResponse(res, error); }
    };
  app.get(`${PARENT_API}/status`, handler((req, actor) => security.status(actor, req.get(parentGrantHeader))));
  app.post(`${PARENT_API}/challenge`, handler((req, actor) =>
    security.challenge(actor, req.body?.purpose as ParentPurpose)));
  app.post(`${PARENT_API}/verify`, handler((req, actor) =>
    security.verify(actor, req.body?.challengeId, req.body?.code)));
  app.post(`${PARENT_API}/revoke`, handler(async (_req, actor) => {
    await security.revoke(actor);
    return { revoked: true };
  }));
  app.post(`${PARENT_API}/password`, handler((req, actor) =>
    security.changePassword(actor, req.get(parentGrantHeader), req.body?.password)));
}

export async function requireDevParentAuthority(
  security: HighSchoolParentSecurity, authId: string,
  verifiedToken: string, issuer: string, parentGrant?: string,
) {
  if (!await security.enrolled(authId)) return;
  const actor = parentActorFromVerifiedToken(verifiedToken, authId, issuer);
  if (!await security.authorized(actor, parentGrant)) {
    throw new ParentSecurityError("PARENT_VERIFICATION_REQUIRED", 403);
  }
}
