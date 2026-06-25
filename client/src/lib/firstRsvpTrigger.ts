import { getAuthHeaders } from '@/lib/queryClient';

/**
 * Fire the OneSignal in-app trigger "first_rsvp_completed = true" exactly once
 * per user (tracked server-side so it survives reinstalls and multi-device use).
 *
 * In the OneSignal dashboard set:
 *   In-App Trigger  key: first_rsvp_completed  is  true
 */
export async function fireFirstRsvpTrigger(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/user/first-rsvp-trigger', {
      method: 'POST',
      headers,
    });

    if (!res.ok) return;

    const { isFirst } = await res.json();
    if (!isFirst) return;

    setOneSignalTrigger('first_rsvp_completed', 'true');
  } catch (err) {
    console.warn('[OneSignal] fireFirstRsvpTrigger error:', err);
  }
}

function setOneSignalTrigger(key: string, value: string): void {
  // Try Natively SDK first (native app context)
  const hasNativelySDK = typeof (window as any).NativelyNotifications === 'function';
  if (hasNativelySDK) {
    try {
      const notifications = new (window as any).NativelyNotifications();
      if (typeof notifications.addTrigger === 'function') {
        notifications.addTrigger(key, value);
        console.log(`[OneSignal] ${key} trigger set via Natively`);
        return;
      }
      console.log(`[OneSignal] Natively instance has no addTrigger — falling through to web SDK`);
    } catch (err) {
      console.warn('[OneSignal] Could not set trigger via Natively:', err);
    }
  }

  // Always try the web SDK (works on https://www.roster-app.com in both browser and Natively WebView)
  if ((window as any).OneSignalDeferred) {
    (window as any).OneSignalDeferred.push((OneSignal: any) => {
      try {
        OneSignal.InAppMessages?.addTrigger(key, value);
        console.log(`[OneSignal] ${key} trigger set via web SDK`);
      } catch (err) {
        console.warn('[OneSignal] Could not set trigger via web SDK:', err);
      }
    });
  }
}
