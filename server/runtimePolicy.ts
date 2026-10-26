export const PRODUCTION_RAILWAY_ENVIRONMENT = "aa52bb2b-6ecf-4b99-8df2-d5eb710a7249";
export const PRODUCTION_RAILWAY_SERVICE = "56ba1c43-f2dd-477e-b1fc-310dbd841a45";

export function isVerifiedProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" &&
    env.RAILWAY_ENVIRONMENT_ID === PRODUCTION_RAILWAY_ENVIRONMENT &&
    env.RAILWAY_SERVICE_ID === PRODUCTION_RAILWAY_SERVICE;
}

/** A production identity/configuration error must fail startup, not skip workers. */
export function assertProductionRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  // This app currently has one approved Railway runtime. An unexpected
  // Railway identity must not turn a bad NODE_ENV into a healthy, workerless app.
  const productionContext = env.NODE_ENV === "production" ||
    Boolean(env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_SERVICE_ID);
  if (!productionContext) return;
  if (!isVerifiedProductionRuntime(env) ||
      env.NONPRODUCTION_ISOLATED === "1" ||
      env.VITE_ISOLATED_DEVELOPMENT === "true") {
    throw Object.assign(new Error(
      "Production runtime verification failed; application startup refused so production workers cannot be silently disabled. " +
      "Check NODE_ENV=production, RAILWAY_ENVIRONMENT_ID, RAILWAY_SERVICE_ID, and remove development-isolation flags.",
    ), { code: "PRODUCTION_RUNTIME_CONFIGURATION_INVALID" });
  }
}

export function assertLiveDeliveryAllowed(): void {
  if (!isVerifiedProductionRuntime()) {
    throw Object.assign(new Error("Live delivery and billing are disabled outside verified production."), {
      code: "NONPRODUCTION_DELIVERY_DISABLED", status: 503,
    });
  }
}

export function disabledProvider<T extends object>(): T {
  return new Proxy({} as T, {
    get() {
      assertLiveDeliveryAllowed();
      throw new Error("Provider was not initialized");
    },
  });
}
