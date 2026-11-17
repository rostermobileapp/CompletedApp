import { OrganizerCardPaymentError } from "./organizerCardPaymentMath";
import { createHash } from "node:crypto";

export const directFeePolicyFingerprint = (configuration: string | undefined) =>
  createHash("sha256").update(configuration ?? "").digest("hex");

export type DirectSurchargePolicy = {
  merchantCountry: "US";
  merchantState: string;
  customerStates: string[];
  brands: string[];
  processorRateBps: number;
  processorFixedCents: number;
  maximumSurchargeBps: number;
  approvedUntil: string;
};

/** Explicit operator-reviewed policy, never a guessed universal Stripe rate. */
export function directSurchargePolicy(accountId: string, json: string | undefined, now = Date.now()): DirectSurchargePolicy | null {
  if (!json) return null;
  let policies: any;
  try { policies = JSON.parse(json); } catch {
    throw new OrganizerCardPaymentError("The processing-fee policy needs support review.", 503, "invalid_fee_policy");
  }
  const p = policies?.[accountId];
  if (p == null) return null;
  if (p.merchantCountry !== "US" || !/^[A-Z]{2}$/.test(p.merchantState ?? "") ||
      !Array.isArray(p.customerStates) || !p.customerStates.length ||
      !p.customerStates.every((s: unknown) => typeof s === "string" && /^[A-Z]{2}$/.test(s)) ||
      !Array.isArray(p.brands) || !p.brands.length || !p.brands.every((s: unknown) => ["visa","mastercard","amex","discover"].includes(String(s))) ||
      !Number.isInteger(p.processorRateBps) || p.processorRateBps < 0 || p.processorRateBps >= 10000 ||
      !Number.isInteger(p.processorFixedCents) || p.processorFixedCents < 0 || p.processorFixedCents > 10000 ||
      !Number.isInteger(p.maximumSurchargeBps) || p.maximumSurchargeBps < 0 || p.maximumSurchargeBps > 300 ||
      !Number.isFinite(Date.parse(p.approvedUntil)) || Date.parse(p.approvedUntil) > now + 366 * 86400_000) {
    throw new OrganizerCardPaymentError("The processing-fee policy needs support review.", 503, "invalid_fee_policy");
  }
  if (Date.parse(p.approvedUntil) <= now) return null;
  return p;
}

export function quoteDirectProcessing(
  base: number,
  preview: any,
  policy: DirectSurchargePolicy | null,
  merchantCountry: string | null,
  merchantState: string | null,
) {
  if (!Number.isSafeInteger(base) || base < 50 || base > 99_000_000) {
    throw new OrganizerCardPaymentError("Card invoices must be between $0.50 and $990,000.", 400, "invalid_card_amount");
  }
  const address = preview?.billing_details?.address;
  const eligible = policy && merchantCountry === policy.merchantCountry && merchantState === policy.merchantState &&
    preview?.type === "card" && preview.card?.funding === "credit" && preview.card?.country === "US" &&
    address?.country === "US" && policy.customerStates.includes(address?.state) &&
    policy.brands.includes(preview.card?.brand);
  if (!eligible) return {
    baseAmountCents: base, processingSurchargeCents: 0, totalAmountCents: base,
    feeExplanation: "No player processing surcharge applies. The organizer covers Stripe processing costs.",
  };
  // Gross-up accounts for the processor charging its percentage on the fee too,
  // but never exceeds the operator-reviewed legal/cost cap on the invoice base.
  const grossUp = Math.ceil((base * policy.processorRateBps + policy.processorFixedCents * 10000) /
    (10000 - policy.processorRateBps));
  const cap = Math.min(Math.floor(base * policy.maximumSurchargeBps / 10000), 99_999_999 - base);
  let surcharge = Math.max(0, Math.min(grossUp, cap));
  // Be conservative about sub-cent processor rounding: never pass more than
  // the floored verified cost; the organizer absorbs any remaining fraction.
  for (let i = 0; i < 4; i++) {
    surcharge = Math.min(surcharge, Math.floor((base + surcharge) * policy.processorRateBps / 10000) + policy.processorFixedCents);
  }
  return {
    baseAmountCents: base, processingSurchargeCents: surcharge, totalAmountCents: base + surcharge,
    feeExplanation: "The disclosed surcharge covers permitted processing costs only. The organizer covers any remaining Stripe costs. A full invoice refund includes this surcharge.",
  };
}

export function isSafeDirectAccount(account: any): boolean {
  return account?.deleted !== true && account?.controller?.losses?.payments === "stripe" &&
    account?.controller?.fees?.payer === "account" &&
    account?.controller?.stripe_dashboard?.type === "full" &&
    account?.controller?.requirement_collection === "stripe";
}

export function directStripeOptions(accountId: string, surcharge = 0) {
  if (!/^acct_[a-zA-Z0-9]+$/.test(accountId)) throw new Error("Invalid connected-account scope.");
  return {
    stripeAccount: accountId,
    // Only this new, optional feature uses the documented surcharge preview.
    // Subscription and historical destination calls retain their original API.
    ...(surcharge > 0 ? { apiVersion: "2026-03-25.preview" as any } : {}),
  };
}
