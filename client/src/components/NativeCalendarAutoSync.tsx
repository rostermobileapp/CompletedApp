import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNativelyNotifications } from "@/hooks/useNativelyNotifications";
import {
  isNativeCalendarAvailable,
  loadSavedCalendarId,
  syncNativeCalendarEvents,
  toNativeCalendarEventsFromCalendarData,
} from "@/lib/nativeCalendar";

/**
 * Keeps the already-configured device calendar current regardless of which
 * Roster page the user is viewing. Initial calendar setup remains explicit;
 * after that, schedule query changes automatically reconcile new events.
 */
export function NativeCalendarAutoSync() {
  const { displayId: nativeDisplayId } = useNativelyNotifications();
  const { data: user } = useQuery<any>({
    queryKey: ["/api/user"],
  });

  const canUseCalendarSync =
    user?.displayId === "U00001" || nativeDisplayId === "U00001";
  const nativeCalendarAvailable = isNativeCalendarAvailable();

  const { data: calendarData } = useQuery<any>({
    queryKey: ["/api/user/calendar"],
    enabled: canUseCalendarSync && nativeCalendarAvailable && !!user?.id,
  });

  useEffect(() => {
    if (!canUseCalendarSync || !nativeCalendarAvailable || !user?.id || !calendarData) {
      return;
    }

    let cancelled = false;

    void loadSavedCalendarId(user.id)
      .then((calendarId) => {
        if (cancelled || !calendarId) return;

        const currentEvents = toNativeCalendarEventsFromCalendarData(calendarData)
          .filter((event) => event.start.getTime() > Date.now());

        return syncNativeCalendarEvents(user.id, calendarId, currentEvents);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[NativeCalendarAutoSync] Schedule sync failed:", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    calendarData,
    canUseCalendarSync,
    nativeCalendarAvailable,
    user?.id,
  ]);

  return null;
}