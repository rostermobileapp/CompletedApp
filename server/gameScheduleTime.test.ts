import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasGameScheduleTimeChanged } from './gameScheduleTime';

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
});
