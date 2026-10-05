import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getWallAuthorLabel } from './wallAuthorLabel';

describe('Wall author label', () => {
  it('labels only U00001 as Founder for league and team posts', () => {
    assert.equal(getWallAuthorLabel('U00001'), 'Founder');
    assert.equal(getWallAuthorLabel('U00001', 'team-id'), 'Founder');
  });

  it('preserves existing labels for all other users', () => {
    for (const displayId of ['U00002', 'U10001', 'u00001', 'U000010', '', null, undefined]) {
      assert.equal(getWallAuthorLabel(displayId), 'Commissioner');
      assert.equal(getWallAuthorLabel(displayId, 'team-id'), 'Team Captain');
    }
  });
});
