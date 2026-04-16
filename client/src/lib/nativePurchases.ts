import { NativelyPurchases } from 'natively';
import { v5 as uuidv5 } from 'uuid';

export const PRODUCT_PLAYER_PRO = 'com.rosterapp.player_pro_monthly';
export const PRODUCT_COMMISSIONER = 'com.rosterapp.commissioner_monthly';
export const PRODUCT_PLAYER_PRO_YEARLY = 'com.rosterapp.player_pro_yearly';
export const PRODUCT_COMMISSIONER_YEARLY = 'com.rosterapp.commissioner_yearly';

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
 * Wrap a Natively callback into a Promise.
 * Always resolves with the raw callback data so callers can inspect `status`.
 * Rejects only on synchronous throw (e.g. bridge not initialised).
 */
function toPromise<T>(fn: (cb: (data: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      fn((data: T) => resolve(data));
    } catch (err) {
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

export interface NativelyProductPrice {
  identifier: string;
  priceString: string;
}

/**
 * Fetch the localised App Store price for each subscription product.
 * Logs the raw Natively response for debugging.
 */
export async function getIosProducts(): Promise<NativelyProductPrice[]> {
  const ids = [
    PRODUCT_PLAYER_PRO,
    PRODUCT_COMMISSIONER,
    PRODUCT_PLAYER_PRO_YEARLY,
    PRODUCT_COMMISSIONER_YEARLY,
  ];

  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const data = await toPromise<any>((cb) => np.packagePrice(id, cb));
      console.log(`[IAP] packagePrice(${id}) raw:`, JSON.stringify(data));
      return {
        identifier: id,
        priceString: data?.price ?? data?.priceString ?? '',
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<NativelyProductPrice> => r.status === 'fulfilled')
    .map((r) => r.value);
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
  const data = await toPromise<any>((cb) => np.purchasePackage(packageId, cb));

  // Always log the raw payload so the debug panel captures the exact shape
  console.log('[IAP] purchasePackage raw response:', JSON.stringify(data));

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
 * Restore previous purchases via the Natively StoreKit bridge.
 */
export async function restorePurchases(): Promise<NativelyTransaction[]> {
  const data = await toPromise<any>((cb) => np.restore(cb));

  console.log('[IAP] restore raw response:', JSON.stringify(data));

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
