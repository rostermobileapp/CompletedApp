import Stripe from "stripe";
import { pool } from "./db";
import { isVerifiedProductionRuntime } from "./runtimePolicy";
import { OrganizerCardPaymentError } from "./organizerCardPaymentMath";
import { canCollectOrganizerCardPayments, canUseOrganizerCardPilot } from "./organizerCardPilot";
import { readDirectAccount } from "./organizerDirectAccounts";

export {
  calculateOrganizerServiceFeeCents,
  OrganizerCardPaymentError,
  parseBaseAmountCents,
} from "./organizerCardPaymentMath";

export function isOrganizerCardPaymentsActiveInCurrentRuntime(): boolean {
  return isVerifiedProductionRuntime()
    ? process.env.ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED === "1"
    : process.env.NONPRODUCTION_ISOLATED === "1";
}

export function assertDirectCollectionEnabled(): void {
  if (isVerifiedProductionRuntime() && process.env.ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED !== "1") {
    throw new OrganizerCardPaymentError("Direct card collection is not enabled yet.", 503, "direct_payments_disabled");
  }
}

export function isDirectCollectionEnabled(): boolean {
  return !isVerifiedProductionRuntime() || process.env.ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED === "1";
}

export function assertDirectOnboardingEnabled(): void {
  if (isVerifiedProductionRuntime() &&
      process.env.ORGANIZER_DIRECT_ONBOARDING_LIVE_ENABLED !== "1" &&
      !isDirectCollectionEnabled()) {
    throw new OrganizerCardPaymentError("Stripe account setup is not enabled yet.", 503, "direct_onboarding_disabled");
  }
}

export async function isOrganizerCardPilotUser(userId: string): Promise<boolean> {
  if (!isVerifiedProductionRuntime()) return true;
  const result = await pool.query<{ display_id: string | null }>(
    "SELECT display_id FROM public.users WHERE id=$1 AND deleted_at IS NULL LIMIT 1",
    [userId],
  );
  return canUseOrganizerCardPilot(true, result.rows[0]?.display_id);
}

export async function assertOrganizerCardPilotUser(userId: string): Promise<void> {
  if (!await isOrganizerCardPilotUser(userId)) {
    throw new OrganizerCardPaymentError(
      "Card payments are not available for this account.",
      403,
      "card_pilot_restricted",
    );
  }
}

export function getOrganizerCardStripe(): Stripe {
  if (isVerifiedProductionRuntime()) {
    if (process.env.ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED !== "1") {
      throw new OrganizerCardPaymentError("Card fee collection is not enabled in production.", 503, "payments_disabled");
    }
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey?.startsWith("sk_live_")) {
      throw new OrganizerCardPaymentError("Live card payments are not configured safely.", 503, "stripe_not_ready");
    }
    return new Stripe(secretKey);
  }

  if (process.env.NONPRODUCTION_ISOLATED !== "1") {
    throw new OrganizerCardPaymentError("Card payments are available only in the isolated test environment.", 503, "payments_disabled");
  }
  const secretKey = process.env.TESTING_STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) {
    throw new OrganizerCardPaymentError("Stripe test mode is not configured.", 503, "stripe_test_not_ready");
  }
  return new Stripe(secretKey);
}

export function getOrganizerCardPaymentsWebhookSecret(): string {
  if (isVerifiedProductionRuntime()) {
    if (process.env.ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED !== "1") {
      throw new OrganizerCardPaymentError("Card fee collection is not enabled in production.", 503, "payments_disabled");
    }
    const secret = process.env.STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET;
    if (!secret?.startsWith("whsec_")) {
      throw new OrganizerCardPaymentError("The card payments webhook is not configured.", 503, "webhook_not_ready");
    }
    return secret;
  }

  if (process.env.NONPRODUCTION_ISOLATED !== "1") {
    throw new OrganizerCardPaymentError("The card payments webhook is available only in the isolated test environment.", 503, "payments_disabled");
  }
  const secret = process.env.TESTING_STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_")) {
    throw new OrganizerCardPaymentError("The Stripe test card payments webhook is not configured.", 503, "webhook_not_ready");
  }
  return secret;
}

export function getOrganizerCardConnectWebhookSecret(): string {
  if (isVerifiedProductionRuntime()) {
    if (process.env.ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED !== "1") {
      throw new OrganizerCardPaymentError("Card fee collection is not enabled in production.", 503, "payments_disabled");
    }
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!secret?.startsWith("whsec_")) {
      throw new OrganizerCardPaymentError("The Connect webhook is not configured.", 503, "webhook_not_ready");
    }
    return secret;
  }

  if (process.env.NONPRODUCTION_ISOLATED !== "1") {
    throw new OrganizerCardPaymentError("The Connect webhook is available only in the isolated test environment.", 503, "payments_disabled");
  }
  const secret = process.env.TESTING_STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_")) {
    throw new OrganizerCardPaymentError("The Stripe test Connect webhook is not configured.", 503, "webhook_not_ready");
  }
  return secret;
}

export function assertOrganizerCardWebhooksReady(): void {
  getOrganizerCardPaymentsWebhookSecret();
  getOrganizerCardConnectWebhookSecret();
}

export async function hasOrganizerCardCollectionEntitlement(userId: string): Promise<boolean> {
  const result = await pool.query<{ display_id: string | null; role: string; fee_exempt: boolean }>(
    "SELECT display_id, role, fee_exempt FROM public.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [userId],
  );
  const user = result.rows[0];
  if (!user) return false;
  // Account-level Pro access qualifies regardless of billing source or fee
  // exemption, including roles granted manually in Supabase.
  return canCollectOrganizerCardPayments({
    displayId: user.display_id, role: user.role, feeExempt: user.fee_exempt,
  });
}

export async function assertOrganizerCardCollectionReady(userId: string): Promise<void> {
  await assertOrganizerCardPilotUser(userId);
  assertDirectCollectionEnabled();
  if (!await hasOrganizerCardCollectionEntitlement(userId)) {
    throw new OrganizerCardPaymentError(
      "Creating card payment requests requires Player Pro access or higher.",
      403,
      "subscription_required",
    );
  }
  assertOrganizerCardWebhooksReady();
  const stripe = getOrganizerCardStripe();
  const account = await getVerifiedConnectedAccountStatus(userId, stripe);
  if (!account.ready) {
    throw new OrganizerCardPaymentError(
      "Complete Stripe onboarding and account verification before enabling card collection.",
      409,
      "organizer_account_not_ready",
    );
  }
}

export type ConnectedAccountStatus = {
  connected: boolean;
  accountId: string | null;
  ready: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDue: string[];
};

export async function getVerifiedConnectedAccountStatus(
  userId: string,
  stripe: Stripe,
): Promise<ConnectedAccountStatus> {
  return readDirectAccount(userId, stripe);
}

