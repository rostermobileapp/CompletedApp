import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAcceptFreshScrimmageRequest,
  resetsPendingRequestsOnFinalize,
} from '../scrimmageLifecycle.js';

describe('scrimmage finalization lifecycle', () => {
  test('clears pending applications for Manual Approval and Pay to Play', () => {
    assert.equal(resetsPendingRequestsOnFinalize('approval'), true);
    assert.equal(resetsPendingRequestsOnFinalize('first_pay'), true);
    assert.equal(resetsPendingRequestsOnFinalize('first_come'), false);
  });

  test('accepts fresh applications for finalized manual/pay rosters, including full rosters', () => {
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'approval', 11, 12),
      true,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'first_pay', 11, 12),
      true,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'approval', 12, 12),
      true,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'first_pay', 12, 12),
      true,
    );
  });

  test('keeps First to RSVP and cancelled scrimmages closed', () => {
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'first_come', 11, 12),
      false,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'first_come', 12, 12),
      false,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('cancelled', 'approval', 0, 12),
      false,
    );
  });
});