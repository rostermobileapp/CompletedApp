import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDemo } from '@/context/DemoContext';
import { isNativelyPurchasesApp } from '@/lib/nativePurchases';
import { syncKnownNativeRevenueCatAccount } from '@/lib/nativeRevenueCat';

/**
 * Refresh provider-backed entitlements when a native session starts or
 * returns to the foreground. Legacy/anonymous RevenueCat identities are not
 * renamed here; the sync helper requires the existing canonical ID to match.
 */
export function NativeRevenueCatSync() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { isActive: isDemoActive } = useDemo();
  const inFlight = useRef(false);
  const lastRunAt = useRef(new Map<string, number>());

  const sync = useCallback(() => {
    const accountId = user?.id;
    const previousRunAt = accountId ? lastRunAt.current.get(accountId) ?? 0 : 0;
    if (isLoading || !isAuthenticated || !accountId || isDemoActive ||
        !isNativelyPurchasesApp() || document.visibilityState === 'hidden' ||
        inFlight.current || Date.now() - previousRunAt < 5000) {
      return;
    }
    inFlight.current = true;
    lastRunAt.current.set(accountId, Date.now());
    void syncKnownNativeRevenueCatAccount({
      shouldContinue: () => isAuthenticated && !isDemoActive &&
        user?.id === accountId && isNativelyPurchasesApp(),
    }).catch((error) => {
      lastRunAt.current.set(accountId, 0);
      console.warn('[Native RevenueCat sync] Startup/resume reconciliation failed:', error);
    }).finally(() => {
      inFlight.current = false;
    });
  }, [isAuthenticated, isLoading, isDemoActive, user?.id]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user?.id || isDemoActive ||
        !isNativelyPurchasesApp()) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    sync();
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('resume', sync);
    window.addEventListener('nativelyReady', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('resume', sync);
      window.removeEventListener('nativelyReady', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, isLoading, isDemoActive, user?.id, sync]);

  return null;
}