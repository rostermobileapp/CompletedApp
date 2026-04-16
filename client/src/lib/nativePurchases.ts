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
 * window.$agent (injected by the Natively native bridge) must be present
 * before any method is called — it is always present in the native app.
 */
const np = new NativelyPurchases();

/**
 * Wraps a Natively callback-style call in a Promise.
 * Rejects if the callback data contains an `error` field or if the
 * underlying trigger throws synchronously.
 */
function toPromise<T>(fn: (cb: (data: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      fn((data: any) => {
        if (data?.error) {
          reject(new Error(String(data.error)));
        } else {
          resolve(data as T);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Returns true when running inside the Natively native shell.
 * window.$agent is injected exclusively by the Natively bridge —
 * it is never present in a browser or the Replit dev preview.
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
 * Fetch the localised price for each subscription product from the App Store
 * via the Natively bridge.
 */
export async function getIosProducts(): Promise<NativelyProductPrice[]> {
  const ids = [
    PRODUCT_PLAYER_PRO,
    PRODUCT_COMMISSIONER,
    PRODUCT_PLAYER_PRO_YEARLY,
    PRODUCT_COMMISSIONER_YEARLY,
  ];

  const results = await Promise.allSettled(
    ids.map((id) =>
      toPromise<any>((cb) => np.packagePrice(id, cb)).then((data) => ({
        identifier: id,
        priceString: data?.price ?? data?.priceString ?? '',
      }))
    )
  );

  return results
    .filter((r): r is PromiseFulfilledResult<NativelyProductPrice> => r.status === 'fulfilled')
    .map((r) => r.value);
}

export interface NativelyTransaction {
  /** The Apple product ID that was purchased */
  productIdentifier: string;
  /**
   * JWS-signed transaction from StoreKit 2 — present when the Natively
   * bridge returns it. Pass this to /api/iap/verify as `jws`.
   */
  jwsRepresentation?: string;
  /** Legacy StoreKit 1 transaction ID */
  transactionId?: string;
  /** Raw callback payload for debugging */
  raw?: any;
}

/**
 * Purchase a subscription via the Natively StoreKit bridge.
 *
 * Natively's `purchasePackage` maps packageId → Apple product ID directly
 * (no RevenueCat is involved). The callback receives the completed transaction.
 */
export async function purchaseProduct(
  packageId: string,
  _appAccountToken?: string
): Promise<NativelyTransaction> {
  const data = await toPromise<any>((cb) => np.purchasePackage(packageId, cb));

  // Log the raw shape for debugging on real devices
  console.log('[IAP] purchasePackage raw response:', JSON.stringify(data));

  if (!data) {
    throw new Error('No response from App Store. Please try again.');
  }

  if (
    data.cancelled === true ||
    data.userCancelled === true ||
    (typeof data.error === 'string' && data.error.toLowerCase().includes('cancel'))
  ) {
    const err: any = new Error('Purchase cancelled');
    err.code = 'PURCHASE_CANCELLED';
    throw err;
  }

  return {
    productIdentifier: packageId,
    jwsRepresentation: data.jwsRepresentation ?? data.jws ?? undefined,
    transactionId: data.transactionId ?? data.transaction_id ?? undefined,
    raw: data,
  };
}

/**
 * Restore previous purchases via the Natively StoreKit bridge.
 * Returns an array of active transactions (may be empty).
 */
export async function restorePurchases(): Promise<NativelyTransaction[]> {
  const data = await toPromise<any>((cb) => np.restore(cb));

  if (data == null) {
    throw new Error('App Store restore returned no data. Please try again.');
  }

  console.log('[IAP] restore raw response:', JSON.stringify(data));

  const items: any[] = data.purchases ?? data.transactions ?? (Array.isArray(data) ? data : []);

  return items.map((item: any) => ({
    productIdentifier: item.productIdentifier ?? item.product_id ?? '',
    jwsRepresentation: item.jwsRepresentation ?? item.jws ?? undefined,
    transactionId: item.transactionId ?? item.transaction_id ?? undefined,
    raw: item,
  }));
}
