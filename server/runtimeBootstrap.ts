import { isolateDevelopmentEnvironment } from "./nonproductionEnvironment";
import { isTestProcess } from "./testDatabaseGuard";
import { installDevelopmentNetworkGuard } from "./nonproductionNetwork";
import { assertProductionRuntimeConfiguration, isVerifiedProductionRuntime } from "./runtimePolicy";

// Run before SDK/application modules, before any startup work or listen().
// Do not put this inside the development catch: production errors must remain
// explicit, including a missing/wrong NODE_ENV on the approved Railway service.
assertProductionRuntimeConfiguration();
if (isVerifiedProductionRuntime()) {
  console.info("[Runtime policy] Production identity verified; worker startup permitted.", {
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_ENVIRONMENT_ID: process.env.RAILWAY_ENVIRONMENT_ID,
    RAILWAY_SERVICE_ID: process.env.RAILWAY_SERVICE_ID,
  });
}

// Production configuration is untouched.
if (process.env.NODE_ENV !== "production" && !isTestProcess(process.env, process.argv)) {
  try {
    const isolated = isolateDevelopmentEnvironment(process.env);
    for (const key of Object.keys(process.env)) {
      if (!(key in isolated)) delete process.env[key];
    }
    Object.assign(process.env, isolated);
    installDevelopmentNetworkGuard(isolated.SUPABASE_URL!);
  } catch {
    // Never expose URL parse errors, which can contain connection passwords.
    throw new Error("Development is stopped: isolated configuration is missing or unsafe.");
  }
}
