import { NativelyPurchases } from 'natively';
import { v5 as uuidv5 } from 'uuid';

export const PRODUCT_PLAYER_PRO = 'com.rosterapp.player_pro_monthly';
export const PRODUCT_COMMISSIONER = 'com.rosterapp.commissioner_monthly';
export const PRODUCT_PLAYER_PRO_YEARLY = 'com.rosterapp.player_pro_yearly';
export const PRODUCT_COMMISSIONER_YEARLY = 'com.rosterapp.commissioner_yearly';

// Stable namespace UUID for generating deterministic appAccountTokens
const APP_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export function getAppAccountToken(userId: string): string {
  return uuidv5(userId, APP_NAMESPACE);
}

// Singleton NativelyPurchases instance
const nativelyPurchases = new NativelyPurchases();

/**
 * Wrap the Natively callback-style API in a Promise.
 * The callback receives a single object; if it has an `error` field we reject.
 */
function callbackToPromise<T>(fn: (cb: (data: T) => void) => void): Promise<T> {
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
 * Returns true when running inside the Natively native app shell.
 * window.$agent is injected by the Natively bridge — it is never present in a browser.
 */
export async function isBillingSupported(): Promise<boolean> {
  const ua = navigator.userAgent;
  const isNatively =
    typeof (window as any).$agent !== 'undefined' ||
    ua.includes('Natively/iOS') ||
    ua.includes('Natively/iPadOS');
  return isNatively;
}

export interface NativelyProductInfo {
  identifier: string;
  priceString: string;
}

/**
 * Fetch the localised price for each product from RevenueCat via Natively.
 */
export async function getIosProducts(): Promise<NativelyProductInfo[]> {
  const ids = [
    PRODUCT_PLAYER_PRO,
    PRODUCT_COMMISSIONER,
    PRODUCT_PLAYER_PRO_YEARLY,
    PRODUCT_COMMISSIONER_YEARLY,
  ];

  const results: NativelyProductInfo[] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const data = await callbackToPromise<any>((cb) =>
          nativelyPurchases.packagePrice(id, cb)
        );
        results.push({ identifier: id, priceString: data?.price ?? data?.priceString ?? '' });
      } catch (err) {
        console.warn('[IAP] packagePrice failed for', id, err);
      }
    })
  );
  return results;
}

export interface NativelyTransaction {
  productIdentifier: string;
  rcAppUserId?: string;
  customerInfo?: any;
}

/**
 * Log the user into RevenueCat using their app user ID so that the purchase
 * is attributed to their account.
 */
async function loginToRevenueCat(userId: string): Promise<void> {
  try {
    await callbackToPromise<any>((cb) =>
      nativelyPurchases.login(userId, undefined, cb)
    );
  } catch (err) {
    console.warn('[IAP] RevenueCat login failed:', err);
  }
}

/**
 * Purchase a subscription package via RevenueCat / Natively.
 * The packageId must match the RevenueCat package identifier configured in
 * your Natively / RevenueCat offering.
 */
export async function purchaseProduct(
  packageId: string,
  appAccountToken?: string
): Promise<NativelyTransaction> {
  // Bind the purchase to the app user so RevenueCat can associate it
  if (appAccountToken) {
    await loginToRevenueCat(appAccountToken);
  }

  const data = await callbackToPromise<any>((cb) =>
    nativelyPurchases.purchasePackage(packageId, cb)
  );

  if (!data) {
    throw new Error('No response from App Store. Please try again.');
  }

  // Detect user-initiated cancellation
  if (data.cancelled === true || data.userCancelled === true) {
    const err: any = new Error('Purchase cancelled');
    err.code = 'PURCHASE_CANCELLED';
    throw err;
  }

  const customerInfo = data.customerInfo ?? data;
  const rcAppUserId =
    customerInfo?.originalAppUserId ?? customerInfo?.appUserId ?? appAccountToken;

  return {
    productIdentifier: packageId,
    rcAppUserId,
    customerInfo,
  };
}

/**
 * Restore existing purchases via RevenueCat / Natively.
 */
export async function restorePurchases(userId?: string): Promise<NativelyTransaction[]> {
  if (userId) {
    await loginToRevenueCat(userId);
  }

  const data = await callbackToPromise<any>((cb) =>
    nativelyPurchases.restore(cb)
  );

  if (data == null) {
    throw new Error('App Store restore returned no data. Please try again.');
  }

  const customerInfo = data.customerInfo ?? data;
  const activeSubscriptions: string[] = customerInfo?.activeSubscriptions ?? [];
  const rcAppUserId =
    customerInfo?.originalAppUserId ?? customerInfo?.appUserId ?? userId;

  if (activeSubscriptions.length === 0) {
    return [];
  }

  return activeSubscriptions.map((productId: string) => ({
    productIdentifier: productId,
    rcAppUserId,
    customerInfo,
  }));
}
