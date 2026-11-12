import { databaseEndpoint } from "./testDatabaseGuard";
import { isLiveProjectPreview } from "./runtimePolicy";

const DEV_ONLY_KEYS = [
  "DEV_DATABASE_URL",
  "DEV_SUPABASE_URL",
  "DEV_SUPABASE_SERVICE_ROLE_KEY",
  "DEV_SUPABASE_ANON_KEY",
] as const;

export function configureLiveProjectPreview(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!isLiveProjectPreview(source)
    || source.NONPRODUCTION_ISOLATED === "1"
    || source.VITE_ISOLATED_DEVELOPMENT === "true") {
    throw new Error("Live-project preview requires an explicit Replit development workflow.");
  }

  const required = [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
  ] as const;
  if (required.some((key) => !source[key])) {
    throw new Error("Live-project preview configuration is incomplete.");
  }

  try {
    const serverUrl = new URL(source.SUPABASE_URL!);
    const browserUrl = new URL(source.VITE_SUPABASE_URL!);
    if (serverUrl.protocol !== "https:"
      || !/^[a-z0-9-]+\.supabase\.co$/.test(serverUrl.hostname)
      || browserUrl.origin !== serverUrl.origin) {
      throw new Error("URL mismatch");
    }
    const projectRef = serverUrl.hostname.split(".")[0];
    if (!databaseEndpoint(source.DATABASE_URL!).startsWith(`supabase:${projectRef}/`)) {
      throw new Error("Database mismatch");
    }
  } catch {
    throw new Error("Live-project preview settings do not identify one matching Supabase project.");
  }

  const result = { ...source };
  for (const key of DEV_ONLY_KEYS) delete result[key];
  delete result.NONPRODUCTION_ISOLATED;
  delete result.NONPRODUCTION_FORBIDDEN_DATABASES;
  delete result.VITE_ISOLATED_DEVELOPMENT;
  delete result.VITE_ISOLATED_APP_ORIGIN;
  result.VITE_LIVE_PROJECT_PREVIEW = "true";
  result.VITE_LIVE_PROJECT_PREVIEW_ORIGIN = `https://${source.REPLIT_DEV_DOMAIN}`;
  return result;
}
