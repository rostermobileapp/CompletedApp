import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('View all stars exposes ranked rows and a back control', async () => {
  const source = await readFile(new URL('./Stats.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-testid="button-view-all-stars"/);
  assert.match(source, /onClick=\{\(\) => setViewMode\('stars'\)\}/);
  assert.match(source, /viewMode === 'stars'/);
  assert.match(source, /data-testid="table-stars-ranking"/);
  assert.match(source, /starLeaderboard\.map\(\(leader, index\)/);
  assert.match(source, /data-testid=\{`row-all-star-\$\{index\}`\}/);
  assert.match(source, /data-testid="button-back-from-stars"/);
  assert.match(source, /onClick=\{handleBackToSummary\}/);
});