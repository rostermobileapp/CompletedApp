import { useState, useEffect } from 'react';

/**
 * Returns true when running inside the Natively iOS/iPadOS native app shell.
 *
 * Detection order (all synchronous):
 *   1. UA includes "Natively/iOS"      — iPhone builds
 *   2. UA includes "Natively/iPadOS"   — iPad builds (Natively may use iPadOS variant)
 *   3. window.natively bridge present + UA includes "iPad" or "iPhone"
 *      — catches any Natively build where the UA variant doesn't exactly match,
 *        while safely ignoring regular Safari on iPad (no window.natively there)
 */
function isNativelyIosApp(): boolean {
  const ua = navigator.userAgent;
  if (ua.includes('Natively/iOS') || ua.includes('Natively/iPadOS')) return true;
  // Fallback: Natively bridge is injected AND device is an Apple mobile device
  if ((window as any).natively && (ua.includes('iPad') || ua.includes('iPhone'))) return true;
  return false;
}

/**
 * Returns true when running inside the Natively Android native app shell.
 * Natively sets a custom user-agent containing "Natively/Android" for Android builds.
 */
function isNativelyAndroidApp(): boolean {
  return navigator.userAgent.includes('Natively/Android');
}

function getCapacitorPlatform(): string {
  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      return cap.getPlatform();
    }
  } catch {
  }
  return 'web';
}

/**
 * Detects whether the user is likely in the US using device locale and timezone.
 * Used to conditionally show the Stripe external-link button on iOS (US users only).
 */
function detectUsRegion(): boolean {
  try {
    const locale = navigator.language || '';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const isUsLocale = locale.toLowerCase().startsWith('en-us');
    const isUsTimeZone =
      timeZone.startsWith('America/') ||
      timeZone.startsWith('US/') ||
      timeZone === 'Pacific/Honolulu';
    return isUsLocale || isUsTimeZone;
  } catch {
    return false;
  }
}

interface IosPlatformInfo {
  isIos: boolean;
  isAndroid: boolean;
  /** True when the device locale/timezone indicates a US user. */
  isUsRegion: boolean;
  isReady: boolean;
}

/**
 * Detects the native platform (iOS / Android / web).
 *
 * Detection order:
 *   1. ?ios=1 query param            → iOS (dev preview only)
 *   2. Natively iOS user-agent        → iOS native app  ("Natively/iOS" in UA)
 *   3. Natively Android user-agent    → Android native app ("Natively/Android" in UA)
 *   4. Capacitor getPlatform()        → Capacitor-based native app
 *   5. Fallback                       → web / Safari (not a native app)
 *
 * The Natively user-agent check is synchronous and does not require waiting for
 * any bridge events, because the native shell sets the UA before JavaScript runs.
 */
export function useIosPlatform(): IosPlatformInfo {
  const [info, setInfo] = useState<IosPlatformInfo>(() => {
    const params = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    );
    const previewIos = params.get('ios') === '1';
    const nativelyIos = isNativelyIosApp();
    const nativelyAndroid = isNativelyAndroidApp();
    const capacitorPlatform = getCapacitorPlatform();

    const isIos = previewIos || nativelyIos || capacitorPlatform === 'ios';
    const isAndroid = nativelyAndroid || capacitorPlatform === 'android';
    const isUsRegion = detectUsRegion();

    return { isIos, isAndroid, isUsRegion, isReady: true };
  });

  // Log on mount so developers can see what was detected (useful for debugging on device)
  useEffect(() => {
    const ua = navigator.userAgent;
    console.log('[Platform] UA:', ua);
    console.log('[Platform] window.natively:', !!(window as any).natively);
    console.log('[Platform] isIos:', info.isIos, '| isAndroid:', info.isAndroid, '| isUsRegion:', info.isUsRegion);
  }, []);

  return info;
}
