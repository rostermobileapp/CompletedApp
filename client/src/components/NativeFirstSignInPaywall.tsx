import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
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
  location: string;
  demo: boolean;
  permissionLoading: boolean;
  role: string;
  primaryCommissioner: boolean;
};

// A callback timeout is ambiguous on older native builds: keep this in-memory
// guard until the app reloads so returning to Home cannot stack another native
// sheet while the first one may still be visible. The server is not marked
// shown; a fresh app session can retry.
const attemptedNativePaywallAccounts = new Set<string>();

function isHomeLocation(location: string): boolean {
  return location === '/' || location === '/app';
}

/**
 * Starts the server-authorized native offering only after Home has rendered.
 * This component intentionally renders no UI; all purchase UI belongs to the
 * RevenueCat offering presented by Natively.
 */
export function NativeFirstSignInPaywall() {
  const { user, isAuthenticated } = useAuth();
  const { isActive: isDemoActive } = useDemo();
  const { role, isPrimaryCommissioner, isLoading: permissionsLoading } = usePermissions();
  const [location] = useLocation();
  const { toast } = useToast();
  const current = useRef<CurrentState>({
    authenticated: false,
    userId: null,
    location,
    demo: false,
    permissionLoading: true,
    role: 'free_tier',
    primaryCommissioner: false,
  });
  current.current = {
    authenticated: isAuthenticated,
    userId: user?.id ?? null,
    location,
    demo: isDemoActive,
    permissionLoading: permissionsLoading,
    role,
    primaryCommissioner: isPrimaryCommissioner,
  };

  useEffect(() => {
    const accountId = user?.id;
    const paidRole = role === 'player_pro' || role === 'commissioner';
    const isPreview = import.meta.env.DEV && location.toLowerCase().includes('preview');
    if (!accountId || !isAuthenticated || isDemoActive || permissionsLoading ||
        paidRole || isPrimaryCommissioner || isPreview ||
        !isHomeLocation(location) || !isNativelyPurchasesApp() ||
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
    let timer = 0;

    const isStillEligible = () => {
      const state = current.current;
      const currentPaidRole = state.role === 'player_pro' || state.role === 'commissioner';
      return active && isNativelyPurchasesApp() && state.authenticated &&
        state.userId === accountId && !state.demo && !state.permissionLoading &&
        !currentPaidRole && !state.primaryCommissioner &&
        isHomeLocation(state.location);
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
        const statusResponse = await apiRequest('GET', '/api/iap/native-paywall-status');
        const status = await statusResponse.json() as NativePaywallStatus;
        if (!isStillEligible() || !canPresentNativePaywall(status)) return;

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
        if (!(error instanceof ApiError && error.status === 409)) {
          console.warn(`[Native paywall] ${stage} step did not complete:`, error);
          if (stage === 'login' || stage === 'paywall') {
            toast({
              title: 'Subscriptions are temporarily unavailable',
              description: 'Your account could not be linked to the store. Please try again later.',
              variant: 'destructive',
            });
          }
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

    // The two animation frames ensure Home committed and had a chance to paint
    // before the two-second delay begins.
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          if (!isStillEligible()) return;
          flowStarted = true;
          attemptedNativePaywallAccounts.add(accountId);
          void runPaywallFlow();
        }, 2000);
      });
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
      // Failures and native "not_presented" outcomes can retry on a later
      // Home visit; confirmed presentations remain guarded for this session.
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
    location,
    toast,
  ]);

  return null;
}