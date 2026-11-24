import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { isLiveProjectPreview } from "./runtimePolicy";
import { appDocumentHeaders, isAppDocument, isAppPreview, serveAppWebRouting } from "./appWebRouting";
import { appDocumentHtml } from "../shared/appWebPolicy";
import { isParentSecurityDevelopment } from "./highSchoolParentSecurity";

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
  const previewSafetyEnabled = process.env.NONPRODUCTION_ISOLATED === "1"
    || isLiveProjectPreview(process.env);
  const serverOptions = {
    middlewareMode: true,
    // Vite HMR upgrades failed through the preview proxy. Disable only dev-tool
    // hot reload instead of changing the application's existing /ws handling.
    hmr: previewSafetyEnabled ? false as const : { server },
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

  // APP policy is independent from old website build artifacts.
  serveAppWebRouting(app, path.resolve(import.meta.dirname, "..", "client/public"));
  app.use(vite.middlewares);
  // Do not mount at "*": Express strips that mount from req.path, making
  // every document look like "/" and hiding real unknown-route 404s.
  app.use(async (req, res, next) => {
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
      if (previewSafetyEnabled) {
        template = template
          .replace(/<script\b[^>]*\bsrc=["'][^"']*(?:cdn\.onesignal\.com|cdn\.jsdelivr\.net\/npm\/natively|replit\.com\/public\/js\/replit-dev-banner\.js)[^"']*["'][^>]*>\s*<\/script>/gi, "")
          .replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\.OneSignalDeferred(?:(?!<\/script>)[\s\S])*?<\/script>/gi, "");
      }
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      // Keep development-only visual routes; production has no preview bypass.
      const known = isAppDocument(req.path) || /^\/(?:onboarding-preview|gerry-home-preview|trophy-case-preview|high-school\/(?:parent-verification|onboarding(?:-preview)?))$/.test(req.path)
        || (isParentSecurityDevelopment() && /^\/high-school\/(?:family|home|schedule|roster|chat|more|payments|team)$/.test(req.path));
      res.status(known ? 200 : 404).set(appDocumentHeaders(req))
        .end(appDocumentHtml(page, req.path, true));
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

  serveAppWebRouting(app, distPath);
  const template = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
  app.get("*", (req, res, next) => {
    if (!isAppDocument(req.path)) return next();
    return res.status(200).set(appDocumentHeaders(req))
      .send(appDocumentHtml(template, req.path, isAppPreview(req)));
  });
  app.use(express.static(distPath, { redirect: false }));

  app.use((req, res) => {
    const canonical = `https://www.roster-app.com${req.path.replaceAll('"', '%22').replaceAll('<', '%3C')}`;
    res.status(404).set("X-Robots-Tag", "noindex, nofollow").type("html").send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found | RosterHockey</title><meta property="og:site_name" content="RosterHockey"><link rel="canonical" href="${canonical}"></head><body><main><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return to RosterHockey</a></main></body></html>`,
    );
  });
}
