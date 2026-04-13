/**
 * Detects whether the user is on a mobile device (iOS or Android),
 * covering both native app shells and standard mobile browsers.
 *
 * Detection uses:
 *   1. Natively/Capacitor UA strings (native app shells)
 *   2. Standard iOS/Android UA strings (Safari, Chrome, etc.)
 *   3. Screen width fallback (< 768px)
 */
export function useIsMobile(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent;

  const nativelyIos = ua.includes('Natively/iOS');
  const nativelyAndroid = ua.includes('Natively/Android');

  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      const platform = cap.getPlatform();
      if (platform === 'ios' || platform === 'android') return true;
    }
  } catch {
  }

  if (nativelyIos || nativelyAndroid) return true;

  const iosDevice = /iPhone|iPad|iPod/i.test(ua);
  const androidDevice = /Android/i.test(ua);

  if (iosDevice || androidDevice) return true;

  return window.innerWidth < 768;
}
