import { fromZonedTime } from "date-fns-tz";
import { NativelyCalendar, NativelyStorage } from "natively";
import { parseScrimmageDateTime } from "./scrimmageDateTime";

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

export type NativeCalendarEventRecord = {
  sourceKey: string;
  calendarId: string;
  fingerprint?: string;
  nativeEventId?: string;
  legacy?: boolean;
};

export type NativeCalendarEventState =
  | "not_exported"
  | "exported"
  | "legacy"
  | "changed"
  | "stale";

export type NativeCalendarMutationProvider = {
  updateEvent?: (
    nativeEventId: string,
    event: NativeCalendarEvent,
    calendarId: string,
  ) => Promise<unknown> | unknown;
  deleteEvent?: (
    nativeEventId: string,
    calendarId: string,
  ) => Promise<unknown> | unknown;
};

export type NativeCalendarSyncResult = {
  status: "synced" | "changes_pending" | "nothing_to_do";
  createdEvents: string[];
  updatedEvents: string[];
  removedEvents: string[];
  staleEvents: string[];
  failedEvents: string[];
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
const nativeStorage = new NativelyStorage();
let registeredMutationProvider: NativeCalendarMutationProvider | null = null;

declare global {
  interface Window {
    rosterNativeCalendarProvider?: NativeCalendarMutationProvider;
  }
}

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
    case "update_calendar_event_failure":
      return "The device calendar event could not be updated. The Roster schedule remains the source of truth.";
    case "delete_calendar_event_failure":
      return "The cancelled device calendar event could not be removed. The Roster schedule remains the source of truth.";
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

/**
 * An optional provider can be registered by a calendar integration that
 * supports editable event identifiers. The current Natively SDK does not
 * provide these methods, so the default path remains a safe one-way export.
 */
export function registerNativeCalendarMutationProvider(
  provider: NativeCalendarMutationProvider | null,
): void {
  registeredMutationProvider = provider;
}

export function getNativeCalendarMutationProvider(): NativeCalendarMutationProvider | null {
  if (registeredMutationProvider) return registeredMutationProvider;
  if (typeof window !== "undefined" && window.rosterNativeCalendarProvider) {
    return window.rosterNativeCalendarProvider;
  }
  return null;
}

export function getNativeCalendarCapabilities(): {
  canUpdate: boolean;
  canDelete: boolean;
} {
  const provider = getNativeCalendarMutationProvider();
  return {
    canUpdate: typeof provider?.updateEvent === "function",
    canDelete: typeof provider?.deleteEvent === "function",
  };
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

/**
 * Converts the consolidated /api/user/calendar response into the events that
 * belong in the user's selected device calendar:
 * - games for teams where the user has an approved membership
 * - team events for those same teams, regardless of RSVP state
 * - scrimmages only when the user has an approved player request
 * - personal reminders and approved substitute games owned by the user
 * This is shared by the Calendar page and the profile's initial sync action so
 * selecting a calendar always exports the same event set.
 */
export function toNativeCalendarEventsFromCalendarData(data: any): NativeCalendarEvent[] {
  const userTeams = Array.isArray(data?.userTeams) ? data.userTeams : [];
  const userTeamIds = new Set(userTeams.map((team: any) => team?.id).filter(Boolean));
  const allGames = Array.isArray(data?.allGames) ? data.allGames : [];
  const scrimmageRequests = Array.isArray(data?.scrimmageRequests)
    ? data.scrimmageRequests
    : [];
  const substitutions = Array.isArray(data?.mySubstitutions)
    ? data.mySubstitutions
    : [];
  const personalReminders = Array.isArray(data?.personalReminders)
    ? data.personalReminders
    : [];
  const teamEvents = Array.isArray(data?.teamEvents) ? data.teamEvents : [];

  const scrimmages = [
    ...scrimmageRequests
      .filter((request: any) => request?.status === "approved")
      .map((request: any) => ({
        ...request.scrimmage,
        type: "scrimmage",
        scheduledAt: parseScrimmageDateTime(request.scrimmage.dateTime),
        teamAssignment: request.teamAssignment ?? null,
      })),
  ];

  const events = [
    ...allGames
      .filter((game: any) =>
        userTeamIds.has(game.homeTeamId) || userTeamIds.has(game.awayTeamId),
      )
      .map((game: any) => ({ ...game, type: "game" })),
    ...scrimmages,
    ...substitutions.map((substitution: any) => ({
      ...substitution.game,
      type: "substitute",
      substituteForTeam: substitution.requestingTeam,
      scheduledAt: substitution.game?.scheduledAt,
    })),
    ...personalReminders.map((reminder: any) => ({ ...reminder, type: "reminder" })),
    ...teamEvents
      .filter((event: any) => userTeamIds.has(event.teamId))
      .map((event: any) => ({ ...event, type: "team-event" })),
  ];

  return events
    .map((event: any) => {
      const activeTeamId =
        event.activeTeamId ||
        event.substituteForTeam?.id ||
        (userTeamIds.has(event.homeTeamId) ? event.homeTeamId : undefined) ||
        (userTeamIds.has(event.awayTeamId) ? event.awayTeamId : undefined);

      return toNativeCalendarEvent({ ...event, activeTeamId });
    })
    .filter((event): event is NativeCalendarEvent => event !== null);
}

const STORAGE_PREFIX = "roster-native-calendar";
const SYNC_EVENT_NAME = "roster-native-calendar-sync";
const memoryEventRecords = new Map<string, NativeCalendarEventRecord>();
const syncLocks = new Map<string, Promise<NativeCalendarSyncResult>>();

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

function extractStoredString(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (!value || typeof value !== "object") return null;

  const response = value as Record<string, unknown>;
  if (response.status && response.status !== "SUCCESS") return null;

  for (const candidate of [response.value, response.data, response.storageValue]) {
    if (typeof candidate === "string" && candidate) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = extractStoredString(candidate);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Reads the selected calendar from native persistent storage, falling back to
 * localStorage for web builds and for migrating existing selections.
 */
export async function loadSavedCalendarId(ownerKey?: string): Promise<string | null> {
  const localValue = getSavedCalendarId(ownerKey);
  if (!isNativeCalendarAvailable()) return localValue;

  try {
    const nativeValue = extractStoredString(
      await withTimeout<unknown>((resolve) => {
        nativeStorage.getStorageValue(storageKey(ownerKey, "selected"), resolve);
      }, 5000),
    );

    if (nativeValue) {
      try {
        localStorage.setItem(storageKey(ownerKey, "selected"), nativeValue);
      } catch {
        // Native storage remains the durable copy.
      }
      return nativeValue;
    }

    // Migrate a selection saved by an older webview-based build.
    if (localValue) {
      nativeStorage.setStorageValue(storageKey(ownerKey, "selected"), localValue);
    }
    return localValue;
  } catch {
    return localValue;
  }
}

export function saveCalendarId(ownerKey: string | undefined, calendarId: string): void {
  try {
    localStorage.setItem(storageKey(ownerKey, "selected"), calendarId);
  } catch {
    // Native storage below remains the durable copy.
  }

  if (isNativeCalendarAvailable()) {
    try {
      nativeStorage.setStorageValue(storageKey(ownerKey, "selected"), calendarId);
    } catch {
      // The local copy still supports web and same-session use.
    }
  }
}

export function getExportedEventKey(ownerKey: string | undefined, calendarId: string, sourceKey: string): string {
  return storageKey(ownerKey, `exported:${calendarId}:${sourceKey}`);
}

function parseStoredEventRecord(
  value: string | null,
  sourceKey: string,
  calendarId: string,
): NativeCalendarEventRecord | null {
  if (!value) return null;
  if (value === "1") {
    return { sourceKey, calendarId, legacy: true };
  }

  try {
    const record = JSON.parse(value);
    if (!record || typeof record !== "object") return null;
    return {
      sourceKey,
      calendarId,
      fingerprint: typeof record.fingerprint === "string" ? record.fingerprint : undefined,
      nativeEventId: typeof record.nativeEventId === "string" ? record.nativeEventId : undefined,
      legacy: record.legacy === true,
    };
  } catch {
    return null;
  }
}

export function getExportedEventRecord(
  ownerKey: string | undefined,
  calendarId: string,
  sourceKey: string,
): NativeCalendarEventRecord | null {
  const key = getExportedEventKey(ownerKey, calendarId, sourceKey);
  const memoryRecord = memoryEventRecords.get(key);
  if (memoryRecord) return memoryRecord;

  try {
    return parseStoredEventRecord(
      localStorage.getItem(key),
      sourceKey,
      calendarId,
    );
  } catch {
    return null;
  }
}

export function getExportedEventFingerprint(event: NativeCalendarEvent): string {
  return JSON.stringify([
    event.sourceKey,
    event.title,
    event.start.toISOString(),
    event.end.toISOString(),
    event.timezone,
    event.description || "",
    event.location || "",
  ]);
}

export function getExportedEventState(
  ownerKey: string | undefined,
  calendarId: string | null,
  event: NativeCalendarEvent,
): NativeCalendarEventState {
  if (!calendarId) return "not_exported";
  const record = getExportedEventRecord(ownerKey, calendarId, event.sourceKey);
  if (!record) return "not_exported";
  if (record.legacy || !record.fingerprint) return "legacy";
  return record.fingerprint === getExportedEventFingerprint(event) ? "exported" : "changed";
}

export function hasExportedEvent(ownerKey: string | undefined, calendarId: string, sourceKey: string): boolean {
  return getExportedEventRecord(ownerKey, calendarId, sourceKey) !== null;
}

function extractNativeEventId(data: unknown): string | undefined {
  if (typeof data === "string" && data.length > 0) return data;
  if (!data || typeof data !== "object") return undefined;
  const value = data as Record<string, unknown>;
  for (const key of ["nativeEventId", "eventId", "calendarEventId"]) {
    if (typeof value[key] === "string" && value[key]) return value[key] as string;
  }
  return undefined;
}

export function markEventExported(
  ownerKey: string | undefined,
  calendarId: string,
  sourceKey: string,
  event?: NativeCalendarEvent,
  nativeResponse?: unknown,
): void {
  const record: NativeCalendarEventRecord = {
    sourceKey,
    calendarId,
    fingerprint: event ? getExportedEventFingerprint(event) : undefined,
    nativeEventId: extractNativeEventId(nativeResponse),
    legacy: !event,
  };
  const key = getExportedEventKey(ownerKey, calendarId, sourceKey);
  memoryEventRecords.set(key, record);
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // A private browsing context may not allow localStorage. Export still works.
  }
}

function removeEventRecord(
  ownerKey: string | undefined,
  calendarId: string,
  sourceKey: string,
): void {
  memoryEventRecords.delete(getExportedEventKey(ownerKey, calendarId, sourceKey));
  try {
    localStorage.removeItem(getExportedEventKey(ownerKey, calendarId, sourceKey));
  } catch {
    // Best-effort cleanup; a private browsing context may not allow localStorage.
  }
}

function getExportedEventRecords(
  ownerKey: string | undefined,
  calendarId: string,
): NativeCalendarEventRecord[] {
  const records: NativeCalendarEventRecord[] = [];
  const prefix = storageKey(ownerKey, `exported:${calendarId}:`);
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const sourceKey = key.slice(prefix.length);
      const record = parseStoredEventRecord(localStorage.getItem(key), sourceKey, calendarId);
      if (record) records.push(record);
    }
  } catch {
    // Continue with the in-memory records below.
  }

  const knownKeys = new Set(records.map((record) => record.sourceKey));
  for (const [key, record] of Array.from(memoryEventRecords.entries())) {
    if (key.startsWith(prefix) && !knownKeys.has(record.sourceKey)) {
      records.push(record);
    }
  }
  return records;
}


function notifyCalendarSync(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME));
  }
}

export function subscribeToNativeCalendarSync(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SYNC_EVENT_NAME, listener);
  return () => window.removeEventListener(SYNC_EVENT_NAME, listener);
}

async function syncNativeCalendarEventsInternal(
  ownerKey: string | undefined,
  calendarId: string,
  currentEvents: NativeCalendarEvent[],
): Promise<NativeCalendarSyncResult> {
  const result: NativeCalendarSyncResult = {
    status: "nothing_to_do",
    createdEvents: [],
    updatedEvents: [],
    removedEvents: [],
    staleEvents: [],
    failedEvents: [],
  };
  const provider = getNativeCalendarMutationProvider();
  const currentBySourceKey = new Map(currentEvents.map((event) => [event.sourceKey, event]));

  for (const record of getExportedEventRecords(ownerKey, calendarId)) {
    const currentEvent = currentBySourceKey.get(record.sourceKey);
    if (currentEvent) {
      if (!record.fingerprint || record.fingerprint === getExportedEventFingerprint(currentEvent)) {
        continue;
      }

      if (provider?.updateEvent && record.nativeEventId) {
        try {
          await provider.updateEvent(record.nativeEventId, currentEvent, calendarId);
          markEventExported(ownerKey, calendarId, record.sourceKey, currentEvent, {
            nativeEventId: record.nativeEventId,
          });
          result.updatedEvents.push(record.sourceKey);
        } catch {
          result.failedEvents.push(record.sourceKey);
          result.staleEvents.push(record.sourceKey);
        }
      } else {
        // Never create a second event when the native bridge cannot edit this one.
        result.staleEvents.push(record.sourceKey);
      }
      continue;
    }

    if (provider?.deleteEvent && record.nativeEventId) {
      try {
        await provider.deleteEvent(record.nativeEventId, calendarId);
        removeEventRecord(ownerKey, calendarId, record.sourceKey);
        result.removedEvents.push(record.sourceKey);
      } catch {
        result.failedEvents.push(record.sourceKey);
        result.staleEvents.push(record.sourceKey);
      }
    } else {
      // A cancellation cannot be reflected without an editable event identifier.
      // Keep the record so a later refresh still cannot create a duplicate.
      result.staleEvents.push(record.sourceKey);
    }
  }

  for (const currentEvent of currentEvents) {
    if (getExportedEventRecord(ownerKey, calendarId, currentEvent.sourceKey)) continue;

    try {
      const nativeResponse = await createDeviceCalendarEvent(currentEvent, calendarId);
      markEventExported(
        ownerKey,
        calendarId,
        currentEvent.sourceKey,
        currentEvent,
        nativeResponse,
      );
      result.createdEvents.push(currentEvent.sourceKey);
    } catch {
      result.failedEvents.push(currentEvent.sourceKey);
    }
  }

  if (
    result.createdEvents.length ||
    result.updatedEvents.length ||
    result.removedEvents.length ||
    result.staleEvents.length
  ) {
    result.status = result.staleEvents.length ? "changes_pending" : "synced";
    notifyCalendarSync();
  }
  return result;
}

export async function syncNativeCalendarEvents(
  ownerKey: string | undefined,
  calendarId: string,
  currentEvents: NativeCalendarEvent[],
): Promise<NativeCalendarSyncResult> {
  const lockKey = `${ownerKey || "anonymous"}:${calendarId}`;
  const existingSync = syncLocks.get(lockKey);
  if (existingSync) return existingSync;

  const sync = syncNativeCalendarEventsInternal(ownerKey, calendarId, currentEvents);
  syncLocks.set(lockKey, sync);
  try {
    return await sync;
  } finally {
    if (syncLocks.get(lockKey) === sync) syncLocks.delete(lockKey);
  }
}