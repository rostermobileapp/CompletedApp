import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppleBackfillArgs, backfillAppleAccounts } from '../revenueCatAppleBackfill';

test('backfill requires explicit scope and defaults to no writes', () => {
  assert.deepEqual(parseAppleBackfillArgs(['--user', 'u00002']), { user: 'U00002', all: false, apply: false });
  assert.deepEqual(parseAppleBackfillArgs(['--all', '--apply']), { user: undefined, all: true, apply: true });
  for (const args of [[], ['--apply'], ['--all', '--user', 'U00002'], ['--user', 'invalid'], ['--user', 'U00002', '--force']]) {
    assert.throws(() => parseAppleBackfillArgs(args));
  }
});

test('preview preserves old claims, avoids unknown get-or-create customers and never selects apply', async () => {
  const reports: any[] = [];
  const refreshes: any[] = [];
  const result = await backfillAppleAccounts([
    { id: 'old', displayId: 'U00001', hasAppleLink: true },
    { id: 'unknown', displayId: 'U00002', hasAppleLink: false },
    { id: 'active', displayId: 'U00003', hasAppleLink: false },
  ], false, {
    loginId: id => id,
    customerExists: async id => id === 'active',
    refresh: async input => { refreshes.push(input); return { verified: true, role: 'player_pro', expiresAt: '2099-01-01' }; },
    report: result => reports.push(result),
  });
  assert.deepEqual(result, { checked: 3, failed: 0 });
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].dryRun, true);
  assert.deepEqual(reports.map(r => r.status), ['existing_link_preserved', 'no_existing_provider_customer', 'verified_candidate']);
});

test('apply re-verifies each account and isolates conflicts, outages and inactive users', async () => {
  const reports: any[] = [];
  const accounts = ['conflict', 'outage', 'inactive', 'active'].map((id, index) =>
    ({ id, displayId: `U0000${index}`, hasAppleLink: false }));
  const result = await backfillAppleAccounts(accounts, true, {
    loginId: id => id, customerExists: async () => true,
    refresh: async input => {
      assert.equal(input.dryRun, false);
      if (input.userId === 'conflict') throw Object.assign(new Error('Private details'), { status: 409 });
      if (input.userId === 'outage') throw Object.assign(new Error('Private details'), { status: 503 });
      if (input.userId === 'inactive') return { verified: false };
      return { verified: true, role: 'player_pro' };
    },
    report: result => reports.push(result),
  });
  assert.deepEqual(result, { checked: 4, failed: 2 });
  assert.deepEqual(reports.map(r => r.status), ['ownership_conflict', 'verification_unavailable', 'inactive', 'applied']);
  assert.ok(!JSON.stringify(reports).includes('Private details'));
});
