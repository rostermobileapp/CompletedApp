import type { RequestHandler } from "express";

export const nonproductionHttpGuard: RequestHandler = (req, res, next) => {
  if (process.env.NONPRODUCTION_ISOLATED !== "1") return next();
  const origin = process.env.SUPABASE_URL!;
  // A dev page must not register push workers or contact production providers,
  // including libraries that bypass the application's fetch helper.
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    `connect-src 'self' ${origin} ${origin.replace(/^http/, "ws")} ${process.env.VITE_ISOLATED_APP_ORIGIN ?? ""} ${process.env.VITE_ISOLATED_APP_ORIGIN?.replace(/^http/, "ws") ?? ""}`,
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "font-src 'self' data: https:",
    "media-src 'self' blob: data:",
    "worker-src 'none'",
    "frame-src 'none'",
  ].join("; "));
  if (req.path.startsWith("/api/giphy")) {
    res.status(503).json({
      code: "NONPRODUCTION_DELIVERY_DISABLED",
      message: "The live Giphy provider is disabled in isolated development.",
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD" &&
      /^\/api\//.test(req.path) &&
      /stripe|subscription|checkout|webhook|purchase|billing|\/iap|send|invite|remind|push|payment-request|password|recover|reset|otp|sign.?up|magic/i.test(req.path)) {
    res.status(503).json({
      code: "NONPRODUCTION_DELIVERY_DISABLED",
      message: "Delivery, live provider actions and billing are disabled in isolated development.",
    });
    return;
  }
  next();
};
