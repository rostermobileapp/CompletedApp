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

function isNativelyIos(): boolean {
  try {
    const hasNativelyBridge = typeof (window as any).natively !== 'undefined';
    const iosUserAgent = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return hasNativelyBridge && iosUserAgent;
  } catch {
    return false;
  }
}

function isNativelyAndroid(): boolean {
  try {
    const hasNativelyBridge = typeof (window as any).natively !== 'undefined';
    const androidUserAgent = /Android/i.test(navigator.userAgent);
    return hasNativelyBridge && androidUserAgent;
  } catch {
    return false;
  }
}

/**
 * Detects whether the user is likely in the US using device locale and timezone.
 * Used to conditionally show the Stripe external-link button on iOS (US users only).
 *
 * Note: @capgo/native-purchases does not expose SKStorefront.countryCode, so this
 * heuristic is the best available signal without a custom native Capacitor plugin.
 * It covers the vast majority of US users accurately.
 */
function detectUsRegion(): boolean {
  try {
    const locale = navigator.language || '';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const isUsLocale = locale.toLowerCase().startsWith('en-us');
    const isUsTimeZone = timeZone.startsWith('America/') || timeZone.startsWith('US/') || timeZone === 'Pacific/Honolulu';
    return isUsLocale || isUsTimeZone;
  } catch {
    return false;
  }
}

interface IosPlatformInfo {
  isIos: boolean;
  isAndroid: boolean;
  /** True when the device locale/timezone indicates a US user. Controls whether the Stripe external-link button is shown on iOS. */
  isUsRegion: boolean;
  isReady: boolean;
}

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

    const resolveInfo = () => {
      const capacitorPlatform = getCapacitorPlatform();
      const nativelyIos = isNativelyIos();
      const nativelyAndroid = isNativelyAndroid();
      const isIos = capacitorPlatform === 'ios' || nativelyIos || previewIos;
      const isAndroid = capacitorPlatform === 'android' || nativelyAndroid;
      const isUsRegion = detectUsRegion();
      setInfo({ isIos, isAndroid, isUsRegion, isReady: true });
    };

    // Resolve immediately — covers Capacitor and cases where window.natively is already present
    resolveInfo();

    // Also listen for the nativelyReady event in case the bridge loads async
    const handleNativelyReady = () => {
      resolveInfo();
    };

    window.addEventListener('nativelyReady', handleNativelyReady);
    return () => {
      window.removeEventListener('nativelyReady', handleNativelyReady);
    };
  }, []);

  return info;
}
