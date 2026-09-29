import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { warmCityGeoCache } from "./storage";
import { initReferralDb } from "./referralDbInit";
import { initDraftDb } from "./draftDbInit";
import { initGoogleIapClaimsDb } from "./googleIapClaimsInit";
import { initApplePurchaseLinks, reconcileApplePurchaseLinks, startApplePurchaseLinkJob } from "./applePurchaseLinks";
import {
  initNativeRevenueCatDb,
  reconcileDisallowedNativeSandboxRoles,
  startRevenueCatEntitlementExpiryJob,
  startRevenueCatWebhookInboxWorker,
} from "./nativeRevenueCat";
import { startScrimmageReminderJob } from "./scrimmageReminderJob";
import { startBeerBadgeEvaluationWorker } from "./beerBadgeEvaluationQueue";
import { reconcileSeasonSubMagnet, reconcileSeasonRsvpKing } from "./badges";
import { runHistoricalBadgeBackfills } from "./badgeDbInit";

const app = express();

// CORS configuration for Vercel frontend
const allowedOriginsEnv = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['https://www.roster-app.com']; // fallback default

const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // In development, allow all Replit domains and localhost
    if (process.env.NODE_ENV === 'development') {
      if (origin.includes('.replit.dev') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    if (allowedOriginsEnv.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`❌ CORS blocked for origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(cookieParser());

// Stripe webhook needs raw body for signature verification
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));
// RevenueCat signs the exact raw UTF-8 body; this must precede express.json().
app.use('/api/webhooks/revenuecat-native',
  express.raw({ type: 'application/json', limit: '1mb', inflate: false }));

// All other routes use JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize referral program tables before registering routes.
  await initReferralDb();
  await initDraftDb();
  await initGoogleIapClaimsDb();
  await initApplePurchaseLinks();
  await initNativeRevenueCatDb();
  // A removed tester exception must revoke cached sandbox-only roles before
  // this process begins serving production requests.
  await reconcileDisallowedNativeSandboxRoles();

  const server = await registerRoutes(app);
  await reconcileApplePurchaseLinks();
  startApplePurchaseLinkJob();
  startRevenueCatEntitlementExpiryJob();
  startRevenueCatWebhookInboxWorker();
  startBeerBadgeEvaluationWorker();
  // An end date can pass without a commissioner explicitly closing the season.
  setInterval(() => {
    reconcileSeasonSubMagnet(true).catch((error) =>
      console.error("[Badges] Sub Magnet season reconciliation failed:", error));
    reconcileSeasonRsvpKing(true).catch((error) =>
      console.error("[Badges] RSVP King season reconciliation failed:", error));
  }, 60 * 60 * 1000).unref();

  // Start background jobs (scrimmage reminders + backup queue timeout cascade)
  startScrimmageReminderJob();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[API] Request failed:", err);
    if (!res.headersSent) res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    // Optional cache warming must not keep the API offline when the DB is slow.
    void warmCityGeoCache();
    // Backfill historical badges after readiness. Errors are logged per badge
    // family, so corrupt history cannot take down the API for every user.
    void runHistoricalBadgeBackfills().catch((error) =>
      console.error("[Badges] Unexpected backfill runner failure:", error));
  });
})();
