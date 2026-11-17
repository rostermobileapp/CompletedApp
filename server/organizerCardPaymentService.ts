import Stripe from "stripe";
import { pool } from "./db";
import { isVerifiedProductionRuntime } from "./runtimePolicy";
import { OrganizerCardPaymentError } from "./organizerCardPaymentMath";

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

export async function hasPersonalProEntitlement(userId: string): Promise<boolean> {
  const result = await pool.query<{ role: string; fee_exempt: boolean }>(
    "SELECT role, fee_exempt FROM public.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [userId],
  );
  const user = result.rows[0];
  if (!user || user.fee_exempt) return false;
  const role = user.role;
  // The synced global role is the personal subscription entitlement. League
  // seats, commissioner permissions, and fee-exempt status do not qualify.
  return role === "player_pro" || role === "secondary_commissioner" || role === "commissioner";
}

export async function assertOrganizerCardCollectionReady(userId: string): Promise<void> {
  if (!await hasPersonalProEntitlement(userId)) {
    throw new OrganizerCardPaymentError(
      "Creating card payment requests requires your own active Player Pro subscription or higher.",
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
  const result = await pool.query<{
    stripe_account_id: string | null;
  }>(
    "SELECT stripe_account_id FROM public.stripe_connected_accounts WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  const accountId = result.rows[0]?.stripe_account_id;
  if (!accountId) {
    return {
      connected: false,
      accountId: null,
      ready: false,
      detailsSubmitted: false,
      chargesEnabled: false,
      transfersEnabled: false,
      payoutsEnabled: false,
      currentlyDue: [],
    };
  }

  const account = await stripe.accounts.retrieve(accountId);
  const detailsSubmitted = account.details_submitted === true;
  const chargesEnabled = account.charges_enabled === true;
  const transfersEnabled = account.capabilities?.transfers === "active";
  const payoutsEnabled = account.payouts_enabled === true;
  const currentlyDue = account.requirements?.currently_due ?? [];
  await pool.query(
    `UPDATE public.stripe_connected_accounts
     SET details_submitted = $2,
         charges_enabled = $3,
         transfers_enabled = $4,
         payouts_enabled = $5,
         requirements_currently_due = $6,
         updated_at = now()
     WHERE user_id = $1`,
    [userId, detailsSubmitted, chargesEnabled, transfersEnabled, payoutsEnabled, currentlyDue],
  );

  return {
    connected: true,
    accountId,
    ready: detailsSubmitted && transfersEnabled && payoutsEnabled,
    detailsSubmitted,
    chargesEnabled,
    transfersEnabled,
    payoutsEnabled,
    currentlyDue,
  };
}

