import { format, addDays, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

const DEFAULT_TIMEZONE = 'America/New_York';

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
  const eventDateObj = typeof eventDate === 'string' ? new Date(eventDate) : eventDate;
  const tz = leagueTimezone || DEFAULT_TIMEZONE;
  
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
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
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
