import {
  PRODUCT_COMMISSIONER,
  PRODUCT_COMMISSIONER_YEARLY,
  PRODUCT_PLAYER_PRO,
  PRODUCT_PLAYER_PRO_YEARLY,
  type NativelyProductPrice,
} from './nativePurchases';

export type PaidTier = 'player_pro' | 'commissioner';
export type BillingPeriod = 'monthly' | 'yearly';

const PRODUCTS: Record<PaidTier, Record<BillingPeriod, string>> = {
  player_pro: { monthly: PRODUCT_PLAYER_PRO, yearly: PRODUCT_PLAYER_PRO_YEARLY },
  commissioner: { monthly: PRODUCT_COMMISSIONER, yearly: PRODUCT_COMMISSIONER_YEARLY },
};

export function onboardingProductId(tier: PaidTier, period: BillingPeriod): string {
  return PRODUCTS[tier][period];
}

/** No guessing from formatted prices: savings require amounts in the same currency. */
export function annualSavings(products: readonly NativelyProductPrice[], tier: PaidTier): number | undefined {
  const month = products.find(p => p.identifier === PRODUCTS[tier].monthly);
  const year = products.find(p => p.identifier === PRODUCTS[tier].yearly);
  if (!month?.amount || !year?.amount || !month.currencyCode ||
      month.currencyCode !== year.currencyCode) return undefined;
  const percentage = Math.round((1 - year.amount / (month.amount * 12)) * 100);
  return percentage > 0 && percentage < 100 ? percentage : undefined;
}