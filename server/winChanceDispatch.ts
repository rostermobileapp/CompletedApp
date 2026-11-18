type VaultConfig = { project_url: string | null; secret_key: string | null };
type QueryConfig = (text: string) => Promise<{ rows: VaultConfig[] }>;

function dispatchError(code: string): Error & { code: string } {
  return Object.assign(new Error("Win-chance dispatch failed"), { code });
}

/**
 * Reuse the same Vault configuration as the SQL dispatcher. The legacy
 * service-role JWT used for database access is not an auth:"secret" API key.
 * Never return credentials or include remote response bodies in errors.
 */
export async function dispatchWinChance(
  body: Record<string, string | string[]>,
  dependencies: {
    query: QueryConfig;
    projectUrl: string | undefined;
    fetch?: typeof fetch;
  },
): Promise<void> {
  const { rows } = await dependencies.query(`
    SELECT
      (SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'win_chance_project_url' LIMIT 1) AS project_url,
      (SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'win_chance_secret_key' LIMIT 1) AS secret_key
  `);
  const config = rows[0];
  let project: URL;
  try {
    project = new URL(config?.project_url?.trim() ?? "");
    const expected = new URL(dependencies.projectUrl ?? "");
    if (project.protocol !== "https:" || project.origin !== expected.origin
      || project.username || project.password || project.pathname !== "/"
      || project.search || project.hash) throw new Error();
  } catch {
    throw dispatchError("WIN_CHANCE_CONFIG");
  }
  const key = config?.secret_key?.trim();
  if (!key?.startsWith("sb_secret_")) throw dispatchError("WIN_CHANCE_CONFIG");

  let response: Response;
  try {
    response = await (dependencies.fetch ?? fetch)(
      new URL("/functions/v1/recalculate-win-chance", project),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    throw dispatchError("WIN_CHANCE_TRANSPORT");
  }
  if (!response.ok) throw dispatchError(`WIN_CHANCE_HTTP_${response.status}`);
  // A queued request or an HTTP 200 without confirmed completion is not success.
  const result = await response.json().catch(() => null);
  if (result?.ok !== true) throw dispatchError("WIN_CHANCE_RESPONSE");
}
