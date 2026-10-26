import { getDatabaseConnectionString } from "./testDatabaseGuard";

export const TEST_DATABASE_NAME = "roster_test";

/**
 * Resolve the test-only URL from Replit's managed PG credentials at launch.
 * Never save a credential-bearing URL to a source file, output, or .env file.
 */
export function buildTestDatabaseEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  for (const key of ["PGHOST", "PGUSER", "PGPASSWORD"] as const) {
    if (!source[key]) throw new Error(`Managed test database configuration requires ${key}`);
  }
  const host = source.PGHOST!;
  if (!/^[a-z0-9.-]+$/i.test(host) ||
      !(host.endsWith(".neon.tech") || host === "helium")) {
    throw new Error("The configured test database host is not a supported Replit-managed PostgreSQL host");
  }
  const port = source.PGPORT || "5432";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("Invalid managed test database port");
  }
  const url = new URL("postgresql://placeholder");
  url.hostname = host;
  url.port = port;
  url.username = source.PGUSER!;
  url.password = source.PGPASSWORD!;
  url.pathname = `/${TEST_DATABASE_NAME}`;
  const testUrl = url.toString();
  if (source.TEST_DATABASE_URL && source.TEST_DATABASE_URL !== testUrl) {
    throw new Error("An explicit TEST_DATABASE_URL conflicts with the managed test database configuration");
  }
  // Validate against both app/production and development BEFORE removing their
  // credentials from the child. A failing validation cannot start a test process.
  getDatabaseConnectionString({
    ...source,
    NODE_ENV: "test",
    TEST_DATABASE_URL: testUrl,
  }, []);

  // Do not inherit live provider credentials, the production DATABASE_URL,
  // legacy PG defaults, or NODE_OPTIONS hooks into a database test process.
  const child: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    TEST_DATABASE_URL: testUrl,
  };
  for (const key of ["PATH", "HOME", "LANG", "TZ", "TERM", "TMPDIR"] as const) {
    if (source[key]) child[key] = source[key];
  }
  // Importing existing auth modules requires SDK configuration. Only the dev
  // configuration is available to those modules; this does not test hosted Auth.
  if (source.DEV_SUPABASE_URL) child.SUPABASE_URL = source.DEV_SUPABASE_URL;
  if (source.DEV_SUPABASE_SERVICE_ROLE_KEY) {
    child.SUPABASE_SERVICE_ROLE_KEY = source.DEV_SUPABASE_SERVICE_ROLE_KEY;
  }
  return child;
}
