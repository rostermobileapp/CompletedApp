import { NativelyPurchases } from 'natively';
import { v5 as uuidv5 } from 'uuid';
import { extractProductId, extractPurchaseToken, isAlreadyOwnedPurchaseError, parseAndroidPurchaseStatus } from './androidPurchaseStatus';
import type { AndroidPurchaseResult, AndroidPurchaseStatus } from './androidPurchaseStatus';
export { isAlreadyOwnedPurchaseError } from './androidPurchaseStatus';

// RevenueCat package identifiers (used by NativelyPurchases bridge)
export const PRODUCT_PLAYER_PRO = 'player_pro_monthly';
export const PRODUCT_COMMISSIONER = 'commissioner_monthly';
export const PRODUCT_PLAYER_PRO_YEARLY = 'player_pro_yearly';
export const PRODUCT_COMMISSIONER_YEARLY = 'commissioner_yearly';

const APP_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export function getAppAccountToken(userId: string): string {
  return uuidv5(userId, APP_NAMESPACE);
}

/**
 * Singleton NativelyPurchases instance.
 * window.$agent is injected by the Natively bridge and is only present
 * inside the native app — never in a browser or the Replit dev preview.
 */
const np = new NativelyPurchases();

/**
 * Wrap a Natively callback into a Promise with a timeout.
 * Always resolves with the raw callback data so callers can inspect `status`.
 * Rejects on timeout (bridge not responding) or synchronous throw.
 */
function toPromise<T>(fn: (cb: (data: T) => void) => void, timeoutMs = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`NATIVELY_TIMEOUT: Native bridge did not respond within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    try {
      fn((data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Returns true when running inside the Natively native iOS shell.
 * window.$agent is injected exclusively by the Natively bridge.
 */
export async function isBillingSupported(): Promise<boolean> {
  const ua = navigator.userAgent;
  return (
    typeof (window as any).$agent !== 'undefined' ||
    ua.includes('Natively/iOS') ||
    ua.includes('Natively/iPadOS')
  );
}

/**
 * True only for the Natively shell that owns this RevenueCat bridge. A
 * Capacitor installation or a normal mobile browser must not show its
 * RevenueCat paywall.
 */
export function isNativelyPurchasesApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return typeof (window as any).$agent !== 'undefined' ||
    ua.includes('Natively/iOS') ||
    ua.includes('Natively/iPadOS') ||
    ua.includes('Natively/Android') ||
    ua.includes('NativelyAndroid');
}

export interface NativelyPaywallResult {
  status: string;
  message: string;
}

const SERVER_REVENUECAT_ID = /^roster_[a-f0-9]{64}$/;

function nativeCustomerIdKind(id: unknown, expectedId?: string): string {
  if (typeof id !== 'string' || !id) return 'missing';
  if (expectedId && id === expectedId) return 'matching account';
  if (id.startsWith('$RCAnonymousID:')) return 'anonymous';
  if (SERVER_REVENUECAT_ID.test(id)) return 'another Roster account';
  return 'unrecognized';
}

/** Only redacted bridge observations are kept here; never include customer IDs. */
export class NativePurchaseLinkError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: readonly string[],
    public readonly anonymousCustomerHash?: string,
  ) {
    super(message);
    this.name = 'NativePurchaseLinkError';
  }
}

async function hashAnonymousCustomerId(id: unknown): Promise<string | undefined> {
  if (typeof id !== 'string' || !/^\$RCAnonymousID:[A-Za-z0-9_-]{20,128}$/.test(id) ||
      !globalThis.crypto?.subtle) return undefined;
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

function nativeCallbackStatus(result: any): string {
  if (result?.status === 'SUCCESS') return 'success';
  if (result?.status === 'FAILED') return 'failed';
  return result?.status == null ? 'missing' : 'other';
}

/**
 * Identify RevenueCat with the authenticated account's opaque ID from the
 * server, then verify the bridge reports that exact identity before billing.
 */
export async function loginNativePurchaseAccount(loginId: string): Promise<void> {
  if (!isNativelyPurchasesApp() || !SERVER_REVENUECAT_ID.test(loginId)) {
    throw new Error('Native purchase account linking is unavailable.');
  }

  const startedAt = Date.now();
  const bridgeVersion = (window as any).natively?.app_version;
  const diagnostics: string[] = [
    `Bridge injected: ${typeof (window as any).$agent !== 'undefined' ? 'yes' : 'no'}`,
    `Natively script loaded: ${(window as any).nativelyLoaded === true ? 'yes' : 'no'}`,
    `Native bridge version: ${typeof bridgeVersion === 'number' && Number.isInteger(bridgeVersion) &&
      bridgeVersion >= 0 && bridgeVersion <= 1000 ? bridgeVersion : 'unknown'}`,
  ];
  const elapsed = () => `${Date.now() - startedAt}ms`;

  try {
    const loginResult = await toPromise<any>((cb) => np.login(loginId, undefined, cb));
    diagnostics.push(`Login callback: ${nativeCallbackStatus(loginResult)}, ` +
      `customer ${nativeCustomerIdKind(loginResult?.customerId, loginId)}, at ${elapsed()}, ` +
      `native error ${loginResult?.error ? 'present' : 'absent'}`);
    if (!loginResult || loginResult.status === 'FAILED') {
      throw new NativePurchaseLinkError('The native purchase login failed.', diagnostics);
    }

    let observedCustomerId: unknown;
    // Some native builds deliver the login callback before customerId reflects
    // the switch. Never bill using the callback alone: require the read-back
    // identity to match exactly, but allow a few seconds for it to settle.
    for (const delayMs of [0, 500, 1500, 3000]) {
      if (delayMs) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      const customerResult = await toPromise<any>((cb) => np.customerId(cb));
      diagnostics.push(`Read-back: ${nativeCallbackStatus(customerResult)}, ` +
        `customer ${nativeCustomerIdKind(customerResult?.customerId, loginId)}, at ${elapsed()}, ` +
        `native error ${customerResult?.error ? 'present' : 'absent'}`);
      if (customerResult?.status === 'FAILED') {
        throw new NativePurchaseLinkError('The native purchase identity check failed.', diagnostics);
      }
      observedCustomerId = customerResult?.customerId;
      if (observedCustomerId === loginId) return;
    }
    throw new NativePurchaseLinkError(
      `The native app did not confirm the signed-in purchase account ` +
      `(login reported ${nativeCustomerIdKind(loginResult.customerId)}; ` +
      `read-back ${nativeCustomerIdKind(observedCustomerId)}).`,
      diagnostics,
      await hashAnonymousCustomerId(observedCustomerId),
    );
  } catch (error) {
    if (error instanceof NativePurchaseLinkError) throw error;
    diagnostics.push(`Bridge exception: ${error instanceof Error && error.message.startsWith('NATIVELY_TIMEOUT')
      ? 'callback timed out' : 'other'}`);
    throw new NativePurchaseLinkError('The native purchase account link did not complete.', diagnostics);
  }
}

/** Read the RevenueCat customer identity on either supported native platform. */
export async function getNativePurchaseCustomerId(): Promise<string> {
  if (!isNativelyPurchasesApp()) {
    throw new Error('Open Roster in the Natively app to check the purchase identity.');
  }
  const data = await toPromise<any>((cb) => np.customerId(cb));
  if (data?.status === 'FAILED') {
    throw new Error(data.error || 'Could not read the native purchase identity.');
  }
  const id = data?.customerId;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('The native app did not provide its purchase identity.');
  }
  return id.trim();
}

/**
 * Present the configured current/default RevenueCat offering through
 * Natively. Older Natively builds may never invoke this callback, so resolve
 * with an unconfirmed timeout outcome rather than holding a claim indefinitely.
 */
export function showNativeRevenueCatPaywall(timeoutMs = 90_000): Promise<NativelyPaywallResult> {
  if (!isNativelyPurchasesApp()) {
    return Promise.reject(new Error('RevenueCat paywall is available only in the Natively app.'));
  }
  if (typeof np.showPaywall !== 'function') {
    return Promise.reject(new Error('The Natively bridge does not support the RevenueCat paywall.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      resolve({ status: 'TIMEOUT', message: 'timeout' });
    }, timeoutMs);
    try {
      np.showPaywall(true, undefined, (data: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!data || typeof data !== 'object') {
          reject(new Error('The native paywall returned no result.'));
          return;
        }
        resolve({
          status: typeof data.status === 'string' ? data.status : '',
          message: typeof data.message === 'string' ? data.message : '',
        });
      });
    } catch (error) {
      settled = true;
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Returns true when running inside the Natively native Android shell.
 *
 * Matches the same belt-and-suspenders logic as isNativelyAndroidApp() in
 * useIosPlatform.ts — checks for exact "Natively/Android" UA first, then
 * falls back to generic "android" UA + $agent for BuildNatively variants
 * whose UA token differs slightly (e.g. "NativelyAndroid", space instead of
 * slash, or no Natively token at all but $agent still injected on Android).
 */
export async function isAndroidBillingSupported(waitMs = 5000): Promise<boolean> {
  if (!navigator.userAgent.toLowerCase().includes('android')) return false;
  if (typeof (window as any).$agent !== 'undefined') return true;

  // The UA is available before the native bridge is injected. A one-time
  // synchronous check can permanently disable billing on a cold app launch.
  return new Promise((resolve) => {
    let settled = false;
    const finish = (supported: boolean) => {
      if (settled) return;
      settled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener('nativelyReady', check);
      resolve(supported);
    };
    const check = () => {
      if (typeof (window as any).$agent !== 'undefined') finish(true);
    };
    const interval = window.setInterval(check, 200);
    const timeout = window.setTimeout(() => finish(false), waitMs);
    window.addEventListener('nativelyReady', check);
    check();
  });
}

export interface NativelyProductPrice {
  identifier: string;
  priceString: string;
}

export function canPurchaseAndroidProduct(
  prices: Record<string, string>,
  productId: string,
  verificationAvailable: boolean | undefined,
  activeProductIds: string[] | undefined,
): boolean {
  return Boolean(prices[productId]) &&
    verificationAvailable === true &&
    Boolean(activeProductIds?.includes(productId));
}

/**
 * Convert a raw Natively price payload to a clean display string.
 * Natively returns price as a float (e.g. 124.990000000000001), so we
 * round to 2 decimal places and prepend the currency symbol if needed.
 */
function formatPrice(data: any, requireCurrency = false): string {
  // Prefer a pre-formatted string from the bridge
  for (const candidate of [data?.priceString, data?.formattedPrice, data?.localizedPrice]) {
    if (typeof candidate === 'string' && candidate.trim() && !/^\d+(?:\.\d+)?$/.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  const raw = data?.price;
  if (raw == null) return '';
  if (typeof raw === 'string' && !/^\d+(?:\.\d+)?$/.test(raw.trim())) return raw.trim();
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return '';
  const currency = data?.currencyCode ?? data?.currency ?? data?.priceCurrencyCode;
  if (typeof currency === 'string' && /^[A-Z]{3}$/i.test(currency)) {
    return new Intl.NumberFormat(navigator.language, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  }
  // An amount alone has no trustworthy currency. Android must not show a
  // guessed dollar price beside a real Google Play payment.
  return requireCurrency ? '' : `$${amount.toFixed(2)}`;
}

/**
 * Fetch the localised App Store price for each subscription product.
 * Called sequentially — each call gets its own NativelyPurchases instance
 * so the native bridge assigns a unique ID to each and fires all callbacks.
 * Parallel calls sharing one instance cause only the last callback to fire.
 */
export async function getIosProducts(): Promise<NativelyProductPrice[]> {
  const ids = [
    PRODUCT_PLAYER_PRO,
    PRODUCT_COMMISSIONER,
    PRODUCT_PLAYER_PRO_YEARLY,
    PRODUCT_COMMISSIONER_YEARLY,
  ];

  const results: NativelyProductPrice[] = [];

  for (const id of ids) {
    try {
      const instance = new NativelyPurchases();
      const data = await toPromise<any>((cb) => instance.packagePrice(id, cb), 10000);
      const priceString = formatPrice(data);
      if (priceString) {
        results.push({ identifier: id, priceString });
      }
    } catch (err: any) {
      console.warn(`[IAP] packagePrice(${id}) failed:`, err?.message ?? err);
    }
  }

  return results;
}

/**
 * Fetch the localised Google Play price for each subscription product.
 *
 * Implementation note: NativelyPurchases wraps RevenueCat under the hood,
 * so `packagePrice(id, cb)` is platform-agnostic — on Android the bridge
 * routes to RevenueCat → Google Play Billing and returns the localised
 * Play price. We use the same per-call instance pattern as iOS.
 */
export async function getAndroidProducts(
  onProduct?: (product: NativelyProductPrice) => void,
): Promise<NativelyProductPrice[]> {
  const ids = [
    PRODUCT_PLAYER_PRO,
    PRODUCT_COMMISSIONER,
    PRODUCT_PLAYER_PRO_YEARLY,
    PRODUCT_COMMISSIONER_YEARLY,
  ];

  // Each call has its own bridge instance/ID. Query together so one missing
  // SKU cannot hold the other three prices behind four serial 10s timeouts.
  const results = await Promise.all(ids.map(async (id): Promise<NativelyProductPrice | null> => {
    try {
      const instance = new NativelyPurchases();
      const data = await toPromise<any>((cb) => instance.packagePrice(id, cb), 10000);
      if (data?.status === 'FAILED') {
        console.warn(`[IAP/Android] packagePrice(${id}) returned FAILED:`, String(data.error ?? 'unknown error').slice(0, 120));
        return null;
      }
      const priceString = formatPrice(data, true);
      if (priceString) {
        const product = { identifier: id, priceString };
        onProduct?.(product);
        return product;
      } else {
        console.warn(`[IAP/Android] packagePrice(${id}) returned no price (status=${String(data?.status ?? 'unknown')})`);
      }
    } catch (err: any) {
      console.warn(`[IAP/Android] packagePrice(${id}) failed:`, err?.message ?? err);
    }
    return null;
  }));

  return results.filter((product): product is NativelyProductPrice => product !== null);
}

export interface NativelyTransaction {
  /** The Apple product ID that was purchased */
  productIdentifier: string;
  /** StoreKit 2 JWS-signed transaction — preferred for server verification */
  jwsRepresentation?: string;
  /** StoreKit 1 transaction ID — fallback for server verification */
  transactionId?: string;
  /** Raw callback payload — logged for debugging */
  raw?: any;
}

/**
 * Set RevenueCat subscriber attributes via the raw Natively bridge before a
 * purchase. Used to attach the referral code so revenue can be attributed to
 * the referring partner. This is a best-effort, fire-and-forget call — it
 * never throws so it cannot block the purchase flow.
 *
 * RevenueCat bridge event: "purchases_setattributes" (undocumented in Natively
 * but consistent with the naming convention used by other purchases_* events).
 */
export function setSubscriberAttributes(attributes: Record<string, string>): void {
  try {
    const ctx = (window as any).natively;
    if (ctx && typeof ctx.trigger === 'function') {
      ctx.trigger(
        `attr_${Date.now()}`,
        3,
        undefined,
        'purchases_setattributes',
        { attributes },
      );
    }
  } catch {
    // silent — attribute setting should never break the purchase flow
  }
}

/**
 * Read the pending referral code from localStorage and push it to RevenueCat
 * as a subscriber attribute. Called once before any purchase so attribution
 * is recorded regardless of when the user enters the paywall.
 */
function applyPendingReferralAttribute(): void {
  try {
    const code = localStorage.getItem('pendingReferralCode');
    if (code) {
      setSubscriberAttributes({ referral_code: code });
    }
  } catch {
    // ignore localStorage errors in restricted contexts
  }
}

/**
 * Purchase a subscription via the Natively StoreKit bridge.
 *
 * Natively callback shape (from Natively docs):
 *   resp.status        — "SUCCESS" or "FAILED"
 *   resp.transactionId — Apple transaction ID (may be absent in some builds)
 *   resp.error         — error message when status is "FAILED"
 *   resp.jwsRepresentation — StoreKit 2 JWS (if available)
 */
/**
 * Note: The Natively/RevenueCat bridge (`purchasePackage`) does not support
 * passing an appAccountToken to StoreKit. Server verification therefore cannot
 * rely on that field being present and proceeds on JWS cryptographic proof alone.
 */
export async function purchaseProduct(
  packageId: string,
): Promise<NativelyTransaction> {
  applyPendingReferralAttribute();
  const data = await toPromise<any>((cb) => np.purchasePackage(packageId, cb));

  if (!data) {
    throw new Error('No response from App Store. Please try again.');
  }

  // Handle failure status
  if (data.status === 'FAILED') {
    const errorMsg: string = data.error ?? '';
    // StoreKit cancellation: SKErrorPaymentCancelled (code 2) or user-cancelled strings
    if (
      errorMsg.includes('2') ||
      errorMsg.toLowerCase().includes('cancel')
    ) {
      const err: any = new Error('Purchase cancelled');
      err.code = 'PURCHASE_CANCELLED';
      throw err;
    }
    throw new Error(errorMsg || 'Purchase failed. Please try again.');
  }

  // status === 'SUCCESS' (or undefined in older Natively builds — treat non-FAILED as success)
  const transactionId: string | undefined =
    data.transactionId ?? data.transaction_id ?? undefined;
  const jwsRepresentation: string | undefined =
    data.jwsRepresentation ?? data.jws ?? undefined;

  if (!transactionId && !jwsRepresentation) {
    throw new Error(
      'Purchase completed but no transaction data was returned. Please contact support.'
    );
  }

  return {
    productIdentifier: packageId,
    jwsRepresentation,
    transactionId,
    raw: data,
  };
}

/**
 * Purchase a subscription via the Natively Google Play Billing bridge (Android).
 *
 * Uses the same `purchasePackage` method as iOS — Natively/RevenueCat routes
 * to the correct store based on the running platform. On Android the callback
 * payload includes a Google Play purchase token, which the server uses to
 * verify the purchase against the Play Developer API.
 */
export async function purchaseProductAndroid(
  packageId: string,
): Promise<AndroidPurchaseResult> {
  applyPendingReferralAttribute();
  console.log('[IAP/Android] purchasePackage() →', packageId, {
    hasAgent: typeof (window as any).$agent !== 'undefined',
    hasNatively: !!(window as any).natively,
    hasPurchasePackage: typeof (np as any).purchasePackage === 'function',
    ua: navigator.userAgent,
  });

  // 60s timeout — enough for the Google Play sheet to come up and the user to
  // tap "Subscribe", but short enough that a non-responding bridge doesn't
  // hang the UI indefinitely. (Default toPromise timeout is 15s which is too
  // tight for an interactive purchase sheet.)
  const data = await toPromise<any>(
    (cb) => np.purchasePackage(packageId, cb),
    60_000,
  );

  console.log('[IAP/Android] purchasePackage() callback received', { status: data?.status });

  if (!data) {
    throw new Error('No response from Google Play. Please try again.');
  }

  if (data.status === 'FAILED') {
    const errorMsg: string = data.error ?? '';
    const lowered = errorMsg.toLowerCase();
    if (lowered.includes('cancel') || lowered.includes('user_canceled')) {
      const err: any = new Error('Purchase cancelled');
      err.code = 'PURCHASE_CANCELLED';
      throw err;
    }
    if (lowered.includes('billing_unavailable')) {
      throw new Error(
        'Google Play Billing is unavailable on this device. Make sure your Google account is signed in and the Play Store is up to date.',
      );
    }
    if (isAlreadyOwnedPurchaseError(errorMsg)) {
      const err: any = new Error('This subscription is already on your Google Play account. Do not buy it again; use Restore Purchases.');
      err.code = 'PURCHASE_ALREADY_OWNED';
      throw err;
    }
    if (lowered.includes('item_unavailable') || lowered.includes('item_not_owned')) {
      throw new Error(
        "This subscription isn't available right now. New products can take a few hours to propagate from Play Console — please try again shortly.",
      );
    }
    throw new Error(errorMsg || 'Purchase failed. Please try again.');
  }

  const purchaseToken = extractPurchaseToken(data);
  const productIdentifier = extractProductId(data, packageId);

  if (!purchaseToken) {
    throw new Error(
      'Purchase completed but no purchase token was returned. Please tap Restore Purchases or contact support.',
    );
  }

  return { productIdentifier, purchaseToken, raw: data };
}

/**
 * Restore previous purchases on Android. Mirrors `restorePurchases` for iOS.
 *
 * Caveat: RevenueCat's restore returns aggregated CustomerInfo, and the
 * underlying Google Play purchase token is not always re-surfaced through
 * the bridge. When it is, we forward it for server-side verification; when
 * it isn't, the caller should fall back to a generic "Restore initiated"
 * message and let the user contact support if the entitlement doesn't apply.
 */
export async function inspectAndroidPurchases(): Promise<AndroidPurchaseStatus> {
  const data = await toPromise<any>((cb) => np.restore(cb));
  if (data == null) {
    throw new Error('Google Play restore returned no data. Please try again.');
  }
  if (data.status === 'FAILED') {
    throw new Error(data.error ?? 'Restore failed. Please try again.');
  }
  return parseAndroidPurchaseStatus(data);
}

export async function restorePurchasesAndroid(): Promise<AndroidPurchaseResult[]> {
  return (await inspectAndroidPurchases()).purchases;
}

/** Read the native RevenueCat identity before any login/logout operation.
 * It is used only alongside a verified Google order's account binding.
 */
export async function getAndroidPurchaseCustomerId(): Promise<string> {
  if (!await isAndroidBillingSupported()) {
    throw new Error('Open Roster in the Android app to recover a Google Play purchase.');
  }
  return getNativePurchaseCustomerId();
}

/** Identify RevenueCat with a server-issued ID for the authenticated Roster
 * account. Called only when the user chooses to restore an existing purchase.
 */
export async function loginAndroidPurchaseAccount(loginId: string): Promise<void> {
  if (!await isAndroidBillingSupported() || !/^roster_[a-f0-9]{64}$/.test(loginId)) {
    throw new Error('Android purchase account linking is unavailable.');
  }
  const data = await toPromise<any>((cb) => np.login(loginId, undefined, cb));
  if (data?.status === 'FAILED' || !data) {
    throw new Error(data?.error || 'Could not link the Android purchase account.');
  }
  if (await getAndroidPurchaseCustomerId() !== loginId) {
    throw new Error('The Android app did not confirm the linked purchase account.');
  }
}

/**
 * Restore previous purchases via the Natively StoreKit bridge.
 */
export async function restorePurchases(): Promise<NativelyTransaction[]> {
  const data = await toPromise<any>((cb) => np.restore(cb));

  if (data == null) {
    throw new Error('App Store restore returned no data. Please try again.');
  }

  if (data.status === 'FAILED') {
    throw new Error(data.error ?? 'Restore failed. Please try again.');
  }

  // The restore payload may be an array or have a purchases/transactions array
  const items: any[] = Array.isArray(data)
    ? data
    : data.purchases ?? data.transactions ?? [];

  return items.map((item: any) => ({
    productIdentifier: item.productIdentifier ?? item.product_id ?? '',
    jwsRepresentation: item.jwsRepresentation ?? item.jws ?? undefined,
    transactionId: item.transactionId ?? item.transaction_id ?? undefined,
    raw: item,
  }));
}
