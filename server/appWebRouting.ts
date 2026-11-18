import type { Express, Request } from "express";
import path from "node:path";
import { APP_CRAWL_FILES, appRobots, marketingDestination } from "../shared/appWebPolicy";

export function isAppPreview(req: Request): boolean {
  return process.env.NODE_ENV !== "production"
    || /(?:\.replit\.(?:dev|app)|\.vercel\.app)$/.test(req.hostname.toLowerCase());
}
/** Install before frontend/static handlers; does not intercept APP APIs. */
export function serveAppWebRouting(app: Express, publicDir?: string) {
  if (publicDir) {
    // Exact native files only, not a general dotfile/static exposure.
    for (const filename of ["apple-app-site-association", "assetlinks.json"]) {
      app.get(`/.well-known/${filename}`, (_req, res, next) => {
        res.type("application/json").sendFile(path.resolve(publicDir, ".well-known", filename), error => {
          if (!error) return;
          if (res.headersSent) return next(error);
          res.status((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500).type("text/plain").send("Association file unavailable");
        });
      });
    }
  }
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const search = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    const destination = marketingDestination(req.path, search);
    if (destination) return res.redirect(301, destination);
    next();
  });
  for (const [pathname, file] of Object.entries(APP_CRAWL_FILES)) {
    app.get(pathname, (_req, res) => {
      res.set({ "Content-Type": file.contentType, "Cache-Control": "public, max-age=0, must-revalidate", "X-Robots-Tag": "noindex, nofollow" }).send(file.body);
    });
  }
}

// Explicit APP document routes, not a catch-all for arbitrary/API/static paths.
const clientRoutes = [
  /^\/$/,
  /^\/(?:app|login|get-started|reset-password|forgot-password|hpib|demo|privacy|privacy-policy|terms|terms-of-service)$/,
  /^\/(?:league-tournament-search|league-search|team-search|tournament-search|tournaments|tournaments\/create|facilities|facility-memberships|create-league|create-team|create-scrimmage|scrimmage-management|invite-groups|league-management|league-list|calendar|announcements|substitute-confirmations|stats|stats-management|scorekeeper|create-payment-request|calendar-events\/create|roster|subscription|subscriptions|settings\/billing|trophy-case|trophy-case\/earned-patches|admin\/badges|admin\/referrals|admin\/stripe|admin\/metrics|admin\/organizer-card-payments)$/,
  /^\/invite-groups\/(?:new|[^/]+)$/,
  /^\/(?:messages|user|facilities|edit-scrimmage|draft|league-management|game|scrimmage|team-event|team|player-stats|tournament-teams|tournaments)\/[^/]+$/,
  /^\/payment-requests\/[^/]+(?:\/edit)?$/,
  /^\/league\/[^/]+\/score-verification$/,
  /^\/tournaments\/[^/]+\/(?:edit|custom-builder)$/,
  /^\/leagues\/[^/]+\/tournaments(?:\/create)?$/,
  /^\/(?:messages|teams|profile|payment-requests)$/,
  /^\/(?:media\/(?:tournament|league|team)\/[^/]+|referral-program\/(?:apply|portal(?:\/(?:auth|set-password|forgot-password|login))?|verify)|admin\/referrals(?:\/(?:login|partner\/[^/]+))?)$/,
];
export function isAppDocument(path: string): boolean {
  return clientRoutes.some(route => route.test(path.replace(/\/+$/, "") || "/"));
}
export function appDocumentHeaders(req: Request) {
  return { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": appRobots(req.path, isAppPreview(req)),
    "Cache-Control": "no-store", "Vary": "Host" };
}
