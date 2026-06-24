const STORAGE_KEY = 'rosters_first_rsvp_fired';

/**
 * Fire the OneSignal in-app trigger "first_rsvp_completed = true" exactly once
 * per device. Safe to call on every RSVP success — a localStorage flag prevents
 * it from firing more than once.
 *
 * In the OneSignal dashboard set:
 *   In-App Trigger  key: first_rsvp_completed  is  true
 */
export function fireFirstRsvpTrigger(): void {
  if (typeof window === 'undefined') return;

  if (localStorage.getItem(STORAGE_KEY)) return;

  localStorage.setItem(STORAGE_KEY, '1');

  const key = 'first_rsvp_completed';
  const value = 'true';

  const hasNativelySDK = typeof (window as any).NativelyNotifications === 'function';

  if (hasNativelySDK) {
    try {
      const notifications = new (window as any).NativelyNotifications();
      if (typeof notifications.addTrigger === 'function') {
        notifications.addTrigger(key, value);
        console.log('[OneSignal] first_rsvp_completed trigger set via Natively');
      }
    } catch (err) {
      console.warn('[OneSignal] Could not set first_rsvp trigger via Natively:', err);
    }
    return;
  }

  if ((window as any).OneSignalDeferred) {
    (window as any).OneSignalDeferred.push((OneSignal: any) => {
      try {
        OneSignal.InAppMessages?.addTrigger(key, value);
        console.log('[OneSignal] first_rsvp_completed trigger set via web SDK');
      } catch (err) {
        console.warn('[OneSignal] Could not set first_rsvp trigger via web SDK:', err);
      }
    });
  }
}
