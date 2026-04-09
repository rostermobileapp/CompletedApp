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
