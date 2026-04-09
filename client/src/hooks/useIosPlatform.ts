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

interface IosPlatformInfo {
  isIos: boolean;
  /**
   * isUsRegion is intentionally always false on iOS.
   *
   * The @capgo/native-purchases plugin does not expose a getStorefront() method,
   * so there is no reliable way to determine the App Store storefront country code
   * on iOS without a native plugin that exposes SKStorefront.countryCode.
   *
   * Apple's EP v. Apple ruling permits (but does not require) showing external
   * payment links to US users. Showing the Stripe button to non-US users would
   * violate Apple's guidelines. Therefore, we default to the safe/compliant
   * behavior: hide the Stripe external-link button on all iOS devices until an
   * authoritative storefront signal is available.
   *
   * When upgrading the native plugin or adding a custom Capacitor plugin that
   * exposes SKStorefront.countryCode, set this field based on that authoritative
   * signal instead.
   */
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
    // Always false on iOS — see comment on isUsRegion above.
    // Web non-iOS does not show this path at all (web uses Stripe directly).
    const isUsRegion = false;
    setInfo({ isIos, isUsRegion, isReady: true });
  }, []);

  return info;
}
