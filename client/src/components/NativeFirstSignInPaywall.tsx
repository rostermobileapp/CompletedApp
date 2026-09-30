import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDemo } from '@/context/DemoContext';
import { usePermissions } from '@/context/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { ApiError, apiRequest } from '@/lib/queryClient';
import {
  isNativelyPurchasesApp,
  loginNativePurchaseAccount,
  showNativeRevenueCatPaywall,
} from '@/lib/nativePurchases';
import {
  canPresentNativePaywall,
  nativePaywallHasSuccessfulPurchase,
  type NativePaywallStatus,
  wasNativePaywallPresented,
} from '@/lib/nativePaywall';
import { syncKnownNativeRevenueCatAccount } from '@/lib/nativeRevenueCat';

type CurrentState = {
  authenticated: boolean;
  userId: string | null;
  demo: boolean;
  permissionLoading: boolean;
  role: string;
  primaryCommissioner: boolean;
};

// A callback timeout is ambiguous on older native builds: keep this in-memory
// guard until the app reloads so revisiting onboarding cannot stack another native
// sheet while the first one may still be visible. The server is not marked
// shown; a fresh app session can retry.
const attemptedNativePaywallAccounts = new Set<string>();

/**
 * Starts the server-authorized native offering after the onboarding paywall step renders.
 * This component intentionally renders no UI; all purchase UI belongs to the
 * RevenueCat offering presented by Natively.
 */
export function NativeFirstSignInPaywall({
  onOutcome,
}: {
  onOutcome?: (outcome: 'disabled' | 'unavailable' | 'presented' | 'link-error' | 'error') => void;
} = {}) {
  const { user, isAuthenticated } = useAuth();
  const { isActive: isDemoActive } = useDemo();
  const { role, isPrimaryCommissioner, isLoading: permissionsLoading } = usePermissions();
  const [nativeReady, setNativeReady] = useState(isNativelyPurchasesApp);
  const [flowError, setFlowError] = useState<string | null>(null);
  const { toast } = useToast();
  const outcomeCallback = useRef(onOutcome);
  outcomeCallback.current = onOutcome;
  const current = useRef<CurrentState>({
    authenticated: false,
    userId: null,
    demo: false,
    permissionLoading: true,
    role: 'free_tier',
    primaryCommissioner: false,
  });
  current.current = {
    authenticated: isAuthenticated,
    userId: user?.id ?? null,
    demo: isDemoActive,
    permissionLoading: permissionsLoading,
    role,
    primaryCommissioner: isPrimaryCommissioner,
  };

  useEffect(() => {
    if (nativeReady) return;
    const refresh = () => {
      if (isNativelyPurchasesApp()) setNativeReady(true);
    };
    // Native bridge injection can happen after Home mounts, with or without a
    // nativelyReady event. Bound the polling for browsers that never get one.
    const interval = window.setInterval(refresh, 500);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      outcomeCallback.current?.('error');
    }, 15_000);
    window.addEventListener('nativelyReady', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('resume', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener('nativelyReady', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('resume', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [nativeReady]);

  useEffect(() => {
    const accountId = user?.id;
    const paidRole = role === 'player_pro' || role === 'commissioner';
    if (accountId && isAuthenticated && !permissionsLoading &&
        (paidRole || isPrimaryCommissioner || isDemoActive ||
          attemptedNativePaywallAccounts.has(accountId))) {
      outcomeCallback.current?.('unavailable');
    }
    if (!accountId || !isAuthenticated || isDemoActive || permissionsLoading ||
        paidRole || isPrimaryCommissioner || !nativeReady ||
        attemptedNativePaywallAccounts.has(accountId)) {
      return;
    }

    let active = true;
    let flowStarted = false;
    let presentationConfirmed = false;
    let callbackTimedOut = false;
    let claimToken: string | null = null;
    let paywallOutcomeReceived = false;
    let firstFrame = 0;
    let secondFrame = 0;

    const isStillEligible = () => {
      const state = current.current;
      const currentPaidRole = state.role === 'player_pro' || state.role === 'commissioner';
      return active && nativeReady && isNativelyPurchasesApp() && state.authenticated &&
        state.userId === accountId && !state.demo && !state.permissionLoading &&
        !currentPaidRole && !state.primaryCommissioner;
    };

    const reportResult = async (presented: boolean) => {
      if (!claimToken) return;
      await apiRequest('POST', '/api/iap/native-paywall-result', {
        claimToken,
        presented,
      });
    };

    const runPaywallFlow = async () => {
      let stage: 'status' | 'login' | 'claim' | 'paywall' = 'status';
      try {
        setFlowError(null);
        const statusResponse = await apiRequest('GET', '/api/iap/native-paywall-status');
        const status = await statusResponse.json() as NativePaywallStatus;
        if (!isStillEligible()) return;
        if (!canPresentNativePaywall(status)) {
          if (active) outcomeCallback.current?.(status.enabled === false ? 'disabled' : 'unavailable');
          return;
        }

        stage = 'login';
        await loginNativePurchaseAccount(status.loginId!);
        if (!isStillEligible()) return;

        stage = 'claim';
        const claimResponse = await apiRequest('POST', '/api/iap/native-paywall-claim');
        const claim = await claimResponse.json() as { claimToken?: string };
        if (typeof claim.claimToken !== 'string' || !claim.claimToken) {
          throw new Error('The server did not authorize the native paywall.');
        }
        claimToken = claim.claimToken;
        if (!isStillEligible()) return;

        stage = 'paywall';
        const result = await showNativeRevenueCatPaywall();
        paywallOutcomeReceived = true;
        callbackTimedOut = result.status === 'TIMEOUT';
        presentationConfirmed = wasNativePaywallPresented(result);
        if (active) outcomeCallback.current?.(presentationConfirmed ? 'presented' : 'error');
        void reportResult(presentationConfirmed).catch((error) => {
          console.warn('[Native paywall] Could not record presentation with the server:', error);
        });

        const purchaseConfirmed = nativePaywallHasSuccessfulPurchase(result);
        if (!presentationConfirmed && !callbackTimedOut) {
          toast({
            title: 'The subscription offer could not be opened',
            description: 'Please try again later or use the existing Subscription screen.',
            variant: 'destructive',
          });
          return;
        }
        if (!purchaseConfirmed && !callbackTimedOut) return;
        const state = current.current;
        if (!state.authenticated || state.userId !== accountId || state.demo) return;

        try {
          const sync = await syncKnownNativeRevenueCatAccount({
            retryDelaysMs: [2000, 5000, 10000, 20000],
            shouldContinue: () => {
              const currentState = current.current;
              return currentState.authenticated && currentState.userId === accountId &&
                !currentState.demo && isNativelyPurchasesApp();
            },
          });
          if (!sync?.active) {
            toast({
              title: callbackTimedOut ? 'Still checking your store subscription' : 'Purchase verification is pending',
              description: callbackTimedOut
                ? 'If you completed a purchase or restore, Roster will unlock access after RevenueCat verifies it.'
                : 'Your store confirmed the purchase. Roster will unlock access after RevenueCat verifies it.',
            });
          }
        } catch (error) {
          console.warn('[Native paywall] Server-side purchase reconciliation failed:', error);
          toast({
            title: 'Purchase verification is pending',
            description: 'Your purchase was received, but Roster could not verify access yet. Please try again shortly.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        if (active) outcomeCallback.current?.(
          error instanceof ApiError && error.status === 409 ? 'unavailable'
            : stage === 'login' ? 'link-error' : 'error',
        );
        if (!(error instanceof ApiError && error.status === 409)) {
          console.warn(`[Native paywall] ${stage} step did not complete:`, error);
          const step = stage === 'status' ? 'Eligibility check'
            : stage === 'login' ? 'Store account link'
              : stage === 'claim' ? 'Paywall authorization' : 'Paywall';
          const detail = error instanceof Error
            ? `${step} failed: ${error.message.slice(0, 200)}`
            : `${step} failed. Please try again later.`;
          if (active) setFlowError(detail);
          toast({
            title: 'Subscriptions are temporarily unavailable',
            description: detail,
            duration: 30_000,
            variant: 'destructive',
          });
        }
      } finally {
        // A claim must not remain held when navigation or login prevents the
        // native screen from being presented.
        if (claimToken && !paywallOutcomeReceived) {
          try {
            await reportResult(false);
          } catch (error) {
            console.warn('[Native paywall] Could not release an unpresented claim:', error);
          }
        }
      }
    };

    // Let the onboarding step paint, then open the native RevenueCat paywall.
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!isStillEligible()) return;
        flowStarted = true;
        attemptedNativePaywallAccounts.add(accountId);
        void runPaywallFlow();
      });
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      // Failures and native "not_presented" outcomes can retry on a later
      // onboarding visit; confirmed presentations remain guarded for this session.
      if (flowStarted && !presentationConfirmed && !callbackTimedOut) {
        attemptedNativePaywallAccounts.delete(accountId);
      }
    };
  }, [
    isAuthenticated,
    user?.id,
    isDemoActive,
    permissionsLoading,
    role,
    isPrimaryCommissioner,
    nativeReady,
    toast,
  ]);

  if (!flowError) return null;
  return (
    <div
      role="alert"
      className="fixed left-4 right-4 top-20 z-[301] mx-auto max-w-lg rounded-lg border border-destructive bg-background p-4 text-foreground shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Subscriptions are temporarily unavailable</p>
          <p className="mt-1 break-words text-sm">{flowError}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-sm underline"
          onClick={() => setFlowError(null)}
          aria-label="Dismiss subscription error"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}