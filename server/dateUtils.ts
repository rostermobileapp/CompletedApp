import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const DEFAULT_TIMEZONE = 'America/New_York';

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
