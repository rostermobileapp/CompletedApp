import { fromZonedTime } from "date-fns-tz";

export const BEER_LOGGING_WINDOW_BEFORE_MS = 60 * 60 * 1000;
export const BEER_LOGGING_WINDOW_AFTER_MS = 4 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = "America/New_York";

function getScheduledStartMs(scheduledAt: Date | string, timezone?: string | null): number {
  if (scheduledAt instanceof Date) return scheduledAt.getTime();
  if (!scheduledAt.trim()) return Number.NaN;

  const normalized = scheduledAt.trim().replace(" ", "T");
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  try {
    const scheduledDate = hasExplicitTimezone
      ? new Date(normalized)
      : fromZonedTime(normalized, timezone || DEFAULT_TIMEZONE);
    return scheduledDate.getTime();
  } catch {
    return Number.NaN;
  }
}

export function isBeerLoggingWindowOpen(
  scheduledAt: Date | string,
  timezone?: string | null,
  nowMs = Date.now(),
): boolean {
  const scheduledStartMs = getScheduledStartMs(scheduledAt, timezone);
  if (!Number.isFinite(scheduledStartMs) || !Number.isFinite(nowMs)) return false;

  return nowMs >= scheduledStartMs - BEER_LOGGING_WINDOW_BEFORE_MS
    && nowMs <= scheduledStartMs + BEER_LOGGING_WINDOW_AFTER_MS;
}