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

  test('accepts fresh applications when a finalized manual roster has a vacancy', () => {
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'approval', 11, 12),
      true,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'first_pay', 11, 12),
      true,
    );
  });

  test('keeps finalized full rosters and first-come scrimmages closed', () => {
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'approval', 12, 12),
      false,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'first_pay', 10, 12),
      true,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('roster_confirmed', 'first_come', 11, 12),
      false,
    );
    assert.equal(
      canAcceptFreshScrimmageRequest('cancelled', 'approval', 0, 12),
      false,
    );
  });
});