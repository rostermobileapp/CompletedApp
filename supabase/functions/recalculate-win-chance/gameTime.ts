/** games.scheduled_at is a league-local wall-clock timestamp, not UTC. */
export function localTimestamp(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export function isFutureGame(scheduledAt: string, now: number, timezone: string): boolean {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(scheduledAt)) return Date.parse(scheduledAt) > now;
  // ISO-format local timestamps sort chronologically within the league's zone.
  return scheduledAt.replace(" ", "T") > localTimestamp(now, timezone);
}
