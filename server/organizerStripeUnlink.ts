import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { pool } from "./db";
import { OrganizerCardPaymentError } from "./organizerCardPaymentMath";
import { isVerifiedProductionRuntime } from "./runtimePolicy";

type Database = { query: (...args: any[]) => Promise<any> };

/** Lock before invoice/payment rows: unlink uses the same lock order. */
export async function lockActiveDirectAccount(database: Database, userId: string, accountId: string) {
  const row = (await database.query(
    `SELECT stripe_account_id,to_jsonb(a)->>'disconnect_requested_at' AS disconnect_requested_at
     FROM public.organizer_direct_accounts a WHERE user_id=$1 FOR SHARE`, [userId],
  )).rows[0];
  if (row?.stripe_account_id !== accountId || row?.disconnect_requested_at) {
    throw new OrganizerCardPaymentError("The organizer's Stripe account is unavailable or being unlinked.", 409, "direct_account_unavailable");
  }
}

export function organizerStripeClientId(): string {
  const key = isVerifiedProductionRuntime() ? "STRIPE_CONNECT_CLIENT_ID" : "TESTING_STRIPE_CONNECT_CLIENT_ID";
  const value = process.env[key];
  if (!value || !/^ca_[A-Za-z0-9]+$/.test(value)) {
    throw new OrganizerCardPaymentError("Stripe unlinking is not configured yet. Contact support.", 503, "stripe_unlink_not_configured");
  }
  return value;
}

/** Revoke platform access, never delete/close the organizer's Standard account. */
export async function unlinkOrganizerStripe(userId: string, expectedAccountId: string, stripe: Stripe) {
  const clientId = organizerStripeClientId();
  const client = await pool.connect();
  let accountId: string | null = null;
  try {
    await client.query("BEGIN");
    const mapping = (await client.query(
      `SELECT stripe_account_id,disconnect_requested_at FROM public.organizer_direct_accounts
       WHERE user_id=$1 FOR UPDATE`, [userId],
    )).rows[0];
    if (!mapping?.stripe_account_id) {
      await client.query("COMMIT");
      return { connected: false };
    }
    if (mapping.stripe_account_id !== expectedAccountId) {
      throw new OrganizerCardPaymentError("Your Stripe connection changed. Refresh before unlinking.", 409, "stripe_connection_changed");
    }
    accountId = mapping.stripe_account_id;
    const active = (await client.query(
      `SELECT id FROM public.organizer_card_payments
       WHERE organizer_user_id=$1 AND stripe_account_id=$2 AND payment_flow='direct'
         AND (status IN ('processing','refund_pending','disputed')
           OR (status='pending' AND (stripe_payment_intent_id IS NOT NULL OR confirmation_started_at IS NOT NULL)))
       LIMIT 1`, [userId, accountId],
    )).rows[0];
    if (active) {
      throw new OrganizerCardPaymentError("Finish pending payments, refunds, or disputes before unlinking Stripe.", 409, "stripe_unlink_payments_active");
    }
    await client.query(
      "UPDATE public.organizer_direct_accounts SET disconnect_requested_at=COALESCE(disconnect_requested_at,now()),updated_at=now() WHERE user_id=$1",
      [userId],
    );
    await client.query(
      `UPDATE public.organizer_card_payments SET status='cancelled',updated_at=now()
       WHERE organizer_user_id=$1 AND stripe_account_id=$2 AND payment_flow='direct' AND status='pending'
         AND stripe_payment_intent_id IS NULL AND confirmation_started_at IS NULL`, [userId, accountId],
    );
    await client.query("UPDATE public.payment_requests SET card_enabled=false WHERE creator_id=$1 AND card_enabled=true", [userId]);
    await client.query(
      `UPDATE public.scrimmages SET card_payment_enabled=false
       WHERE creator_id=$1 AND card_payment_enabled=true`, [userId],
    );
    await client.query("COMMIT");
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "42703") {
      throw new OrganizerCardPaymentError("Stripe unlinking requires a database update. Contact support.", 503, "stripe_unlink_schema_required");
    }
    throw error;
  } finally { client.release(); }

  try {
    const result = await stripe.oauth.deauthorize({ client_id: clientId, stripe_user_id: accountId! });
    if (result.stripe_user_id !== accountId) throw new Error("Unexpected Stripe unlink response.");
  } catch (error: any) {
    // An earlier successful revocation may have lost its response. Only an
    // explicit account-inaccessible result can establish recovery, not timeouts
    // or an invalid OAuth application configuration.
    let noAccess = false;
    if (error?.type === "StripeInvalidGrantError" || error?.code === "invalid_client") {
      try { await stripe.accounts.retrieve(accountId!); }
      catch (verification: any) { noAccess = verification?.code === "account_invalid"; }
    }
    if (!noAccess) {
      throw new OrganizerCardPaymentError(
        "Stripe unlinking was not confirmed. Card collection is paused; retry Unlink Stripe. Do not create a new receiving account.",
        503, "stripe_unlink_pending",
      );
    }
  }
  await pool.query(
    `UPDATE public.organizer_direct_accounts SET stripe_account_id=NULL,disconnect_requested_at=NULL,
       creation_idempotency_key=$3,updated_at=now()
     WHERE user_id=$1 AND stripe_account_id=$2 AND disconnect_requested_at IS NOT NULL`,
    [userId, accountId, `organizer-standard:${randomUUID()}`],
  );
  return { connected: false };
}
