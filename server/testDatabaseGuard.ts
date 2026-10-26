const testFilePattern = /(?:^|[/\\])[^/\\]+\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function isTestProcess(env: NodeJS.ProcessEnv, argv: readonly string[]): boolean {
  return env.NODE_ENV === "test" ||
    Boolean(env.NODE_TEST_CONTEXT) ||
    argv.some((arg) => testFilePattern.test(arg));
}

function databaseEndpoint(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // URL parse errors can include the complete credential-bearing input.
    throw new Error("Database connection must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Database connection must use a PostgreSQL URL");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  let database: string;
  let username: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
  } catch {
    throw new Error("Database connection contains invalid URL encoding");
  }
  if (!host || !database) {
    throw new Error("Database connection must identify an explicit host and database");
  }

  // Supabase's direct, session-pooler and transaction-pooler URLs can all
  // reach the same database. A pooler host alone identifies multiple projects.
  const directProject = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/)?.[1];
  const isSupabasePooler = host.endsWith(".pooler.supabase.com");
  const pooledProject = isSupabasePooler
    ? username.match(/^[^.]+\.([a-z0-9-]+)$/)?.[1]
    : undefined;
  if (isSupabasePooler && !pooledProject) {
    throw new Error("Cannot establish Supabase pooler project identity; refusing database access");
  }
  const project = directProject ?? pooledProject;
  if (project) return `supabase:${project}/${database}`;

  // Credentials and URL options do not make a different physical database.
  return `${host}:${url.port || "5432"}/${database}`;
}

export function getDatabaseConnectionString(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
): string {
  const testProcess = isTestProcess(env, argv);
  if (testProcess) {
    if (!env.TEST_DATABASE_URL) {
      throw new Error(
        "Database-backed tests require TEST_DATABASE_URL pointing to a separate test database. Refusing to use DATABASE_URL.",
      );
    }
    const testEndpoint = databaseEndpoint(env.TEST_DATABASE_URL);
    // DATABASE_URL remains the existing app/production reference; the new
    // development target is configured separately, never in place of it.
    for (const key of ["DATABASE_URL", "DEV_DATABASE_URL"] as const) {
      if (env[key] && testEndpoint === databaseEndpoint(env[key])) {
        throw new Error(
          `TEST_DATABASE_URL points to the same database as ${key}. Refusing to run database-backed tests.`,
        );
      }
    }
    return env.TEST_DATABASE_URL;
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  return env.DATABASE_URL;
}