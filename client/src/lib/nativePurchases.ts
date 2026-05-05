import { NativelyPurchases } from 'natively';
import { v5 as uuidv5 } from 'uuid';

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
 * Returns true when running inside the Natively native Android shell.
 *
 * Matches the same belt-and-suspenders logic as isNativelyAndroidApp() in
 * useIosPlatform.ts — checks for exact "Natively/Android" UA first, then
 * falls back to generic "android" UA + $agent for BuildNatively variants
 * whose UA token differs slightly (e.g. "NativelyAndroid", space instead of
 * slash, or no Natively token at all but $agent still injected on Android).
 */
export async function isAndroidBillingSupported(): Promise<boolean> {
  const ua = navigator.userAgent;
  const hasAgent = typeof (window as any).$agent !== 'undefined';
  if (ua.includes('Natively/Android') && hasAgent) return true;
  if (ua.toLowerCase().includes('android') && hasAgent) return true;
  return false;
}

export interface NativelyProductPrice {
  identifier: string;
  priceString: string;
}

/**
 * Convert a raw Natively price payload to a clean display string.
 * Natively returns price as a float (e.g. 124.990000000000001), so we
 * round to 2 decimal places and prepend the currency symbol if needed.
 */
function formatPrice(data: any): string {
  // Prefer a pre-formatted string from the bridge
  if (data?.priceString && typeof data.priceString === 'string' && data.priceString.trim()) {
    return data.priceString.trim();
  }
  const raw = data?.price;
  if (raw == null) return '';
  if (typeof raw === 'number') {
    return `$${raw.toFixed(2)}`;
  }
  return String(raw).trim();
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
export async function getAndroidProducts(): Promise<NativelyProductPrice[]> {
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
      console.warn(`[IAP/Android] packagePrice(${id}) failed:`, err?.message ?? err);
    }
  }

  return results;
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
export async function purchaseProduct(
  packageId: string,
  _appAccountToken?: string
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

export interface AndroidPurchaseResult {
  /** Google Play SKU (e.g. "player_pro_monthly") */
  productIdentifier: string;
  /** Google Play purchase token — the only field needed for server verification */
  purchaseToken: string;
  /** Raw callback payload — logged for debugging */
  raw?: any;
}

/**
 * Extract the Google Play purchase token from a Natively/RevenueCat callback
 * payload. Different bridge versions surface this under different keys, so we
 * check the common ones.
 */
function extractPurchaseToken(data: any): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const candidates = [
    data.purchaseToken,
    data.googlePurchaseToken,
    data.purchase_token,
    data.token,
    data.transactionId, // RevenueCat sometimes returns the purchase token as transactionId on Android
    data.transaction_id,
    data.originalPurchaseToken,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  // Some bridges nest the token under a productInfo / transaction object
  if (data.transaction) {
    const nested = extractPurchaseToken(data.transaction);
    if (nested) return nested;
  }
  return undefined;
}

function extractProductId(data: any, fallback?: string): string {
  if (!data || typeof data !== 'object') return fallback ?? '';
  return (
    data.productIdentifier ??
    data.product_id ??
    data.productId ??
    data.sku ??
    fallback ??
    ''
  );
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

  console.log('[IAP/Android] purchasePackage() callback fired with:', data);

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
export async function restorePurchasesAndroid(): Promise<AndroidPurchaseResult[]> {
  const data = await toPromise<any>((cb) => np.restore(cb));

  if (data == null) {
    throw new Error('Google Play restore returned no data. Please try again.');
  }

  if (data.status === 'FAILED') {
    throw new Error(data.error ?? 'Restore failed. Please try again.');
  }

  const items: any[] = Array.isArray(data)
    ? data
    : data.purchases ?? data.transactions ?? data.activeSubscriptions ?? [];

  const results: AndroidPurchaseResult[] = [];
  for (const item of items) {
    const purchaseToken = extractPurchaseToken(item);
    const productIdentifier = extractProductId(item);
    if (purchaseToken) {
      results.push({ productIdentifier, purchaseToken, raw: item });
    }
  }

  // If the wrapper response itself carries a token (common when there's only
  // one active sub), include it as a single result.
  if (results.length === 0) {
    const purchaseToken = extractPurchaseToken(data);
    const productIdentifier = extractProductId(data);
    if (purchaseToken) {
      results.push({ productIdentifier, purchaseToken, raw: data });
    }
  }

  return results;
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
