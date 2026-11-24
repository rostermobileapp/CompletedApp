import { useQuery } from "@tanstack/react-query";

export type SubscriptionPrice = { amount: number | null; currency: string | null };
export type SubscriptionPrices = Partial<Record<
  "player_pro_monthly" | "commissioner_monthly" | "player_pro_yearly" | "commissioner_yearly",
  SubscriptionPrice
>>;

export function formatSubscriptionPrice(price?: SubscriptionPrice): string | null {
  if (price?.amount == null || !Number.isFinite(price.amount) || price.amount < 0 || !price.currency) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: price.currency,
      minimumFractionDigits: price.amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2,
    }).format(price.amount);
  } catch {
    return null;
  }
}

/** All onboarding plan cards share the actual configured Stripe prices. */
export function useSubscriptionPrices() {
  const query = useQuery<SubscriptionPrices>({ queryKey: ["/api/stripe/prices"] });
  return {
    ...query,
    playerProMonthly: formatSubscriptionPrice(query.data?.player_pro_monthly),
    commissionerMonthly: formatSubscriptionPrice(query.data?.commissioner_monthly),
  };
}
