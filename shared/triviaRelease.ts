import { fromZonedTime } from "date-fns-tz";
import { easternDateKey, shiftDateKey, TRIVIA_TIME_ZONE } from "./trivia";

/** No account or cached-question exception: today's popup starts at noon Eastern. */
export function triviaReleasedDate(now = new Date()): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  const date = easternDateKey(now);
  const noon = fromZonedTime(`${date}T12:00:00`, TRIVIA_TIME_ZONE);
  return now.getTime() >= noon.getTime() ? date : null;
}

/** Recheck at noon/day rollover, or within a minute of a device-clock change. */
export function triviaReleaseNextDelay(now = new Date()): number {
  if (!Number.isFinite(now.getTime())) return 60_000;
  const date = easternDateKey(now);
  const boundary = triviaReleasedDate(now)
    ? fromZonedTime(`${shiftDateKey(date, 1)}T00:00:00`, TRIVIA_TIME_ZONE)
    : fromZonedTime(`${date}T12:00:00`, TRIVIA_TIME_ZONE);
  return Math.max(25, Math.min(60_000, boundary.getTime() - now.getTime()));
}
