import { normalizeEmail } from './emailNormalization';

type Account = { id: string; email: string | null };
type Dependencies = {
  query: (sql: string, values: any[]) => Promise<{ rows: any[] }>;
  getUserById: (id: string) => Promise<{
    data: { user: { id: string; email?: string | null } | null };
    error: { code?: string; status?: number; message?: string } | null;
  }>;
};

/** Legacy Roster IDs can differ from Auth IDs. Resolve only unique, normalized
 * email links; never infer identity from a name, or migrate either account here. */
export async function verifyMergeSignIns<T extends Account>(accounts: T[], dependencies: Dependencies) {
  if (!accounts.length) return { accounts: [] as T[], identities: [] as [string, string][] };
  const { rows } = await dependencies.query(`
    SELECT u.id AS account_id, u.email, a.id::text AS auth_id
    FROM users u
    JOIN auth.users a ON lower(trim(a.email))=lower(trim(u.email))
    LEFT JOIN auth.users direct ON direct.id::text=u.id
    WHERE u.id=ANY($1::varchar[]) AND u.deleted_at IS NULL
      AND u.email IS NOT NULL AND u.email NOT ILIKE '%@placeholder.roster'
      AND (direct.id IS NULL OR direct.id=a.id)
      AND NOT EXISTS (SELECT 1 FROM users other WHERE other.id<>u.id
        AND other.deleted_at IS NULL AND lower(trim(other.email))=lower(trim(u.email)))
    ORDER BY u.id,a.id`, [accounts.map(a => a.id)]);
  const links = new Map<string, typeof rows>();
  for (const row of rows) links.set(row.account_id, [...(links.get(row.account_id) ?? []), row]);
  const verified = new Map<string, string>();
  let next = 0;
  // Bound provider requests instead of issuing up to 100 at once.
  await Promise.all(Array.from({ length: Math.min(4, accounts.length) }, async () => {
    while (next < accounts.length) {
      const account = accounts[next++];
      const matches = links.get(account.id) ?? [];
      if (matches.length !== 1 || normalizeEmail(matches[0].email) !== normalizeEmail(account.email)) continue;
      const authId = matches[0].auth_id;
      const { data, error } = await dependencies.getUserById(authId);
      if (error) {
        if (error.code === 'user_not_found' ||
            (error.status === 404 && error.message === 'User not found')) continue;
        throw error; // Do not disguise a provider outage or permission failure.
      }
      const authUser = data.user;
      if (authUser && authUser.id === authId && normalizeEmail(authUser.email) === normalizeEmail(account.email))
        verified.set(account.id, authId);
    }
  }));
  const eligible = accounts.filter(account => verified.has(account.id));
  return {
    accounts: eligible,
    identities: eligible.map(account => [account.id, verified.get(account.id)!] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0])),
  };
}
