import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool as TcpPool } from 'pg';
import { pool } from '../db';
import { searchAccountUsers } from '../accountUserMerge';
import { getDatabaseConnectionString } from '../testDatabaseGuard';

const connectionString = getDatabaseConnectionString(process.env, process.argv);
const endpoint = new URL(connectionString);
if (endpoint.hostname !== '127.0.0.1' || endpoint.port !== '55447' ||
    endpoint.pathname !== '/roster_merge_search_test') {
  throw new Error('Account search tests require the isolated local roster_merge_search_test database on port 55447.');
}
// The application pool uses a WebSocket driver; the isolated fixture uses TCP.
const tcpPool = new TcpPool({ connectionString });
const testPool = pool as unknown as { query: typeof tcpPool.query; end: typeof tcpPool.end };
testPool.query = tcpPool.query.bind(tcpPool) as typeof tcpPool.query;
testPool.end = tcpPool.end.bind(tcpPool) as typeof tcpPool.end;

after(async () => { await pool.end(); });

test('registered-account search supports names, email and U ID without widening eligibility', async () => {
  const key = randomUUID().replaceAll('-', '');
  const firstName = `Merge${key}`;
  const id = `${key}_registered`;
  const placeholderId = `${key}_placeholder`;
  const deletedId = `${key}_deleted`;
  const noEmailId = `${key}_noemail`;
  const displayId = `U${Math.floor(100000000 + Math.random() * 900000000)}`;
  const email = `${key}@example.test`;
  try {
    await pool.query(`INSERT INTO users (id, display_id, first_name, last_name, email, deleted_at)
      VALUES ($1, $2, $3, 'Forward', $4, NULL),
        ($5, NULL, $3, 'Forward', $6, NULL),
        ($7, NULL, $3, 'Forward', $8, NOW()),
        ($9, NULL, $3, 'Forward', NULL, NULL)`,
    [id, displayId, firstName, email,
      placeholderId, `${key}@placeholder.roster`,
      deletedId, `${key}_deleted@example.test`, noEmailId]);
    for (const term of [
      firstName,
      `${firstName} Forward`,
      `  ${firstName.toLowerCase()} forward  `,
      email,
      displayId.toLowerCase(),
    ]) {
      const results = await searchAccountUsers(term);
      assert.deepEqual(results.map(user => user.id), [id], `search: ${term}`);
      assert.equal(results[0].displayId, displayId);
      assert.equal(results[0].email, email);
      assert.equal(results[0].name, `${firstName} Forward`);
    }
    assert.deepEqual(await searchAccountUsers(`not_found_${key}`), []);
  } finally {
    await pool.query('DELETE FROM users WHERE id=ANY($1::varchar[])',
      [[id, placeholderId, deletedId, noEmailId]]);
  }
});
