/** The real actor is required for both commissioner and global support access. */
export function hasAccountMergeOperatorContext(context: {
  demoContext?: unknown;
  user?: { claims?: { email?: string; sub?: string } };
  realActor?: { id?: string };
}): boolean {
  return !context.demoContext &&
    context.user?.claims?.email?.toLowerCase() === 'tobin@rosterhockey.com' &&
    !!context.user.claims.sub &&
    context.realActor?.id === context.user.claims.sub;
}

export function hasRealAccountMergeActor(context: {
  demoContext?: unknown;
  user?: { claims?: { sub?: string } };
  realActor?: { id?: string };
}): boolean {
  return !context.demoContext && !!context.user?.claims?.sub &&
    context.realActor?.id === context.user.claims.sub;
}

type QueryClient = { query: (text: string, params?: any[]) => Promise<any> };

/** Check again in the transaction; route authorization alone can become stale. */
export async function assertAccountMergeAccess(client: QueryClient, operatorId: string, leagueId?: string, accountIds?: string[]) {
  const operator = (await client.query('SELECT email FROM users WHERE id=$1 AND deleted_at IS NULL', [operatorId])).rows[0];
  if (!operator) throw new Error('An active merge operator is required.');
  if (!leagueId) {
    if (operator.email?.toLowerCase() !== 'tobin@rosterhockey.com') throw new Error('Global account support access required.');
    return;
  }
  const league = (await client.query('SELECT commissioner_id FROM leagues WHERE id=$1', [leagueId])).rows[0];
  if (league?.commissioner_id !== operatorId) throw new Error('Only the commissioner of this league can combine these accounts.');
  if (accountIds?.length) {
    const eligible = await client.query(`SELECT DISTINCT u.id FROM users u JOIN league_memberships lm ON lm.user_id=u.id
      WHERE lm.league_id=$1 AND u.id=ANY($2::varchar[]) AND u.deleted_at IS NULL
        AND u.email IS NOT NULL AND u.email NOT ILIKE '%@placeholder.roster' AND u.display_id ~ '^U[0-9]{5}$'`,
    [leagueId, accountIds]);
    if (eligible.rows.length !== new Set(accountIds).size) throw new Error('Both accounts must be active registered U accounts in your league.');
  }
}