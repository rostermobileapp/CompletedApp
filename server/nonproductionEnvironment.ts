import { databaseEndpoint } from "./testDatabaseGuard";

export function isolateDevelopmentEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  for (const key of [
    "DEV_DATABASE_URL", "DEV_SUPABASE_URL",
    "DEV_SUPABASE_SERVICE_ROLE_KEY", "DEV_SUPABASE_ANON_KEY",
  ]) {
    if (!source[key]) throw new Error(`Isolated development requires ${key}`);
  }
  const devDatabase = databaseEndpoint(source.DEV_DATABASE_URL!);
  const url = new URL(source.DEV_SUPABASE_URL!);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) {
    throw new Error("Development requires a verified Supabase project URL");
  }
  const reference = url.hostname.split(".")[0];
  if (!devDatabase.startsWith(`supabase:${reference}/`)) {
    throw new Error("Development database and Supabase API project do not match");
  }
  const forbidden = source.NONPRODUCTION_FORBIDDEN_DATABASES
    ? JSON.parse(source.NONPRODUCTION_FORBIDDEN_DATABASES) as string[] : [];
  if (!Array.isArray(forbidden) || forbidden.some(item => typeof item !== "string")) {
    throw new Error("Invalid nonproduction database isolation reference");
  }
  if (source.NONPRODUCTION_ISOLATED === "1" && !forbidden.length) {
    throw new Error("Isolated development is missing the production database exclusion");
  }
  if (source.DATABASE_URL && source.NONPRODUCTION_ISOLATED !== "1") {
    forbidden.push(databaseEndpoint(source.DATABASE_URL));
  }
  if (forbidden.includes(devDatabase)) throw new Error("Development points to a forbidden database");
  if (source.NONPRODUCTION_ISOLATED !== "1") {
    for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
      if (source[key] && new URL(source[key]).origin === url.origin) {
        throw new Error("Development Supabase project matches the existing application project");
      }
    }
  }
  const result = { ...source };
  for (const key of Object.keys(result)) {
    // Also remove connector auth: Resend can otherwise retrieve live keys even
    // after RESEND_API_KEY is removed.
    if (/STRIPE|ONESIGNAL|RESEND|REVENUECAT|APPLE_(?:IAP|SHARED)|GOOGLE_PLAY|GIPHY|ANTHROPIC|SUPABASE_JWT_SECRET|OBJECT_STORAGE|OBJECT_DIR|OBJECT_SEARCH|REPL_IDENTITY|WEB_REPL_RENEWAL|REPLIT_CONNECTORS/.test(key)) {
      delete result[key];
    }
  }
  delete result.PGHOST;
  delete result.PGPORT;
  delete result.PGUSER;
  delete result.PGPASSWORD;
  delete result.PGDATABASE;
  return {
    ...result,
    NODE_ENV: "development",
    DATABASE_URL: source.DEV_DATABASE_URL,
    SUPABASE_URL: url.origin,
    SUPABASE_SERVICE_ROLE_KEY: source.DEV_SUPABASE_SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL: url.origin,
    VITE_SUPABASE_ANON_KEY: source.DEV_SUPABASE_ANON_KEY,
    VITE_ISOLATED_DEVELOPMENT: "true",
    VITE_ISOLATED_APP_ORIGIN: source.REPLIT_DEV_DOMAIN ? `https://${source.REPLIT_DEV_DOMAIN}` : "",
    NONPRODUCTION_ISOLATED: "1",
    NONPRODUCTION_FORBIDDEN_DATABASES: JSON.stringify([...new Set(forbidden)]),
  };
}
