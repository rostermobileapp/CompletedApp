import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareScheduleEvents,
  isScrimmageTimeTbd,
  parseScrimmageDateTime,
} from '../../client/src/lib/scrimmageDateTime.js';
import {
  addCalendarMonthsInTimezone,
  formatDateInTimezone,
  generateMonthlyRecurrenceDates,
} from '../dateUtils.js';

describe('desktop schedule scrimmage ordering', () => {
  test('interleaves Time TBD scrimmages with games by calendar day', () => {
    const events = [
      {
        id: 'scrimmage-later',
        date: parseScrimmageDateTime('2026-10-24T00:00:00'),
        timeTbd: true,
      },
      {
        id: 'game-middle',
        date: new Date(2026, 9, 20, 19, 0),
        timeTbd: false,
      },
      {
        id: 'scrimmage-earlier',
        date: parseScrimmageDateTime('2026-10-18T00:00:00'),
        timeTbd: true,
      },
    ].sort(compareScheduleEvents);

    assert.deepEqual(
      events.map((event) => event.id),
      ['scrimmage-earlier', 'game-middle', 'scrimmage-later'],
    );
  });

  test('places a Time TBD scrimmage after timed events on the same day', () => {
    const events = [
      {
        id: 'scrimmage-tbd',
        date: parseScrimmageDateTime('2026-10-20T00:00:00'),
        timeTbd: isScrimmageTimeTbd(true, '2026-10-20T00:00:00'),
      },
      {
        id: 'game-evening',
        date: new Date(2026, 9, 20, 21, 0),
        timeTbd: false,
      },
    ].sort(compareScheduleEvents);

    assert.deepEqual(
      events.map((event) => event.id),
      ['game-evening', 'scrimmage-tbd'],
    );
  });
});

describe('calendar-month scrimmage recurrence', () => {
  const timezone = 'America/New_York';
  const formatLocal = (date: Date) =>
    formatDateInTimezone(date, "yyyy-MM-dd'T'HH:mm:ss", timezone);

  test('preserves an ordinary day and wall-clock time across DST', () => {
    const start = '2026-01-15T20:30:00';

    assert.equal(
      formatLocal(addCalendarMonthsInTimezone(start, 2, timezone)),
      '2026-03-15T20:30:00',
    );
  });

  test('clamps short months without losing the original day anchor', () => {
    const start = '2026-01-31T20:00:00';

    assert.deepEqual(
      [0, 1, 2, 3].map((offset) =>
        formatLocal(addCalendarMonthsInTimezone(start, offset, timezone)),
      ),
      [
        '2026-01-31T20:00:00',
        '2026-02-28T20:00:00',
        '2026-03-31T20:00:00',
        '2026-04-30T20:00:00',
      ],
    );
  });

  test('uses February 29 in a leap year and resumes the anchor afterward', () => {
    const start = '2028-01-30T18:45:00';

    assert.deepEqual(
      [1, 2].map((offset) =>
        formatLocal(addCalendarMonthsInTimezone(start, offset, timezone)),
      ),
      ['2028-02-29T18:45:00', '2028-03-30T18:45:00'],
    );
  });

  test('includes an evening occurrence on the selected final local day', () => {
    const dates = generateMonthlyRecurrenceDates(
      '2026-10-31T20:00:00',
      12,
      '2026-11-30',
      'America/Los_Angeles',
    );

    assert.deepEqual(
      dates.map((date) =>
        formatDateInTimezone(
          date,
          "yyyy-MM-dd'T'HH:mm:ss",
          'America/Los_Angeles',
        ),
      ),
      ['2026-10-31T20:00:00', '2026-11-30T20:00:00'],
    );
  });
});