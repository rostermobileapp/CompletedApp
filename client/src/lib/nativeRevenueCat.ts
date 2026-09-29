import { ApiError, apiRequest, queryClient } from '@/lib/queryClient';
import {
  getNativePurchaseCustomerId,
  isNativelyPurchasesApp,
  loginNativePurchaseAccount,
} from '@/lib/nativePurchases';
import { hasCanonicalNativePurchaseIdentity } from '@/lib/nativePaywall';

const REVENUECAT_ID_PATTERN = /^roster_[a-f0-9]{64}$/;
const DEMO_ACTIVE_KEY = 'roster.demo.active';

export interface RevenueCatSyncResult {
  role: string;
  active: boolean;
}

export interface RevenueCatSyncOptions {
  /** Delays between provider-backed sync attempts when an activation is new. */
  retryDelaysMs?: number[];
  /** Cancels pending retries after logout, account switch, or Demo activation. */
  shouldContinue?: () => boolean;
}

function demoIsActive(): boolean {
  try {
    return typeof window !== 'undefined' &&
      window.localStorage.getItem(DEMO_ACTIVE_KEY) === 'true';
  } catch {
    return false;
  }
}

function assertNativeAccountFlowAllowed(): void {
  if (!isNativelyPurchasesApp()) {
    throw new Error('RevenueCat account linking is available only in the Natively app.');
  }
  if (demoIsActive()) {
    throw new Error('RevenueCat account linking is unavailable in Demo mode.');
  }
}

/** Fetch the existing opaque identity from the authenticated server only. */
export async function getCanonicalNativeRevenueCatId(): Promise<string> {
  assertNativeAccountFlowAllowed();
  const response = await apiRequest('GET', '/api/iap/revenuecat-login-id');
  const data = await response.json() as { loginId?: string };
  if (typeof data.loginId !== 'string' || !REVENUECAT_ID_PATTERN.test(data.loginId)) {
    throw new Error('The server did not provide a valid native purchase identity.');
  }
  return data.loginId;
}

/** Explicit purchase/restore flows may attach this server ID before billing. */
export async function linkNativeRevenueCatAccount(): Promise<string> {
  const loginId = await getCanonicalNativeRevenueCatId();
  await loginNativePurchaseAccount(loginId);
  // A user can switch accounts while the native login callback is pending.
  // Re-read the authenticated server identity before the caller starts billing.
  if (await getCanonicalNativeRevenueCatId() !== loginId) {
    throw new Error('The signed-in account changed during native purchase linking.');
  }
  return loginId;
}

export async function isNativeRevenueCatIdentityAlreadyCanonical(): Promise<boolean> {
  const loginId = await getCanonicalNativeRevenueCatId();
  return hasCanonicalNativePurchaseIdentity(loginId, await getNativePurchaseCustomerId());
}

/**
 * Startup/resume reconciliation is deliberately non-migrating: it only syncs
 * when the native customer already has the canonical server-issued identity.
 * Anonymous or legacy IDs are left untouched for an explicit restore flow.
 */
export async function syncKnownNativeRevenueCatAccount(
  options: RevenueCatSyncOptions = {},
): Promise<RevenueCatSyncResult | null> {
  const retryDelays = options.retryDelaysMs ?? [];
  const shouldContinue = options.shouldContinue ?? (() => true);
  let latest: RevenueCatSyncResult | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, retryDelays[attempt - 1]));
    }
    if (!shouldContinue() || demoIsActive() || !isNativelyPurchasesApp()) return latest;

    try {
      const loginId = await getCanonicalNativeRevenueCatId();
      if (!shouldContinue()) return latest;
      if (!hasCanonicalNativePurchaseIdentity(loginId, await getNativePurchaseCustomerId())) return latest;

      const response = await apiRequest('POST', '/api/iap/revenuecat-sync');
      latest = await response.json() as RevenueCatSyncResult;
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      if (latest.active === true) return latest;
      lastError = undefined;
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && [401, 403].includes(error.status)) throw error;
    }
  }

  if (lastError) throw lastError;
  return latest;
}