import type { Express, Request, RequestHandler } from "express";
import {
  HighSchoolParentSecurity, ParentSecurityError, isUuid,
  parentDigest,
  type ParentActor, type ParentPurpose,
} from "./highSchoolParentSecurity";

export const PARENT_API = "/api/high-school/parent-verification";
export const parentGrantHeader = "x-parent-verification";
export const parentDeviceCookie = "roster_parent_device";
export const parentDeviceHeader = "x-parent-device-id";
const deviceProof = (req: Request) => {
  const token = req.cookies?.[parentDeviceCookie];
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    && req.get(parentDeviceHeader) === parentDigest(token) ? token : undefined;
};
const cookieOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api",
});
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
  // This is only an additional proof, never a login. Every existing parent
  // guard still validates the authenticated actor, session and database grant.
  app.use((req, _res, next) => {
    const token = deviceProof(req);
    if (req.path.startsWith("/api/") &&
        !req.path.startsWith("/api/high-school/child-device/") &&
        req.path !== `${PARENT_API}/password` &&
        !req.get(parentGrantHeader) && token) {
      req.headers[parentGrantHeader] = token;
    }
    next();
  });
  const handler = (fn: (req: Request, actor: ParentActor) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      // Codes, email addresses and capability tokens must never be cached.
      res.setHeader("Cache-Control", "no-store");
      try { res.json(await fn(req, await authenticate(req))); }
      catch (error) { parentErrorResponse(res, error); }
    };
  app.get(`${PARENT_API}/status`, handler((req, actor) => security.status(actor, req.get(parentGrantHeader))));
  // WebSockets may use another host, so they cannot depend on the first-party
  // cookie. Mint a short-lived, memory-only proof from the remembered device.
  app.post(`${PARENT_API}/socket-grant`, handler((req, actor) => security.socketGrant(actor, deviceProof(req))));
  app.post(`${PARENT_API}/challenge`, handler((req, actor) =>
    security.challenge(actor, req.body?.purpose as ParentPurpose)));
  app.post(`${PARENT_API}/verify`, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const result = await security.verify(await authenticate(req), req.body?.challengeId, req.body?.code, req.body?.rememberDevice === true);
      if (result.purpose === "parent_action" && req.body?.rememberDevice === true) {
        res.cookie(parentDeviceCookie, result.verificationToken, { ...cookieOptions(), maxAge: result.expiresInSeconds * 1000 });
        // Persist only nonsecret UI metadata in JS. The reusable proof stays HttpOnly.
        const { verificationToken, ...safe } = result;
        res.json({ ...safe, remembered: true, deviceId: parentDigest(verificationToken) });
      } else res.json(result);
    } catch (error) { parentErrorResponse(res, error); }
  });
  app.post(`${PARENT_API}/revoke`, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await security.revoke(await authenticate(req));
      res.clearCookie(parentDeviceCookie, cookieOptions());
      res.json({ revoked: true });
    } catch (error) { parentErrorResponse(res, error); }
  });
  app.post(`${PARENT_API}/forget-device`, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // A custom header plus SameSite=Strict prevents a cross-site form from
    // invoking this cookie-only logout action. It can never authorize anything.
    if (req.get("x-parent-device-action") !== "forget") {
      res.status(400).json({ code: "INVALID_DEVICE_ACTION" }); return;
    }
    try {
      await security.forgetDevice(req.cookies?.[parentDeviceCookie], req.body?.deviceId);
      // Do not send a delayed clear-cookie response that could erase a newer
      // verification. The old cookie is inert after its grant is revoked.
      res.json({ forgotten: true });
    } catch (error) { parentErrorResponse(res, error); }
  });
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
