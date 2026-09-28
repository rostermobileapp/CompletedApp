import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasOneGoalMargin } from './gameResultType';

describe('overtime score eligibility', () => {
  it('allows exactly one goal between the two teams', () => {
    assert.equal(hasOneGoalMargin(1, 0), true);
    assert.equal(hasOneGoalMargin(2, 3), true);
    assert.equal(hasOneGoalMargin(5, 4), true);
  });

  it('rejects ties, larger margins, and scores that are not final totals', () => {
    assert.equal(hasOneGoalMargin(0, 0), false);
    assert.equal(hasOneGoalMargin(4, 2), false);
    assert.equal(hasOneGoalMargin(null, 1), false);
    assert.equal(hasOneGoalMargin(1, null), false);
    assert.equal(hasOneGoalMargin(-1, 0), false);
    assert.equal(hasOneGoalMargin(1.5, 0.5), false);
  });
});