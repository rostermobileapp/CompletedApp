import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTeamJerseyNumber } from './teamJerseyNumber';

describe('team jersey number resolution', () => {
  it('uses the assigned league number instead of a blank captain row', () => {
    assert.equal(resolveTeamJerseyNumber(null, 24, true), 24);
  });

  it('uses the league assignment even when a stale direct number exists', () => {
    assert.equal(resolveTeamJerseyNumber(8, 24, true), 24);
    assert.equal(resolveTeamJerseyNumber(null, 0, true), 0);
  });

  it('keeps the direct number if the league number is missing or the team is standalone', () => {
    assert.equal(resolveTeamJerseyNumber(8, null, true), 8);
    assert.equal(resolveTeamJerseyNumber(8, undefined, false), 8);
  });
});