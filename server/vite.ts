import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { serveCrawlabilityFiles } from "./crawlabilityFiles";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    // Vite HMR upgrades failed through the preview proxy. Disable only dev-tool
    // hot reload instead of changing the application's existing /ws handling.
    hmr: process.env.NONPRODUCTION_ISOLATED === "1" ? false as const : { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Never serve a previously built production client (and its native bridge
  // configuration) from the isolated development server.
  if (process.env.NONPRODUCTION_ISOLATED !== "1") {
    serveCrawlabilityFiles(app, path.resolve(import.meta.dirname, "..", "dist", "public"));
  }
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      if (process.env.NONPRODUCTION_ISOLATED === "1") {
        template = template
          .replace(/<script\b[^>]*\bsrc=["'][^"']*(?:cdn\.onesignal\.com|cdn\.jsdelivr\.net\/npm\/natively|replit\.com\/public\/js\/replit-dev-banner\.js)[^"']*["'][^>]*>\s*<\/script>/gi, "")
          .replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\.OneSignalDeferred(?:(?!<\/script>)[\s\S])*?<\/script>/gi, "");
      }
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express, distPath = path.resolve(import.meta.dirname, "public")) {

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  serveCrawlabilityFiles(app, distPath);
  app.get("*", (req, res, next) => {
    // Serve generated /faq/index.html at /faq without redirecting to /faq/.
    // The browser router uses clean paths, just like the Vercel frontend.
    const pagePath = path.resolve(distPath, `.${req.path}`, "index.html");
    if (!pagePath.startsWith(`${path.resolve(distPath)}${path.sep}`)
      || !fs.existsSync(pagePath) || !fs.statSync(pagePath).isFile()) return next();
    if (req.path !== "/" && req.path.endsWith("/")) {
      const query = req.originalUrl.slice(req.originalUrl.indexOf("?") < 0
        ? req.originalUrl.length : req.originalUrl.indexOf("?"));
      return res.redirect(301, `/${req.path.split("/").filter(Boolean).join("/")}${query}`);
    }
    return res.sendFile(pagePath);
  });
  app.use(express.static(distPath, { redirect: false }));

  const clientRoutes = [
    /^\/$/,
    /^\/(?:app|login|get-started|reset-password|forgot-password|hpib|demo)$/,
    /^\/(?:features|pricing|about|hockey|soccer|baseball|for-youth-teams|for-adult-leagues|for-varsity|referral-program|faq|support|privacy|privacy-policy|terms-of-service)$/,
    /^\/(?:league-tournament-search|league-search|team-search|tournament-search|tournaments|tournaments\/create|facilities|facility-memberships|create-league|create-team|create-scrimmage|scrimmage-management|invite-groups|league-management|league-list|calendar|announcements|substitute-confirmations|stats|stats-management|scorekeeper|create-payment-request|calendar-events\/create|roster|subscription|trophy-case|trophy-case\/earned-patches|admin\/badges|admin\/referrals|admin\/stripe|admin\/metrics)$/,
    /^\/invite-groups\/(?:new|[^/]+)$/,
    /^\/(?:messages|user|facilities|edit-scrimmage|draft|league|game|scrimmage|team-event|team|player-stats|payment-requests|tournament-teams|leagues|media|tournaments)\/[^/]+(?:\/(?:edit|custom-builder|score-verification|tournaments|create))?$/,
    /^\/(?:leagues\/[^/]+\/tournaments\/(?:create)?|media\/(?:tournament|league|team)\/[^/]+|referral-program\/(?:portal(?:\/(?:auth|set-password|forgot-password|login))?|verify)|admin\/referrals(?:\/(?:login|partner\/[^/]+))?)$/,
  ];

  app.use((req, res) => {
    if (clientRoutes.some(route => route.test(req.path))) {
      return res.sendFile(path.resolve(distPath, "index.html"));
    }
    const canonical = `https://www.roster-app.com${req.path.replaceAll('"', '%22').replaceAll('<', '%3C')}`;
    res.status(404).set("X-Robots-Tag", "noindex, nofollow").type("html").send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found | Roster</title><link rel="canonical" href="${canonical}"></head><body><main><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return to Roster</a></main></body></html>`,
    );
  });
}
