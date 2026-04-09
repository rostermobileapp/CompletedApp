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
  /** True when the device locale/timezone indicates a US user. Controls whether the Stripe external-link button is shown on iOS. */
  isUsRegion: boolean;
  isReady: boolean;
}

export function useIosPlatform(): IosPlatformInfo {
  const [info, setInfo] = useState<IosPlatformInfo>({
    isIos: false,
    isUsRegion: false,
    isReady: false,
  });

  useEffect(() => {
    const platform = getCapacitorPlatform();
    const params = new URLSearchParams(window.location.search);
    const previewIos = params.get('ios') === '1';
    const isIos = platform === 'ios' || previewIos;
    const isUsRegion = detectUsRegion();
    setInfo({ isIos, isUsRegion, isReady: true });
  }, []);

  return info;
}
