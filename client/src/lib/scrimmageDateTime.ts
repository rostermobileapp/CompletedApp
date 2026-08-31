/**
 * Scrimmage date_time values are stored as league-local wall-clock values in a
 * PostgreSQL timestamp-without-time-zone column. Parse them without allowing
 * the browser's ISO parser to reinterpret the clock value as UTC.
 */
export function parseScrimmageDateTime(value: string | Date): Date {
  if (value instanceof Date) return value;

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z)?$/,
  );

  if (!match) return new Date(value);

  const [, year, month, day, hour, minute, second = '0'] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

export function splitScrimmageDateTime(value: string | Date): { date: string; time: string } {
  const parsed = parseScrimmageDateTime(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };

  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
}

/**
 * Honor the persisted flag whenever the API supplies it. Older API deployments
 * did not include timeTbd in invite payloads, so use the midnight date anchor
 * as a compatibility fallback only when the flag is absent.
 */
export function isScrimmageTimeTbd(
  timeTbd: unknown,
  dateTime?: string | Date | null,
): boolean {
  if (timeTbd === true) return true;
  if (timeTbd === false) return false;
  if (!dateTime) return false;

  return splitScrimmageDateTime(dateTime).time === '00:00';
}