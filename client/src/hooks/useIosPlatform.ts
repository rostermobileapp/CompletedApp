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
 * Detects whether the device is likely in the US storefront.
 *
 * @capgo/native-purchases does not expose a getStorefront() method, so we use
 * device locale and timezone as a conservative heuristic. The key Apple-compliance
 * requirement (EP v. Apple) is that US users MUST be shown the external payment
 * link — showing it to a few non-US users is acceptable. This heuristic therefore
 * errs on the side of inclusion: it may show the Stripe button to some non-US users
 * (e.g. US expats with American locale/timezone), which is compliant. It will not
 * miss US users whose device is set to US English or a US timezone.
 */
function detectUsRegion(): boolean {
  try {
    const locale = navigator.language || (navigator as any).userLanguage || '';
    if (locale.toLowerCase().startsWith('en-us')) return true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const usTz = [
      'America/New_York', 'America/Chicago', 'America/Denver',
      'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
      'America/Adak', 'Pacific/Honolulu',
    ];
    return usTz.some((t) => tz.startsWith(t));
  } catch {
    return false;
  }
}

interface IosPlatformInfo {
  isIos: boolean;
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
    const isIos = platform === 'ios';
    const isUsRegion = detectUsRegion();
    setInfo({ isIos, isUsRegion, isReady: true });
  }, []);

  return info;
}
