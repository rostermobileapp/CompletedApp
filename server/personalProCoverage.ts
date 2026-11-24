import type { AccountPro } from "../shared/proCoverage";
import type { ProAccount } from "./proCoverageService";

export type PurchaseEvidence = {
  apple?: { expires?: string | null; revoked?: boolean; product?: string | null } | null;
  google?: { expires?: string | null; product?: string | null } | null;
};
/** Historical token-ownership backfills have neither a product nor a verified
 * period. Their existence proves neither active payment nor expiry. */
function hasManagedEvidence(purchase: PurchaseEvidence["apple"]): boolean {
  return !!purchase && (!!purchase.product?.trim() || purchase.revoked === true ||
    (!!purchase.expires && Number.isFinite(+new Date(purchase.expires))));
}
export type StripeEvidence = { active: boolean; validUntil: string | null };
export function resolvePersonalPro(
  account: ProAccount, evidence: PurchaseEvidence, stripe?: StripeEvidence, now = Date.now(),
): AccountPro {
  if (account.feeExempt || account.isPrimaryCommissioner) {
    return { personal: false, legacy: true, source: "operational" };
  }
  for (const [source, purchase] of [["apple", evidence.apple], ["google", evidence.google]] as const) {
    if (purchase && !("revoked" in purchase && purchase.revoked) && purchase.expires &&
        +new Date(purchase.expires) > now &&
        /^(com\.rosterapp\.)?(player_pro|commissioner)_(monthly|yearly)$/.test(purchase.product ?? "")) {
      return { personal: true, legacy: false, source, validUntil: new Date(purchase.expires).toISOString() };
    }
  }
  if (account.stripeSubscriptionId && stripe) return {
    personal: stripe.active && !!stripe.validUntil && +new Date(stripe.validUntil) > now,
    legacy: account.role === "secondary_commissioner", source: "stripe", validUntil: stripe.validUntil,
  };
  if (account.role === "secondary_commissioner") return { personal: false, legacy: true, source: "legacy_grant" };
  if (account.stripeSubscriptionId || hasManagedEvidence(evidence.apple) || hasManagedEvidence(evidence.google)) {
    return { personal: false, legacy: false, source: "none" };
  }
  // An old transaction identifier without a current claim is not proof of
  // expiry (or of payment). Preserve its existing role as legacy access until
  // historical reconciliation is separately approved; never call it personal.
  const legacy = ["player_pro", "commissioner"].includes(account.role ?? "");
  return { personal: false, legacy, source: legacy ? "legacy_grant" : "none" };
}
