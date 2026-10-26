import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGameScheduleChangeMessage,
  hasGameScheduleDetailsChanged,
  hasGameScheduleTimeChanged,
  hasGameVenueChanged,
} from './gameScheduleTime';

describe('game schedule change detection', () => {
  it('does not treat PostgreSQL and ISO separators as a schedule change', () => {
    assert.equal(
      hasGameScheduleTimeChanged(
        { scheduledAt: '2026-10-30 19:30:00' },
        { scheduledAt: '2026-10-30T19:30:00' },
      ),
      false,
    );
  });

  it('detects a changed game date', () => {
    assert.equal(
      hasGameScheduleTimeChanged(
        { scheduledAt: '2026-10-30 19:30:00' },
        { scheduledAt: '2026-10-31 19:30:00' },
      ),
      true,
    );
  });

  it('detects a changed game time', () => {
    assert.equal(
      hasGameScheduleTimeChanged(
        { scheduledAt: '2026-10-30 19:30:00' },
        { scheduledAt: '2026-10-30 20:00:00' },
      ),
      true,
    );
  });

  it('detects a changed venue even when the scheduled time is unchanged', () => {
    assert.equal(
      hasGameScheduleDetailsChanged(
        { scheduledAt: '2026-10-30 19:30:00', venue: 'Rink A' },
        { scheduledAt: '2026-10-30 19:30:00', venue: 'Rink B' },
      ),
      true,
    );
  });

  it('ignores whitespace-only venue edits', () => {
    assert.equal(
      hasGameVenueChanged(
        { venue: 'Rink A' },
        { venue: ' Rink A ' },
      ),
      false,
    );
  });

  it('detects a venue changing to TBD', () => {
    assert.equal(
      hasGameScheduleDetailsChanged(
        { scheduledAt: '2026-10-30 19:30:00', venue: 'Rink A' },
        { scheduledAt: '2026-10-30 19:30:00', venue: null },
      ),
      true,
    );
  });

  it('mentions the new venue in the notification message', () => {
    assert.equal(
      buildGameScheduleChangeMessage('Away at Home', {
        timeChanged: false,
        venueChanged: true,
        newVenue: 'Rink B',
      }),
      'Away at Home venue is now Rink B.',
    );
  });

  it('includes both changed values in one notification message', () => {
    assert.equal(
      buildGameScheduleChangeMessage('Away at Home', {
        timeChanged: true,
        venueChanged: true,
        newScheduledTime: 'Oct 30, 2026 at 7:30 PM',
        newVenue: 'Rink B',
      }),
      'Away at Home is now scheduled for Oct 30, 2026 at 7:30 PM at Rink B.',
    );
  });
});
