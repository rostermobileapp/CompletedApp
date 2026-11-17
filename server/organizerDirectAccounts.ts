import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { pool } from "./db";
import { OrganizerCardPaymentError } from "./organizerCardPaymentMath";
import { isSafeDirectAccount } from "./organizerDirectPricing";

export async function readDirectAccount(userId: string, stripe: Stripe) {
  const result = await pool.query<{ stripe_account_id: string | null }>(
    "SELECT stripe_account_id FROM public.organizer_direct_accounts WHERE user_id=$1 LIMIT 1", [userId],
  );
  const id = result.rows[0]?.stripe_account_id;
  if (!id) return {
    connected: false, accountId: null, ready: false, detailsSubmitted: false,
    chargesEnabled: false, transfersEnabled: false, payoutsEnabled: false, currentlyDue: [],
  };
  const account = await stripe.accounts.retrieve(id);
  if ("deleted" in account && account.deleted) {
    throw new OrganizerCardPaymentError("This Stripe account is no longer connected. Contact support.", 409, "direct_account_unavailable");
  }
  const safe = isSafeDirectAccount(account);
  return {
    connected: true, accountId: id,
    ready: safe && account.country === "US" && account.details_submitted && account.charges_enabled && account.payouts_enabled &&
      account.capabilities?.card_payments === "active",
    detailsSubmitted: account.details_submitted, chargesEnabled: account.charges_enabled,
    transfersEnabled: account.capabilities?.transfers === "active", payoutsEnabled: account.payouts_enabled,
    currentlyDue: account.requirements?.currently_due ?? [],
    accountModel: "direct" as const, responsibilityVerified: safe,
  };
}

export async function onboardDirectAccount(userId: string, stripe: Stripe, origin: string) {
  await pool.query(
    `INSERT INTO public.organizer_direct_accounts(user_id,creation_idempotency_key)
     VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING`,
    [userId, `organizer-standard:${randomUUID()}`],
  );
  const mapping = (await pool.query(
    "SELECT stripe_account_id,creation_idempotency_key FROM public.organizer_direct_accounts WHERE user_id=$1", [userId],
  )).rows[0];
  if (!mapping) throw new Error("Direct receiving account mapping is unavailable.");
  let accountId = mapping.stripe_account_id;
  if (!accountId) {
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.create({
        type: "standard", country: "US",
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { rosterHockeyUserId: userId, rosterPaymentModel: "direct" },
      }, { idempotencyKey: mapping.creation_idempotency_key });
    } catch (error: any) {
      const prerequisite = error?.type === "StripeInvalidRequestError" && error?.statusCode === 400 &&
        (/^You must complete your platform profile to use Connect/.test(error?.message ?? "") ||
         /^You can only create new accounts if you've signed up for Connect/.test(error?.message ?? ""));
      if (prerequisite) {
        await pool.query(
          `UPDATE public.organizer_direct_accounts SET creation_idempotency_key=$3,updated_at=now()
           WHERE user_id=$1 AND creation_idempotency_key=$2 AND stripe_account_id IS NULL`,
          [userId, mapping.creation_idempotency_key, `organizer-standard:${randomUUID()}`],
        );
        throw new OrganizerCardPaymentError("Complete your live Stripe Connect platform profile before connecting receiving accounts.", 409, "connect_platform_setup_required");
      }
      throw error;
    }
    if (!isSafeDirectAccount(account)) {
      throw new OrganizerCardPaymentError("Stripe account responsibility is not configured for direct collection. Contact support.", 409, "unsafe_direct_account");
    }
    accountId = account.id;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO public.organizer_stripe_account_registry(stripe_account_id,user_id,account_kind)
         VALUES($1,$2,'direct') ON CONFLICT DO NOTHING`, [accountId, userId],
      );
      const saved = await client.query(
        `UPDATE public.organizer_direct_accounts SET stripe_account_id=$2,updated_at=now()
         WHERE user_id=$1 AND stripe_account_id IS NULL RETURNING stripe_account_id`, [userId, accountId],
      );
      if (!saved.rows.length) {
        const current = await client.query("SELECT stripe_account_id FROM public.organizer_direct_accounts WHERE user_id=$1", [userId]);
        if (current.rows[0]?.stripe_account_id !== accountId) throw new Error("Receiving account mapping changed.");
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } else {
    const account = await stripe.accounts.retrieve(accountId);
    if (!isSafeDirectAccount(account)) throw new OrganizerCardPaymentError("This receiving account does not support safe direct collection.", 409, "unsafe_direct_account");
  }
  return stripe.accountLinks.create({
    account: accountId, type: "account_onboarding",
    return_url: new URL("/payment-requests?connect=return", origin).toString(),
    refresh_url: new URL("/payment-requests?connect=refresh", origin).toString(),
  });
}
