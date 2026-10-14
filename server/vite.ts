import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

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
    hmr: { server },
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

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const clientRoutes = [
    /^\/$/,
    /^\/(?:app|login|get-started|reset-password|forgot-password|hpib|demo)$/,
    /^\/(?:features|pricing|about|hockey|soccer|baseball|for-youth-teams|for-adult-leagues|for-varsity|referral-program|faq|support|privacy|privacy-policy|terms-of-service)$/,
    /^\/(?:league-tournament-search|league-search|team-search|tournament-search|tournaments|tournaments\/create|facilities|facility-memberships|create-league|create-team|create-scrimmage|scrimmage-management|invite-groups|league-management|league-list|calendar|announcements|substitute-confirmations|stats|stats-management|scorekeeper|create-payment-request|calendar-events\/create|roster|subscription|trophy-case|trophy-case\/earned-patches|admin\/badges|admin\/referrals|admin\/stripe|admin\/metrics)$/,
    /^\/invite-groups\/(?:new|[^/]+)$/,
    /^\/(?:messages|user|facilities|edit-scrimmage|draft|league|game|scrimmage|team-event|team|player-stats|payment-requests|tournament-teams|leagues|media|tournaments)\/[^/]+(?:\/(?:edit|custom-builder|score-verification|tournaments|create))?$/,
    /^\/(?:leagues\/[^/]+\/tournaments\/(?:create)?|media\/(?:tournament|league|team)\/[^/]+|referral-program\/(?:portal(?:\/(?:auth|set-password|forgot-password|login))?|verify)|admin\/referrals(?:\/(?:login|partner\/[^/]+))?)$/,
  ];

  app.use("*", (req, res) => {
    if (clientRoutes.some(route => route.test(req.path))) {
      return res.sendFile(path.resolve(distPath, "index.html"));
    }
    const canonical = `https://www.roster-app.com${req.path.replaceAll('"', '%22').replaceAll('<', '%3C')}`;
    res.status(404).set("X-Robots-Tag", "noindex, nofollow").type("html").send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found | Roster</title><link rel="canonical" href="${canonical}"></head><body><main><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return to Roster</a></main></body></html>`,
    );
  });
}
