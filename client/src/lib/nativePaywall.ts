import type { NativelyPaywallResult } from './nativePurchases';

export interface NativePaywallStatus {
  enabled: boolean;
  eligible: boolean;
  shown: boolean;
  loginId?: string;
}

const SERVER_REVENUECAT_ID = /^roster_[a-f0-9]{64}$/;

export function hasCanonicalNativePurchaseIdentity(loginId: string, customerId: string): boolean {
  return SERVER_REVENUECAT_ID.test(loginId) && customerId === loginId;
}

export function canPresentNativePaywall(
  status: NativePaywallStatus | null | undefined,
): boolean {
  if (!status || typeof status !== 'object') return false;
  return status.enabled === true &&
    status.eligible === true &&
    status.shown === false &&
    typeof status.loginId === 'string' &&
    SERVER_REVENUECAT_ID.test(status.loginId);
}

/** Only these documented callback outcomes confirm that a paywall appeared. */
export function wasNativePaywallPresented(result: NativelyPaywallResult): boolean {
  const message = result.message.trim().toLowerCase();
  if (message === 'cancelled') return true;
  return result.status.trim().toUpperCase() === 'SUCCESS' &&
    (message === 'purchased' || message === 'restored');
}

export function nativePaywallHasSuccessfulPurchase(result: NativelyPaywallResult): boolean {
  const message = result.message.trim().toLowerCase();
  return result.status.trim().toUpperCase() === 'SUCCESS' &&
    (message === 'purchased' || message === 'restored');
}