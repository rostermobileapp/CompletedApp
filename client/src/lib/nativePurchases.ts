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

// Each bridge action gets a fresh instance/response ID. Late callbacks must
// not overwrite the callback belonging to a subsequent request.

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
      fn((data: T, error?: { message?: unknown; code?: unknown }) => {
        clearTimeout(timer);
        if (error?.message) {
          if (error.code === 2 || error.code === 'PURCHASE_CANCELLED') {
            reject(Object.assign(new Error('Purchase cancelled'), { code: 'PURCHASE_CANCELLED' }));
          } else {
            reject(new Error('The native billing operation reported an error. Reopen Roster and check store subscriptions before retrying.'));
          }
          return;
        }
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
      console.warn(`[IAP] packagePrice(${id}) failed`);
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
        console.warn(`[IAP/Android] packagePrice(${id}) returned FAILED`);
        return null;
      }
      const priceString = formatPrice(data, true);
      if (priceString) {
        const product = { identifier: id, priceString };
        onProduct?.(product);
        return product;
      } else {
        console.warn(`[IAP/Android] packagePrice(${id}) returned no price`);
      }
    } catch (err: any) {
      console.warn(`[IAP/Android] packagePrice(${id}) failed`);
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

export async function readNativePurchaseIdentity(): Promise<string> {
  const bridge = new NativelyPurchases();
  const data = await toPromise<any>(cb => bridge.customerId(cb));
  if (data?.status !== 'SUCCESS' || typeof data.customerId !== 'string' ||
      !data.customerId.trim() || data.customerId.length > 1500) {
    throw new Error('Roster could not read the native purchase account. Update and reopen the app before purchasing.');
  }
  return data.customerId.trim();
}

export async function associateNativePurchaseAccount(
  loginId: string,
): Promise<{ loginReportedId: string; readBackId: string }> {
  if (!/^roster_(?:ios_)?[a-f0-9]{64}$/.test(loginId)) {
    throw new Error('Purchase-account setup is unavailable. Reopen Roster before purchasing.');
  }
  const bridge = new NativelyPurchases();
  const data = await toPromise<any>(cb => bridge.login(loginId, undefined, cb));
  if (data?.status !== 'SUCCESS' || typeof data.customerId !== 'string' ||
      !data.customerId.trim() || data.customerId.length > 1500) {
    throw new Error('Roster could not link the native purchase account. Update and reopen the app before purchasing.');
  }
  // Do not assume CustomerInfo's original ID is the SDK's current appUserID.
  // The backend checks both observations against its derived subscriber record.
  const loginReportedId = data.customerId.trim();
  let readBackId = await readNativePurchaseIdentity();
  // A SUCCESS explicitly returning our ID can precede native read-back
  // readiness. Retry reads only, never repeat the identity-changing login.
  if (loginReportedId === loginId) {
    for (const delay of [150, 450]) {
      if (readBackId === loginId) break;
      await new Promise(resolve => setTimeout(resolve, delay));
      readBackId = await readNativePurchaseIdentity();
    }
  }
  return { loginReportedId, readBackId };
}

/** Callback success starts server validation; it never grants account access. */
export async function purchaseProduct(
  packageId: string,
): Promise<NativelyTransaction> {
  applyPendingReferralAttribute();
  const bridge = new NativelyPurchases();
  const data = await toPromise<any>(cb => bridge.purchasePackage(packageId, cb), 60_000);
  if (data?.status === 'CANCELLED' ||
      (data?.status === 'FAILED' && /cancel|^\s*2\s*$/i.test(String(data.error ?? '')))) {
    throw Object.assign(new Error('Purchase cancelled'), { code: 'PURCHASE_CANCELLED' });
  }
  if (data?.status !== 'SUCCESS') {
    throw new Error('The App Store did not confirm purchase completion. Check your subscriptions and restore before trying another payment.');
  }
  return { productIdentifier: packageId,
    transactionId: data.transactionId ?? data.transaction_id,
    jwsRepresentation: data.jwsRepresentation ?? data.jws };
}

/**
 * Purchase a subscription via the Natively Google Play Billing bridge (Android).
 *
 * Uses the same `purchasePackage` method as iOS — Natively/RevenueCat routes
 * to the correct store based on the running platform. On Android the callback
 * may omit a token. In that case the backend obtains the store order from
 * the authenticated account's RevenueCat record and independently verifies it.
 */
export async function purchaseProductAndroid(
  packageId: string,
): Promise<{ productIdentifier: string; purchaseToken?: string }> {
  applyPendingReferralAttribute();

  // 60s timeout — enough for the Google Play sheet to come up and the user to
  // tap "Subscribe", but short enough that a non-responding bridge doesn't
  // hang the UI indefinitely. (Default toPromise timeout is 15s which is too
  // tight for an interactive purchase sheet.)
  const data = await toPromise<any>(
    (cb) => new NativelyPurchases().purchasePackage(packageId, cb),
    60_000,
  );

  if (!data) {
    throw new Error('No response from Google Play. Please try again.');
  }

  if (data.status === 'CANCELLED') {
    throw Object.assign(new Error('Purchase cancelled'), { code: 'PURCHASE_CANCELLED' });
  }
  if (data.status === 'FAILED') {
    const errorMsg: string = typeof data.error === 'string' ? data.error : '';
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
    throw new Error('Google Play could not complete this purchase. Check your store subscriptions and use Restore purchases before retrying.');
  }

  if (data.status !== 'SUCCESS') {
    throw new Error('Google Play did not confirm purchase completion. Check your subscriptions and use Restore purchases before trying again.');
  }
  const purchaseToken = extractPurchaseToken(data);
  const productIdentifier = extractProductId(data, packageId);

  return { productIdentifier, ...(purchaseToken ? { purchaseToken } : {}) };
}

/**
 * Restore previous purchases on Android. Mirrors `restorePurchases` for iOS.
 *
 * Caveat: RevenueCat's restore returns aggregated CustomerInfo, and the
 * underlying Google Play purchase token is not always re-surfaced through
 * the bridge. When it is, we forward it for server-side verification; when
 * it isn't, the caller uses authenticated server order recovery. Callback
 * CustomerInfo alone never grants access.
 */
export async function inspectAndroidPurchases(): Promise<AndroidPurchaseStatus> {
  const data = await toPromise<any>((cb) => new NativelyPurchases().restore(cb));
  if (data == null) {
    throw new Error('Google Play restore returned no data. Please try again.');
  }
  if (data.status === 'FAILED') {
    throw new Error('Google Play could not restore purchases. Check the signed-in Play account, then reopen Roster and try Restore purchases.');
  }
  if (!Array.isArray(data) && data.status !== 'SUCCESS') {
    throw new Error('Google Play did not confirm restore completion. Reopen the app and try Restore purchases again.');
  }
  return parseAndroidPurchaseStatus(data);
}

export async function restorePurchasesAndroid(): Promise<AndroidPurchaseResult[]> {
  return (await inspectAndroidPurchases()).purchases;
}

/**
 * Restore previous purchases via the Natively StoreKit bridge.
 */
export async function restorePurchases(): Promise<NativelyTransaction[]> {
  const data = await toPromise<any>((cb) => new NativelyPurchases().restore(cb));

  if (data == null) {
    throw new Error('App Store restore returned no data. Please try again.');
  }

  if (data.status === 'FAILED') {
    throw new Error('The App Store could not restore purchases. Check the signed-in Apple account, then reopen Roster and try Restore purchases.');
  }

  // The restore payload may be an array or have a purchases/transactions array
  if (!Array.isArray(data) && data.status !== 'SUCCESS') {
    throw new Error('The App Store did not confirm restore completion. Reopen the app and try Restore purchases again.');
  }
  const items: any[] = Array.isArray(data)
    ? data
    : data.purchases ?? data.transactions ?? [];

  return items.map((item: any) => ({
    productIdentifier: item.productIdentifier ?? item.product_id ?? '',
    jwsRepresentation: item.jwsRepresentation ?? item.jws ?? undefined,
    transactionId: item.transactionId ?? item.transaction_id ?? undefined,
  }));
}
