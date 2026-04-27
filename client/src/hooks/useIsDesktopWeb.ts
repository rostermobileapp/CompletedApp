import { useState, useEffect } from 'react';

const DESKTOP_BREAKPOINT = 1024;

/**
 * Detects whether the app is being loaded inside a Natively or Capacitor
 * native wrapper (iOS or Android). When true, we should never render the
 * desktop layout — the native shells must keep the existing mobile UI.
 *
 * Mirrors the detection used in `useIsMobile` and `useIosPlatform`.
 */
function isInsideNativeWrapper(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent;

  if (
    ua.includes('Natively/iOS') ||
    ua.includes('Natively/iPadOS') ||
    ua.includes('Natively/Android')
  ) {
    return true;
  }

  // The Natively SDK injects $agent into every native build (iOS + Android).
  // It is never present in any browser, so it reliably identifies a native shell.
  if (typeof (window as any).$agent !== 'undefined') return true;

  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      const platform = cap.getPlatform();
      if (platform === 'ios' || platform === 'android') return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Returns true ONLY when the user is on a desktop browser:
 *   1. Not running inside a Natively/Capacitor native wrapper, AND
 *   2. Viewport width is >= 1024px.
 *
 * The viewport check uses matchMedia so it responds live to window resizes
 * (e.g. dragging a desktop browser narrower triggers a re-render). User-agent
 * sniffing is only used to detect the native wrapper, never to decide
 * "is desktop?" — that is purely viewport based.
 */
export function useIsDesktopWeb(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (isInsideNativeWrapper()) return false;
    return window.innerWidth >= DESKTOP_BREAKPOINT;
  });

  useEffect(() => {
    if (isInsideNativeWrapper()) {
      setIsDesktop(false);
      return;
    }

    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
