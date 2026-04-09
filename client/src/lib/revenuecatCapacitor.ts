import { Purchases, type PurchasesPackage } from '@revenuecat/purchases-capacitor';

const IOS_PUBLIC_KEY = import.meta.env.VITE_REVENUECAT_IOS_PUBLIC_KEY as string | undefined;

export const RC_ENTITLEMENT_PLAYER_PRO = 'player_pro';
export const RC_ENTITLEMENT_COMMISSIONER = 'commissioner';

export const RC_PACKAGE_PLAYER_PRO = '$rc_monthly_player_pro';
export const RC_PACKAGE_COMMISSIONER = '$rc_monthly_commissioner';

let initialized = false;

export async function initializeRevenueCat(userId: string): Promise<void> {
  if (initialized) return;
  if (!IOS_PUBLIC_KEY) {
    console.warn('[RevenueCat] VITE_REVENUECAT_IOS_PUBLIC_KEY is not set — IAP unavailable');
    return;
  }
  try {
    await Purchases.configure({ apiKey: IOS_PUBLIC_KEY, appUserID: userId });
    initialized = true;
    console.log('[RevenueCat] Configured for user:', userId);
  } catch (err) {
    console.warn('[RevenueCat] configure() failed (expected on web):', err);
  }
}

export async function getIosOfferings() {
  try {
    const result = await Purchases.getOfferings();
    return result.offerings.current ?? null;
  } catch (err) {
    console.warn('[RevenueCat] getOfferings() failed:', err);
    return null;
  }
}

export async function purchaseIosPackage(pkg: PurchasesPackage) {
  const result = await Purchases.purchasePackage({ aPackage: pkg });
  return result.customerInfo;
}

export async function restoreIosPurchases() {
  const result = await Purchases.restorePurchases();
  return result.customerInfo;
}

export async function getIosCustomerInfo() {
  try {
    const result = await Purchases.getCustomerInfo();
    return result.customerInfo;
  } catch (err) {
    console.warn('[RevenueCat] getCustomerInfo() failed:', err);
    return null;
  }
}

export function getActiveEntitlements(customerInfo: any): string[] {
  if (!customerInfo?.entitlements?.active) return [];
  return Object.keys(customerInfo.entitlements.active);
}

export function entitlementToRole(entitlements: string[]): 'commissioner' | 'player_pro' | null {
  if (entitlements.includes(RC_ENTITLEMENT_COMMISSIONER)) return 'commissioner';
  if (entitlements.includes(RC_ENTITLEMENT_PLAYER_PRO)) return 'player_pro';
  return null;
}
