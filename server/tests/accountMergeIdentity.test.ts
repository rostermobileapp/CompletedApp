import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyMergeSignIns } from '../accountMergeIdentity';

test('a missing sign-in does not hide a valid legacy account with a different Auth ID', async () => {
  const candidates = [
    { id: 'legacy-roster-id', email: ' Person@example.test ', displayId: 'U00071' },
    { id: 'missing-roster-id', email: 'missing@example.test', displayId: 'U00072' },
  ];
  const lookedUp: string[] = [];
  const result = await verifyMergeSignIns(candidates, {
    query: async () => ({ rows: [
      { account_id: candidates[0].id, email: 'person@example.test', auth_id: 'real-sign-in-id' },
      { account_id: candidates[1].id, email: 'missing@example.test', auth_id: 'missing-sign-in-id' },
    ] }),
    getUserById: async id => {
      lookedUp.push(id);
      return id === 'real-sign-in-id' ?
        { data: { user: { id, email: 'person@example.test' } }, error: null } :
        { data: { user: null }, error: { status: 404, code: 'user_not_found' } };
    },
  });
  assert.deepEqual(result.accounts, [candidates[0]]);
  assert.deepEqual(result.identities, [['legacy-roster-id', 'real-sign-in-id']]);
  assert.ok(lookedUp.includes('real-sign-in-id'));
  assert.ok(!lookedUp.includes('legacy-roster-id'));
});

test('ambiguous, stale, and mismatched identity links are excluded', async () => {
  const candidates = [
    { id: 'ambiguous', email: 'a@example.test' },
    { id: 'changed', email: 'old@example.test' },
    { id: 'mismatch', email: 'm@example.test' },
    { id: 'no-login', email: 'n@example.test' },
  ];
  const result = await verifyMergeSignIns(candidates, {
    query: async () => ({ rows: [
      { account_id: 'ambiguous', email: 'a@example.test', auth_id: 'one' },
      { account_id: 'ambiguous', email: 'a@example.test', auth_id: 'two' },
      { account_id: 'changed', email: 'new@example.test', auth_id: 'new' },
      { account_id: 'mismatch', email: 'm@example.test', auth_id: 'wrong' },
    ] }),
    getUserById: async id => ({ data: { user: { id, email: 'different@example.test' } }, error: null }),
  });
  assert.deepEqual(result.accounts, []);
});

test('provider outages and permission failures still produce an explicit error', async () => {
  const candidate = { id: 'roster', email: 'person@example.test' };
  for (const status of [401, 403, 429, 503]) {
    const error = { status, code: 'provider_error' };
    await assert.rejects(verifyMergeSignIns([candidate], {
      query: async () => ({ rows: [{ account_id: 'roster', email: candidate.email, auth_id: 'auth' }] }),
      getUserById: async () => ({ data: { user: null }, error }),
    }), e => e === error);
  }
});
