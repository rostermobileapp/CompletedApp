import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import type { Transaction } from '@capgo/native-purchases';
import { v5 as uuidv5 } from 'uuid';

export const PRODUCT_PLAYER_PRO = 'com.rosterapp.player_pro_monthly';
export const PRODUCT_COMMISSIONER = 'com.rosterapp.commissioner_monthly';
export const PRODUCT_PLAYER_PRO_YEARLY = 'com.rosterapp.player_pro_yearly';
export const PRODUCT_COMMISSIONER_YEARLY = 'com.rosterapp.commissioner_yearly';

// Stable namespace UUID for generating deterministic appAccountTokens
const APP_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Returns a deterministic UUID derived from the user ID.
 * This is sent as appAccountToken when purchasing so Apple cryptographically
 * links the transaction to this app user, enabling server-side binding checks.
 */
export function getAppAccountToken(userId: string): string {
  return uuidv5(userId, APP_NAMESPACE);
}

let billingChecked = false;
let billingSupported = false;

export async function isBillingSupported(): Promise<boolean> {
  if (billingChecked) return billingSupported;
  try {
    const result = await NativePurchases.isBillingSupported();
    billingSupported = result.isBillingSupported;
  } catch {
    billingSupported = false;
  }
  billingChecked = true;
  return billingSupported;
}

export async function getIosProducts() {
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [
        PRODUCT_PLAYER_PRO,
        PRODUCT_COMMISSIONER,
        PRODUCT_PLAYER_PRO_YEARLY,
        PRODUCT_COMMISSIONER_YEARLY,
      ],
      productType: PURCHASE_TYPE.SUBS,
    });
    return products;
  } catch (err) {
    console.warn('[IAP] getProducts() failed:', err);
    return [];
  }
}

export async function purchaseProduct(productIdentifier: string, appAccountToken?: string): Promise<Transaction> {
  return await NativePurchases.purchaseProduct({
    productIdentifier,
    productType: PURCHASE_TYPE.SUBS,
    appAccountToken,
  });
}

export async function restorePurchases(): Promise<Transaction[]> {
  const { purchases } = await NativePurchases.restorePurchases({
    productType: PURCHASE_TYPE.SUBS,
  });
  return purchases;
}

export async function getActivePurchases(): Promise<Transaction[]> {
  try {
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
    });
    return purchases.filter((p) => {
      if (p.isActive === false) return false;
      if (p.expirationDate && new Date(p.expirationDate) < new Date()) return false;
      return true;
    });
  } catch (err) {
    console.warn('[IAP] getPurchases() failed:', err);
    return [];
  }
}

export function transactionToRole(transactions: Transaction[]): 'commissioner' | 'player_pro' | null {
  const ids = transactions.map((t) => t.productIdentifier);
  if (ids.includes(PRODUCT_COMMISSIONER)) return 'commissioner';
  if (ids.includes(PRODUCT_PLAYER_PRO)) return 'player_pro';
  return null;
}
