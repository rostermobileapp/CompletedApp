import { useState, useEffect } from 'react';

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
 * Detects the native platform (iOS / Android / web), accounting for both Capacitor
 * and Natively-wrapped apps.
 *
 * Detection priority:
 *   1. ?ios=1 query param  → always iOS (dev preview)
 *   2. window.Capacitor     → use getPlatform() directly (synchronous)
 *   3. Natively bridge      → window.natively + iOS/Android user-agent
 *      - If the iOS user-agent is detected we wait up to 2 s for window.natively to
 *        appear (the bridge arrives async after page load on real devices). We listen
 *        for the nativelyReady event AND poll at 100ms intervals so we catch the
 *        bridge no matter which signal arrives first.
 *      - If neither arrives within 2 s the device is treated as non-native (plain
 *        Safari or a desktop browser).
 */
export function useIosPlatform(): IosPlatformInfo {
  const [info, setInfo] = useState<IosPlatformInfo>({
    isIos: false,
    isAndroid: false,
    isUsRegion: false,
    isReady: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const previewIos = params.get('ios') === '1';
    const isUsRegion = detectUsRegion();

    // 1. Dev-preview override
    if (previewIos) {
      setInfo({ isIos: true, isAndroid: false, isUsRegion, isReady: true });
      return;
    }

    // 2. Capacitor (resolves synchronously)
    const capacitorPlatform = getCapacitorPlatform();
    if (capacitorPlatform === 'ios') {
      setInfo({ isIos: true, isAndroid: false, isUsRegion, isReady: true });
      return;
    }
    if (capacitorPlatform === 'android') {
      setInfo({ isIos: false, isAndroid: true, isUsRegion, isReady: true });
      return;
    }

    // 3. Natively bridge detection
    const isIosUA = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroidUA = /Android/i.test(navigator.userAgent);

    const hasNativelyBridge = () => typeof (window as any).natively !== 'undefined';

    if (!isIosUA && !isAndroidUA) {
      // Desktop or unknown — no native bridge expected
      setInfo({ isIos: false, isAndroid: false, isUsRegion, isReady: true });
      return;
    }

    if (!isIosUA && isAndroidUA) {
      // Android device — check if bridge is present now; if not, wait briefly
      if (hasNativelyBridge()) {
        setInfo({ isIos: false, isAndroid: true, isUsRegion, isReady: true });
        return;
      }
      // Fall through to the async wait below (reuse same logic, just isIosUA=false)
    }

    // iOS (or Android without bridge yet): wait for window.natively to appear.
    // The Natively bridge is injected asynchronously after the WebView loads.
    // We listen for nativelyReady AND poll every 100 ms as a belt-and-suspenders
    // approach — whichever signal arrives first wins.
    let settled = false;

    const settle = (nativelyPresent: boolean) => {
      if (settled) return;
      settled = true;
      const resolvedIsIos = isIosUA && nativelyPresent;
      const resolvedIsAndroid = isAndroidUA && nativelyPresent && !resolvedIsIos;
      setInfo({
        isIos: resolvedIsIos,
        isAndroid: resolvedIsAndroid,
        isUsRegion,
        isReady: true,
      });
    };

    // Check immediately — bridge may already be present
    if (hasNativelyBridge()) {
      settle(true);
      return;
    }

    // Listen for nativelyReady event
    const handleNativelyReady = () => settle(true);
    window.addEventListener('nativelyReady', handleNativelyReady);

    // Poll in case event fired before our listener was attached
    const poll = setInterval(() => {
      if (hasNativelyBridge()) {
        clearInterval(poll);
        settle(true);
      }
    }, 100);

    // Safety timeout: if nothing arrives in 2 s, treat as non-native (plain browser)
    const timeout = setTimeout(() => {
      clearInterval(poll);
      settle(false);
    }, 2000);

    return () => {
      window.removeEventListener('nativelyReady', handleNativelyReady);
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, []);

  return info;
}
