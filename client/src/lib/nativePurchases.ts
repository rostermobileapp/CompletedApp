import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import type { Transaction } from '@capgo/native-purchases';

export const PRODUCT_PLAYER_PRO = 'com.rosterapp.player_pro_monthly';
export const PRODUCT_COMMISSIONER = 'com.rosterapp.commissioner_monthly';

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
      productIdentifiers: [PRODUCT_PLAYER_PRO, PRODUCT_COMMISSIONER],
      productType: PURCHASE_TYPE.SUBS,
    });
    return products;
  } catch (err) {
    console.warn('[IAP] getProducts() failed:', err);
    return [];
  }
}

export async function purchaseProduct(productIdentifier: string): Promise<Transaction> {
  return await NativePurchases.purchaseProduct({
    productIdentifier,
    productType: PURCHASE_TYPE.SUBS,
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
