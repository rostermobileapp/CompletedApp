import type { RequestHandler } from "express";
import { isLiveProjectPreview } from "./runtimePolicy";

export const nonproductionHttpGuard: RequestHandler = (req, res, next) => {
  const previewSafetyEnabled = process.env.NONPRODUCTION_ISOLATED === "1"
    || isLiveProjectPreview(process.env);
  if (!previewSafetyEnabled) return next();
  const origin = process.env.SUPABASE_URL!;
  const testCardsEnabled = process.env.NONPRODUCTION_ISOLATED === "1"
    && process.env.TESTING_STRIPE_SECRET_KEY?.startsWith("sk_test_") === true
    && process.env.TESTING_VITE_STRIPE_PUBLIC_KEY?.startsWith("pk_test_") === true;
  // A dev page must not register push workers or contact production providers,
  // including libraries that bypass the application's fetch helper.
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'${testCardsEnabled ? " https://js.stripe.com" : ""}`,
    `connect-src 'self' ${origin} ${origin.replace(/^http/, "ws")} ${process.env.VITE_ISOLATED_APP_ORIGIN ?? ""} ${process.env.VITE_ISOLATED_APP_ORIGIN?.replace(/^http/, "ws") ?? ""}${testCardsEnabled ? " https://api.stripe.com https://r.stripe.com" : ""}`,
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "font-src 'self' data: https:",
    "media-src 'self' blob: data:",
    "worker-src 'none'",
    testCardsEnabled ? "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com" : "frame-src 'none'",
  ].join("; "));
  // These internal DEV endpoints have their own verified-session/code checks.
  // This permits no provider delivery and no generic password/reset endpoints.
  if (process.env.NONPRODUCTION_ISOLATED === "1" && req.method === "POST" &&
      /^\/api\/high-school\/parent-verification\/(?:challenge|verify|revoke|password|forget-device|socket-grant)$/.test(req.path)) {
    return next();
  }
  if (testCardsEnabled && (
    (req.method === "POST" && /^\/api\/organizer-card-payments\/(?:connect\/onboarding|checkout-session|[^/]+\/refund)$/.test(req.path)) ||
    (req.method === "POST" && /^\/api\/stripe-(?:card-payments|connect)-webhook$/.test(req.path)) ||
    (req.method === "POST" && req.path === "/api/payment-requests") ||
    (["PATCH", "DELETE"].includes(req.method) && /^\/api\/payment-requests\/[^/]+$/.test(req.path)) ||
    (req.method === "PATCH" && /^\/api\/payment-request-recipients\/[^/]+(?:\/confirm)?$/.test(req.path))
  )) {
    return next();
  }
  if (req.path.startsWith("/api/giphy")) {
    res.status(503).json({
      code: "NONPRODUCTION_DELIVERY_DISABLED",
      message: "The live Giphy provider is disabled in development previews.",
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD" &&
      /^\/api\//.test(req.path) &&
      /stripe|organizer-card-payments|subscription|checkout|webhook|purchase|billing|\/iap|send|invite|remind|push|payment-request|password|recover|reset|otp|sign.?up|magic/i.test(req.path)) {
    res.status(503).json({
      code: "NONPRODUCTION_DELIVERY_DISABLED",
      message: "Delivery, live provider actions and billing are disabled in development previews.",
    });
    return;
  }
  next();
};
