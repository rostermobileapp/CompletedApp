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
export function parseLeagueLocalDateTime(localDateTimeString: string, leagueTimezone: string | null | undefined): Date {
  if (!localDateTimeString) {
    return new Date();
  }
  
  const tz = leagueTimezone || DEFAULT_TIMEZONE;
  
  // If already has timezone designator (Z, +, or -), parse directly
  if (localDateTimeString.endsWith('Z') || 
      localDateTimeString.includes('+') || 
      (localDateTimeString.length > 10 && localDateTimeString.includes('-', 10))) {
    return new Date(localDateTimeString);
  }
  
  // Convert from league local time to UTC using the league timezone
  // This creates a proper UTC instant from a league-local time string
  return fromZonedTime(localDateTimeString, tz);
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
