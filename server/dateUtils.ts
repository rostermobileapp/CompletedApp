import { format, addDays, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Parse a league-local datetime string into a proper UTC Date object.
 * This should be used when you need to do date arithmetic or comparisons.
 * 
 * @param localDateTimeString - A datetime string like "2025-01-15T18:00" representing league local time
 * @param leagueTimezone - The IANA timezone of the league (e.g., 'America/New_York')
 * @returns A Date object representing the correct UTC instant
 * 
 * @example
 * // If league is EST (UTC-5), "2025-01-15T18:00" (6 PM EST) becomes:
 * // Date representing 2025-01-15T23:00:00Z (11 PM UTC)
 * parseLeagueLocalDateTime("2025-01-15T18:00", "America/New_York")
 */
export function parseLeagueLocalDateTime(
  localDateTime: Date | string,
  leagueTimezone: string | null | undefined,
): Date {
  if (!localDateTime) {
    return new Date();
  }

  if (localDateTime instanceof Date) {
    return localDateTime;
  }
  
  const tz = leagueTimezone || DEFAULT_TIMEZONE;
  
  // If already has timezone designator (Z, +, or -), parse directly
  if (localDateTime.endsWith('Z') ||
      localDateTime.includes('+') ||
      (localDateTime.length > 10 && localDateTime.includes('-', 10))) {
    return new Date(localDateTime);
  }
  
  // Convert from league local time to UTC using the league timezone
  // This creates a proper UTC instant from a league-local time string
  return fromZonedTime(localDateTime, tz);
}

export function getLeagueLocalDateKey(
  dateTime: Date | string,
  leagueTimezone: string | null | undefined,
): string {
  const tz = leagueTimezone || DEFAULT_TIMEZONE;
  const date = typeof dateTime === 'string'
    ? parseLeagueLocalDateTime(dateTime, tz)
    : dateTime;
  return formatInTimeZone(date, tz, 'yyyy-MM-dd');
}

/**
 * Date-only recurrence boundaries are stored in a timestamp-without-time-zone
 * column. Drizzle returns those values as Date objects whose UTC components
 * represent the persisted wall-clock date, so do not shift them through the
 * league timezone when recovering the selected date key.
 */
export function getStoredDateOnlyKey(dateTime: Date | string): string {
  if (dateTime instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${dateTime.getUTCFullYear()}-${pad(dateTime.getUTCMonth() + 1)}-${pad(dateTime.getUTCDate())}`;
  }

  const match = dateTime.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

/**
 * Advance from the original league-local wall-clock value by whole calendar
 * months. The original day remains the anchor: a 31st occurrence clamps to
 * February's final day, then returns to the 31st in March.
 */
export function addCalendarMonthsInTimezone(
  dateTime: Date | string,
  monthOffset: number,
  leagueTimezone: string | null | undefined,
): Date {
  const tz = leagueTimezone || DEFAULT_TIMEZONE;
  const date = typeof dateTime === 'string'
    ? parseLeagueLocalDateTime(dateTime, tz)
    : dateTime;
  const localParts = formatInTimeZone(date, tz, 'yyyy-MM-dd-HH-mm-ss-SSS')
    .split('-')
    .map(Number);
  const [year, month, day, hour, minute, second, millisecond] = localParts;
  const targetMonthIndex = month - 1 + Math.trunc(monthOffset);
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const finalDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(day, finalDayOfTargetMonth);
  const pad = (part: number, width = 2) => String(part).padStart(width, '0');
  const targetLocalDateTime =
    `${targetYear}-${pad(targetMonth + 1)}-${pad(targetDay)}` +
    `T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millisecond, 3)}`;

  return fromZonedTime(targetLocalDateTime, tz);
}

export function generateMonthlyRecurrenceDates(
  startDateTime: Date | string,
  maxOccurrences: number,
  recurrenceEndDate: Date | string | null | undefined,
  leagueTimezone: string | null | undefined,
): Date[] {
  const dates: Date[] = [];
  const recurrenceEndDateKey = recurrenceEndDate
    ? getStoredDateOnlyKey(recurrenceEndDate)
    : null;

  for (let monthOffset = 0; dates.length < maxOccurrences; monthOffset++) {
    const occurrence = addCalendarMonthsInTimezone(
      startDateTime,
      monthOffset,
      leagueTimezone,
    );
    if (
      recurrenceEndDateKey &&
      getLeagueLocalDateKey(occurrence, leagueTimezone) > recurrenceEndDateKey
    ) {
      break;
    }
    dates.push(occurrence);
  }

  return dates;
}

/**
 * Format a league-local datetime string for storage.
 * Normalizes the format to ensure consistent storage.
 * 
 * @param dateTimeString - A datetime string like "2025-01-15T18:00"
 * @returns A normalized datetime string
 */
export function normalizeLocalDateTimeString(dateTimeString: string): string {
  if (!dateTimeString) {
    return new Date().toISOString().slice(0, 19);
  }
  
  // Remove timezone designator if present - we want to store league-local time
  if (dateTimeString.endsWith('Z')) {
    return dateTimeString.slice(0, -1);
  }
  
  // Remove timezone offset if present (e.g., +05:00 or -05:00)
  const tzOffsetMatch = dateTimeString.match(/[+-]\d{2}:\d{2}$/);
  if (tzOffsetMatch) {
    return dateTimeString.slice(0, -6);
  }
  
  return dateTimeString;
}

/**
 * Check if an event should still be visible based on league timezone.
 * Events remain visible until noon the day after they're scheduled.
 * @param eventDate - The date/time of the event (in UTC)
 * @param leagueTimezone - The IANA timezone of the league (e.g., 'America/New_York')
 * @returns true if the event should still be shown, false if it should be hidden
 */
export function shouldShowEventBasedOnLeagueNoon(
  eventDate: Date | string,
  leagueTimezone: string
): boolean {
  const now = new Date();
  const tz = leagueTimezone || DEFAULT_TIMEZONE;
  
  // If eventDate is a string (league-local datetime), use parseLeagueLocalDateTime to correctly
  // interpret it in the league's timezone context
  const eventDateObj = typeof eventDate === 'string' 
    ? parseLeagueLocalDateTime(eventDate, tz) 
    : eventDate;
  
  try {
    // Step 1: Convert the event time (UTC) to the league's local timezone
    const eventInLocalTz = toZonedTime(eventDateObj, tz);
    
    // Step 2: Add 1 day to get to the next day
    const nextDay = addDays(eventInLocalTz, 1);
    
    // Step 3: Set the time to noon (12:00:00.000)
    const noonNextDay = setMilliseconds(setSeconds(setMinutes(setHours(nextDay, 12), 0), 0), 0);
    
    // Step 4: Convert back to UTC for comparison
    const noonNextDayUTC = fromZonedTime(noonNextDay, tz);
    
    // Show the event if current time is before noon the next day in league timezone
    return now.getTime() < noonNextDayUTC.getTime();
  } catch (error) {
    console.warn(`Failed to calculate visibility for timezone ${tz}:`, error);
    // Fallback: show events from the last 36 hours
    const hoursAgo36 = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    return eventDateObj >= hoursAgo36;
  }
}

export function formatDateInTimezone(
  date: Date | string,
  formatStr: string,
  timezone?: string | null
): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  
  // If date is a string (league-local datetime), use parseLeagueLocalDateTime to correctly
  // interpret it in the league's timezone context before formatting
  // If date is already a Date object, use it directly (assumed to be UTC)
  const dateObj = typeof date === 'string' 
    ? parseLeagueLocalDateTime(date, tz) 
    : date;
  
  try {
    return formatInTimeZone(dateObj, tz, formatStr);
  } catch (error) {
    console.warn(`Failed to format date with timezone ${tz}, falling back to default:`, error);
    return formatInTimeZone(dateObj, DEFAULT_TIMEZONE, formatStr);
  }
}

export function formatScrimmageDateTime(
  dateTime: Date | string,
  timezone?: string | null
): string {
  return formatDateInTimezone(dateTime, 'EEE, MMM d @ h:mm a', timezone);
}

export function formatFullDateTime(
  dateTime: Date | string,
  timezone?: string | null
): string {
  return formatDateInTimezone(dateTime, "MMM d, yyyy 'at' h:mm a", timezone);
}

export function formatDayAndTime(
  dateTime: Date | string,
  timezone?: string | null
): { date: string; time: string } {
  return {
    date: formatDateInTimezone(dateTime, 'EEEE, MMMM d', timezone),
    time: formatDateInTimezone(dateTime, 'h:mm a', timezone),
  };
}

export function formatShortDayAndTime(
  dateTime: Date | string,
  timezone?: string | null
): { date: string; time: string } {
  return {
    date: formatDateInTimezone(dateTime, 'MMM d', timezone),
    time: formatDateInTimezone(dateTime, 'h:mm a', timezone),
  };
}
