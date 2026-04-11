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

/**
 * Resolves the current platform, taking into account both Capacitor and Natively bridges.
 * When window.natively is present the resolution is deferred until the nativelyReady event
 * fires (or a 2-second safety timeout elapses) so that isReady is only set after the bridge
 * has had a chance to fully initialise.
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

    const resolve = () => {
      const capacitorPlatform = getCapacitorPlatform();
      const nativelyIos = isNativelyIos();
      const nativelyAndroid = isNativelyAndroid();
      const isIos = capacitorPlatform === 'ios' || nativelyIos || previewIos;
      const isAndroid = capacitorPlatform === 'android' || nativelyAndroid;
      const isUsRegion = detectUsRegion();
      setInfo({ isIos, isAndroid, isUsRegion, isReady: true });
    };

    const hasNativelyBridge = typeof (window as any).natively !== 'undefined';

    if (!hasNativelyBridge) {
      // No Natively bridge present — resolve immediately (Capacitor or plain web).
      resolve();
      return;
    }

    // Natively bridge is present. Wait for nativelyReady before resolving so that
    // window.natively is fully initialised and isReady is only true once the platform
    // is accurately known. A 2-second safety timeout guards against the event never
    // firing (e.g. very old Natively versions or unexpected bridge failure).
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const handleNativelyReady = () => settle();
    window.addEventListener('nativelyReady', handleNativelyReady);

    const timeout = setTimeout(settle, 2000);

    return () => {
      window.removeEventListener('nativelyReady', handleNativelyReady);
      clearTimeout(timeout);
    };
  }, []);

  return info;
}
