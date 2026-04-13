import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

function detectMobileUA(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent;

  if (ua.includes('Natively/iOS') || ua.includes('Natively/Android')) return true;

  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      const platform = cap.getPlatform();
      if (platform === 'ios' || platform === 'android') return true;
    }
  } catch {
  }

  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;

  return false;
}

/**
 * Detects whether the user is on a mobile device (iOS or Android),
 * covering both native app shells and standard mobile browsers.
 *
 * Detection uses (in order):
 *   1. Natively/Capacitor UA strings (native app shells)
 *   2. Standard iOS/Android UA strings (Safari, Chrome, etc.)
 *   3. Reactive screen width fallback (< 768px via matchMedia)
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (detectMobileUA()) return true;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    if (detectMobileUA()) return;

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
