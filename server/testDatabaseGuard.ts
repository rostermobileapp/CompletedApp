const testFilePattern = /(?:^|[/\\])[^/\\]+\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function isTestProcess(env: NodeJS.ProcessEnv, argv: readonly string[]): boolean {
  return env.NODE_ENV === "test" ||
    Boolean(env.NODE_TEST_CONTEXT) ||
    argv.some((arg) => testFilePattern.test(arg));
}

function databaseEndpoint(connectionString: string): string {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Database connection must use a PostgreSQL URL");
  }
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname).replace(/\/+$/, "")}`;
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
    if (env.DATABASE_URL &&
        databaseEndpoint(env.TEST_DATABASE_URL) === databaseEndpoint(env.DATABASE_URL)) {
      throw new Error(
        "TEST_DATABASE_URL points to the same database as DATABASE_URL. Refusing to run database-backed tests.",
      );
    }
    return env.TEST_DATABASE_URL;
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  return env.DATABASE_URL;
}