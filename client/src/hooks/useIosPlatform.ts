import { useState, useEffect } from 'react';

/**
 * Returns true when running inside the Natively iOS/iPadOS native app shell.
 *
 * Detection order (all synchronous):
 *   1. UA includes "Natively/iOS"      — standard iPhone build UA
 *   2. UA includes "Natively/iPadOS"   — possible iPad-specific Natively UA variant
 *   3. window.$agent is defined + not Android
 *      — Natively injects the $agent global into EVERY native build (iOS and Android).
 *        It is NOT present in any browser (including the Replit preview or Safari on iPad),
 *        so this reliably identifies any Natively iOS/iPadOS native context, including iPads
 *        in desktop mode where the user agent no longer contains "iPad" or "Natively/iOS".
 *
 * Why $agent and not window.natively?
 *   window.natively is also available as an NPM module in the browser/preview environment,
 *   so it cannot distinguish a native app from a web browser. $agent is only injected by
 *   the Natively native bridge — it does not exist in any non-native context.
 */
function isNativelyIosApp(): boolean {
  const ua = navigator.userAgent;
  // Check 1 & 2: explicit Natively UA strings
  if (ua.includes('Natively/iOS') || ua.includes('Natively/iPadOS')) return true;
  // Check 3: $agent is the native bridge marker used by the Natively SDK itself
  // (see NativelyInfo.browserInfo → isNativeApp). If it's defined and not Android → iOS.
  if (typeof (window as any).$agent !== 'undefined' && !ua.includes('Natively/Android')) return true;
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
/**
 * Returns true when the visitor is on any iOS device (iPhone, iPad, iPod),
 * whether in a native app shell or a regular browser like Safari.
 * This is used to hide Google Play references per Apple's review guidelines.
 *
 * Handles the iPadOS desktop-mode case where the UA reads "Macintosh" instead
 * of "iPad" — detected via navigator.platform + maxTouchPoints heuristic.
 */
export function useIsIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const params = new URLSearchParams(window.location.search);
  if (params.get('ios') === '1') return true;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (isNativelyIosApp()) return true;
  // iPadOS 13+ in desktop mode reports a Mac UA; detect via touch support
  if (
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1 &&
    /Macintosh/.test(ua)
  ) return true;
  return false;
}

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
    console.log('[Platform] $agent defined:', typeof (window as any).$agent !== 'undefined');
    console.log('[Platform] window.natively:', !!(window as any).natively);
    console.log('[Platform] isIos:', info.isIos, '| isAndroid:', info.isAndroid, '| isUsRegion:', info.isUsRegion);
  }, []);

  return info;
}
