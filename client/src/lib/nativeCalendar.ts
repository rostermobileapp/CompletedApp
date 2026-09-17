import { fromZonedTime } from "date-fns-tz";
import { NativelyCalendar } from "natively";

export type NativeCalendarResponse = {
  status?: string;
  data?: any;
  error?: string;
};

export type NativeCalendarInfo = {
  id: string;
  name: string;
};

export type NativeCalendarEvent = {
  sourceKey: string;
  title: string;
  start: Date;
  end: Date;
  timezone: string;
  description?: string;
  location?: string;
};

export class NativeCalendarError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message || code);
    this.name = "NativeCalendarError";
    this.code = code;
  }
}

const nativeCalendar = new NativelyCalendar();

function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent || "";
  if (
    userAgent.includes("Natively/iOS") ||
    userAgent.includes("Natively/iPadOS") ||
    userAgent.includes("Natively/Android")
  ) {
    return true;
  }

  if (typeof (window as any).$agent !== "undefined") return true;

  try {
    const capacitor = (window as any).Capacitor;
    return (
      capacitor &&
      typeof capacitor.getPlatform === "function" &&
      ["ios", "android"].includes(capacitor.getPlatform())
    );
  } catch {
    return false;
  }
}

export function isNativeCalendarAvailable(): boolean {
  return isNativeShell() && typeof (window as any).natively !== "undefined";
}

function withTimeout<T>(
  callback: (resolve: (value: T) => void) => void,
  timeoutMs = 15000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new NativeCalendarError("native_bridge_timeout", "The device calendar did not respond. Please try again."));
    }, timeoutMs);

    try {
      callback((value) => {
        window.clearTimeout(timer);
        resolve(value);
      });
    } catch (error) {
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

function ensureNativeBridge(): void {
  if (!isNativeCalendarAvailable()) {
    throw new NativeCalendarError(
      "native_calendar_unavailable",
      "Device calendar access is available in the Roster mobile app.",
    );
  }
}

function ensureSuccess(response: NativeCalendarResponse): any {
  if (response?.status !== "SUCCESS") {
    throw new NativeCalendarError(
      response?.error || "native_calendar_failure",
      getCalendarErrorMessage(response?.error),
    );
  }
  return response.data;
}

export function getCalendarErrorMessage(error?: string): string {
  switch (error) {
    case "calendar_permission_missing":
      return "Calendar permission is off. Allow calendar access in your device settings, then try again.";
    case "no_available_calendars":
      return "No calendars are available on this device.";
    case "cannot_retrieve_calendars":
      return "We could not retrieve your device calendars. Please try again.";
    case "add_calendar_event_failure":
      return "The event could not be added to your device calendar. Please try again.";
    case "start_date_missing":
    case "end_date_missing":
    case "timezone_missing":
      return "This event is missing the date or timezone information needed for a calendar export.";
    case "native_bridge_timeout":
      return "The device calendar did not respond. Please try again.";
    default:
      return error
        ? `The device calendar could not complete this request (${error}).`
        : "The device calendar could not complete this request.";
  }
}

export async function retrieveDeviceCalendars(): Promise<NativeCalendarInfo[]> {
  ensureNativeBridge();

  const data = ensureSuccess(
    await withTimeout<NativeCalendarResponse>((resolve) => {
      nativeCalendar.retrieveCalendars(resolve);
    }),
  );

  if (!data || typeof data !== "object") {
    throw new NativeCalendarError("no_available_calendars", getCalendarErrorMessage("no_available_calendars"));
  }

  const calendars = Object.entries(data)
    .map(([id, name]) => ({ id, name: String(name || id) }))
    .filter((calendar) => calendar.id.length > 0);

  if (calendars.length === 0) {
    throw new NativeCalendarError("no_available_calendars", getCalendarErrorMessage("no_available_calendars"));
  }

  return calendars;
}

export async function createDeviceCalendarEvent(
  event: NativeCalendarEvent,
  calendarId: string,
): Promise<NativeCalendarResponse["data"]> {
  ensureNativeBridge();

  if (
    !(event.start instanceof Date) ||
    Number.isNaN(event.start.getTime()) ||
    !(event.end instanceof Date) ||
    Number.isNaN(event.end.getTime()) ||
    event.end.getTime() <= event.start.getTime()
  ) {
    throw new NativeCalendarError("invalid_event_dates", "This event has invalid calendar dates.");
  }

  const response = await withTimeout<NativeCalendarResponse>((resolve) => {
    nativeCalendar.createCalendarEvent(
      event.title,
      event.end,
      event.start,
      event.timezone,
      calendarId,
      event.description,
      resolve,
    );
  });

  return ensureSuccess(response);
}

function parseWallClock(value: string | Date, timezone: string): Date {
  if (value instanceof Date) return new Date(value.getTime());

  const normalized = value.trim().replace(" ", "T");
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return new Date(normalized);
  }

  return fromZonedTime(normalized, timezone);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function eventDescription(event: any): string | undefined {
  const pieces = [
    event.description,
    event.notes,
    event.opponentName ? `Opponent: ${event.opponentName}` : null,
    event.teamAssignment ? `Assigned team: ${event.teamAssignment === "light" ? "Light" : "Dark"}` : null,
    event.location || event.venue ? `Location: ${event.location || event.venue}` : null,
  ].filter(Boolean);

  return pieces.length > 0 ? pieces.join("\n") : undefined;
}

/**
 * Converts one item from the Schedule & Results response into the payload
 * expected by the native calendar bridge. Times without an offset are
 * interpreted as wall-clock values in the event's persisted timezone.
 */
export function toNativeCalendarEvent(event: any): NativeCalendarEvent | null {
  if (!event?.id || !event?.scheduledAt) return null;
  if (event.type === "scrimmage" && event.timeTbd) return null;

  const timezone = event.timezone || event.leagueTimezone || localTimezone();
  const start = parseWallClock(event.scheduledAt, timezone);
  if (Number.isNaN(start.getTime())) return null;

  let end: Date;
  if (event.endTime) {
    end = parseWallClock(event.endTime, timezone);
  } else {
    end = addHours(start, event.type === "reminder" || event.type === "team-event" ? 1 : 2);
  }

  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    end = addHours(start, 1);
  }

  let title = event.title || "Roster event";
  if (event.type === "game" || event.type === "substitute") {
    const homeTeam = event.homeTeam?.name;
    const awayTeam = event.awayTeam?.name || event.opponentName;
    const opponent = event.homeTeam?.id === event.activeTeamId ? awayTeam : homeTeam || awayTeam;
    title = opponent ? `Game vs ${opponent}` : "Roster game";
    if (event.type === "substitute" || event.isSubstitute) title = `Subbing: ${title}`;
  }

  return {
    sourceKey: `${event.type}:${event.id}`,
    title,
    start,
    end,
    timezone,
    description: eventDescription(event),
    location: event.location || event.venue || undefined,
  };
}

const STORAGE_PREFIX = "roster-native-calendar";

function storageKey(ownerKey: string | undefined, suffix: string): string {
  return `${STORAGE_PREFIX}:${ownerKey || "anonymous"}:${suffix}`;
}

export function getSavedCalendarId(ownerKey?: string): string | null {
  try {
    return localStorage.getItem(storageKey(ownerKey, "selected"));
  } catch {
    return null;
  }
}

export function saveCalendarId(ownerKey: string | undefined, calendarId: string): void {
  try {
    localStorage.setItem(storageKey(ownerKey, "selected"), calendarId);
  } catch {
    // A private browsing context may not allow localStorage. Export still works.
  }
}

export function getExportedEventKey(ownerKey: string | undefined, calendarId: string, sourceKey: string): string {
  return storageKey(ownerKey, `exported:${calendarId}:${sourceKey}`);
}

export function hasExportedEvent(ownerKey: string | undefined, calendarId: string, sourceKey: string): boolean {
  try {
    return localStorage.getItem(getExportedEventKey(ownerKey, calendarId, sourceKey)) === "1";
  } catch {
    return false;
  }
}

export function markEventExported(ownerKey: string | undefined, calendarId: string, sourceKey: string): void {
  try {
    localStorage.setItem(getExportedEventKey(ownerKey, calendarId, sourceKey), "1");
  } catch {
    // A private browsing context may not allow localStorage. Export still works.
  }
}