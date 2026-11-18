import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import type Stripe from "stripe";
import { pool } from "./db";
import { isVerifiedProductionRuntime } from "./runtimePolicy";
import { canCollectOrganizerCardPayments, canUseOrganizerCardPilot } from "./organizerCardPilot";
import {
  assertOrganizerCardPilotUser, assertOrganizerCardWebhooksReady, getOrganizerCardStripe,
  assertDirectCollectionEnabled,
} from "./organizerCardPaymentService";
import { OrganizerCardPaymentError, parseBaseAmountCents } from "./organizerCardPaymentMath";
import { readDirectAccount } from "./organizerDirectAccounts";
import { lockActiveDirectAccount } from "./organizerStripeUnlink";
import { directStripeOptions, directSurchargePolicy, quoteDirectProcessing, directFeePolicyFingerprint } from "./organizerDirectPricing";

type Database = { query: (...args: any[]) => Promise<any> };
async function invoiceForPayer(database: Database, requestId: string, payer: string, lock = false) {
  const row = (await database.query(`
    SELECT pr.id,pr.creator_id,pr.amount_per_person::text,pr.card_enabled,rr.id AS recipient_id,rr.is_paid,
      u.display_id,u.role,u.fee_exempt
    FROM public.payment_requests pr
    JOIN public.payment_request_recipients rr ON rr.payment_request_id=pr.id AND rr.user_id=$2
    JOIN public.users u ON u.id=pr.creator_id AND u.deleted_at IS NULL
    WHERE pr.id=$1 ${lock ? "FOR UPDATE OF pr,rr" : ""}
  `, [requestId, payer])).rows[0];
  if (!row) throw new OrganizerCardPaymentError("This invoice is not assigned to your account.", 404, "recipient_not_found");
  if (!canUseOrganizerCardPilot(isVerifiedProductionRuntime(), row.display_id)) {
    throw new OrganizerCardPaymentError("The organizer is not in the card payment pilot.", 403, "card_pilot_restricted");
  }
  if (!canCollectOrganizerCardPayments({ displayId: row.display_id, role: row.role, feeExempt: row.fee_exempt })) {
    throw new OrganizerCardPaymentError("The organizer is not eligible to collect card payments.", 409, "organizer_entitlement_inactive");
  }
  if (!row.card_enabled) throw new OrganizerCardPaymentError("Card collection is disabled for this invoice.", 409, "card_payment_not_enabled");
  if (row.is_paid) throw new OrganizerCardPaymentError("This invoice is already paid.", 409, "already_paid");
  return row;
}

async function receivingAccount(invoice: any, stripe: Stripe) {
  const account = await readDirectAccount(invoice.creator_id, stripe);
  if (!account.ready || !account.accountId) {
    throw new OrganizerCardPaymentError("The organizer must complete direct-payment Stripe onboarding.", 409, "organizer_account_not_ready");
  }
  return account.accountId;
}

export async function requestDirectInvoiceRefund(stripe: Stripe, payment: any) {
  if (payment.payment_flow !== "direct") throw new Error("Not a direct payment.");
  if (!payment.stripe_payment_intent_id || !["paid","refund_pending","refunded"].includes(payment.status)) {
    throw new OrganizerCardPaymentError("Only settled direct payments can be refunded.", 409, "payment_not_refundable");
  }
  if (payment.status === "refunded") return { status: "refunded", paymentId: payment.id };
  const refundClient = await pool.connect();
  try {
    await refundClient.query("BEGIN");
    await lockActiveDirectAccount(refundClient, payment.organizer_user_id, payment.stripe_account_id);
    const current = (await refundClient.query(
      "SELECT status FROM public.organizer_card_payments WHERE id=$1 FOR UPDATE", [payment.id],
    )).rows[0];
    if (!current || !["paid", "refund_pending", "refunded"].includes(current.status)) {
      throw new OrganizerCardPaymentError("This payment can no longer be refunded.", 409, "payment_not_refundable");
    }
    if (current.status === "refunded") {
      await refundClient.query("COMMIT");
      return { status: "refunded", paymentId: payment.id };
    }
    await refundClient.query(
      "UPDATE public.organizer_card_payments SET status='refund_pending',updated_at=now() WHERE id=$1", [payment.id],
    );
    await refundClient.query("COMMIT");
  } catch (error) { await refundClient.query("ROLLBACK"); throw error; }
  finally { refundClient.release(); }
  const options = directStripeOptions(payment.stripe_account_id, payment.processing_surcharge_cents);
  const charge = await stripe.charges.retrieve(payment.stripe_charge_id, {}, options);
  if (charge.payment_intent !== payment.stripe_payment_intent_id ||
      charge.amount !== payment.total_amount_cents || charge.currency !== "usd" ||
      charge.metadata?.organizerCardPaymentId !== payment.id) {
    throw new OrganizerCardPaymentError("Stripe payment verification failed.", 409, "refund_payment_mismatch");
  }
  // Refunding the whole direct payment also refunds the full player surcharge.
  // No destination reversal or application-fee retention applies.
  const remaining = Math.max(0, payment.total_amount_cents - charge.amount_refunded);
  const refund = remaining > 0 ? await stripe.refunds.create({
    payment_intent: payment.stripe_payment_intent_id, amount: remaining,
    metadata: { organizerCardPaymentId: payment.id },
  }, { ...options, idempotencyKey: `direct-invoice-refund:${payment.id}:${charge.amount_refunded}` }) : null;
  await pool.query(
    `UPDATE public.organizer_card_payments SET status='refund_pending',refund_id=COALESCE($2,refund_id),
      refund_status=$3,updated_at=now()
     WHERE id=$1 AND payment_flow='direct' AND status IN ('paid','refund_pending')`,
    [payment.id, refund?.id ?? null, refund?.status ?? "pending"],
  );
  return { status: "refund_pending", paymentId: payment.id };
}

export function registerOrganizerDirectRoutes(
  app: Express, authenticated: RequestHandler,
  origin: (req: any) => string,
  sendError: (res: any, error: unknown) => any,
) {
  const route = (path: string, run: (req: any, res: any, payer: string, stripe: Stripe) => Promise<any>) => {
    app.post(`/api/organizer-card-payments/direct/${path}`, authenticated, async (req: any, res) => {
      const payer = req.user?.claims?.sub;
      if (typeof payer !== "string" || !payer) return res.status(401).json({ message: "Authentication required" });
      try {
        await assertOrganizerCardPilotUser(payer);
        assertDirectCollectionEnabled();
        assertOrganizerCardWebhooksReady();
        return await run(req, res, payer, getOrganizerCardStripe());
      } catch (error) { return sendError(res, error); }
    });
  };
  route("context", async (req, res, payer, stripe) => {
    const invoice = await invoiceForPayer(pool, String(req.body?.paymentRequestId ?? ""), payer);
    const accountId = await receivingAccount(invoice, stripe);
    const pending = (await pool.query(`
      SELECT * FROM public.organizer_card_payments
      WHERE recipient_id=$1 AND (status IN ('pending','processing','paid','refund_pending')
        OR (status='disputed' AND COALESCE(dispute_status,'') NOT IN ('lost','won')))
      ORDER BY created_at DESC LIMIT 1`, [invoice.recipient_id])).rows[0];
    let resume;
    if (pending) {
      if (pending.payment_flow !== "direct") throw new OrganizerCardPaymentError(
        "An earlier payment must settle or expire before starting direct checkout. Contact the organizer if it remains pending.",
        409, "legacy_payment_pending",
      );
      if (pending.stripe_account_id !== accountId) throw new OrganizerCardPaymentError("An earlier payment uses another receiving account. Contact support.", 409, "account_mapping_conflict");
      if (pending.stripe_payment_intent_id) {
        const intent = await stripe.paymentIntents.retrieve(pending.stripe_payment_intent_id, {}, directStripeOptions(accountId, pending.processing_surcharge_cents));
        if (["requires_action","processing"].includes(intent.status)) {
          resume = { paymentId: pending.id, clientSecret: intent.client_secret, status: intent.status, totalAmountCents: pending.total_amount_cents };
        } else if (intent.status === "requires_payment_method") {
          await stripe.paymentIntents.cancel(intent.id, {}, directStripeOptions(accountId, pending.processing_surcharge_cents));
          await pool.query("UPDATE public.organizer_card_payments SET status='cancelled',updated_at=now() WHERE id=$1 AND status IN ('pending','processing')", [pending.id]);
        } else throw new OrganizerCardPaymentError("A payment is awaiting final confirmation. Refresh the invoice shortly.", 409, "payment_processing");
      } else if (pending.status === "processing") {
        if (!pending.confirmation_started_at || Date.now() - new Date(pending.confirmation_started_at).getTime() > 23 * 3600_000) {
          throw new OrganizerCardPaymentError("This payment needs support review before retrying.", 409, "payment_recovery_required");
        }
        resume = { paymentId: pending.id, quoteId: pending.quote_id, clientSecret: null,
          status: "confirmation_pending", totalAmountCents: pending.total_amount_cents };
      } else if (pending.status !== "pending") {
        throw new OrganizerCardPaymentError("A payment is awaiting final confirmation. Refresh the invoice shortly.", 409, "payment_processing");
      }
    }
    res.json({ stripeAccountId: accountId, baseAmountCents: parseBaseAmountCents(invoice.amount_per_person), currency: "usd", ...(resume ? { resume } : {}) });
  });
  route("quote", async (req, res, payer, stripe) => {
    const requestId = String(req.body?.paymentRequestId ?? "");
    const tokenId = String(req.body?.confirmationTokenId ?? "");
    if (!/^ctoken_[A-Za-z0-9]+$/.test(tokenId)) throw new OrganizerCardPaymentError("Enter valid card details before reviewing the total.", 400, "invalid_confirmation_token");
    const initial = await invoiceForPayer(pool, requestId, payer);
    const accountId = await receivingAccount(initial, stripe);
    const [token, account] = await Promise.all([
      stripe.confirmationTokens.retrieve(tokenId, {}, directStripeOptions(accountId)),
      stripe.accounts.retrieve(accountId),
    ]);
    if (token.payment_intent || token.setup_intent || !token.payment_method_preview || !token.expires_at ||
        token.expires_at * 1000 < Date.now() + 60_000) {
      throw new OrganizerCardPaymentError("These card details have expired or were already submitted. Please enter them again.", 409, "confirmation_token_unavailable");
    }
    const merchantState = account.business_profile?.support_address?.state ?? account.individual?.address?.state ?? account.company?.address?.state ?? null;
    const policy = directSurchargePolicy(accountId, process.env.ORGANIZER_DIRECT_SURCHARGE_POLICIES);
    const pricing = quoteDirectProcessing(parseBaseAmountCents(initial.amount_per_person), token.payment_method_preview,
      policy, account.country ?? null, merchantState);
    const quoteId = randomUUID();
    const expiresAt = new Date(Math.min(Date.now() + 10 * 60_000, token.expires_at * 1000 - 30_000,
      pricing.processingSurchargeCents > 0 && policy ? Date.parse(policy.approvedUntil) : Infinity));
    const fingerprint = directFeePolicyFingerprint(process.env.ORGANIZER_DIRECT_SURCHARGE_POLICIES);
    const client = await pool.connect();
    let payment: any;
    try {
      await client.query("BEGIN");
      await lockActiveDirectAccount(client, initial.creator_id, accountId);
      const invoice = await invoiceForPayer(client, requestId, payer, true);
      if (invoice.creator_id !== initial.creator_id || parseBaseAmountCents(invoice.amount_per_person) !== pricing.baseAmountCents) {
        throw new OrganizerCardPaymentError("This invoice changed. Review it again before paying.", 409, "invoice_changed");
      }
      const active = (await client.query(`
        SELECT * FROM public.organizer_card_payments WHERE recipient_id=$1
        AND (status IN ('pending','processing','paid','refund_pending')
          OR (status='disputed' AND COALESCE(dispute_status,'') NOT IN ('lost','won')))
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [invoice.recipient_id])).rows[0];
      if (active && (active.payment_flow !== "direct" || active.status !== "pending" || active.stripe_payment_intent_id ||
          active.stripe_account_id !== accountId)) {
        throw new OrganizerCardPaymentError("A payment already exists for this invoice. Refresh before retrying.", 409, "payment_already_exists");
      }
      if (active) {
        payment = (await client.query(`
          UPDATE public.organizer_card_payments SET base_amount_cents=$2,processing_surcharge_cents=$3,
            total_amount_cents=$4,quote_id=$5,quote_expires_at=$6,confirmation_token_id=$7,
            fee_explanation=$8,fee_policy_fingerprint=$9,updated_at=now()
          WHERE id=$1 RETURNING *`,
          [active.id, pricing.baseAmountCents, pricing.processingSurchargeCents, pricing.totalAmountCents,
            quoteId, expiresAt, tokenId, pricing.feeExplanation, fingerprint])).rows[0];
      } else {
        payment = (await client.query(`
          INSERT INTO public.organizer_card_payments(payment_request_id,recipient_id,payer_user_id,organizer_user_id,
            stripe_account_id,base_amount_cents,service_fee_cents,processing_surcharge_cents,total_amount_cents,
            payment_flow,idempotency_key,quote_id,quote_expires_at,confirmation_token_id,fee_explanation,fee_policy_fingerprint)
          VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,'direct',$9,$10,$11,$12,$13,$14) RETURNING *`,
          [requestId, invoice.recipient_id, payer, invoice.creator_id, accountId, pricing.baseAmountCents,
            pricing.processingSurchargeCents, pricing.totalAmountCents, `direct-payment:${randomUUID()}`,
            quoteId, expiresAt, tokenId, pricing.feeExplanation, fingerprint])).rows[0];
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    res.json({ ...pricing, paymentId: payment.id, quoteId, expiresAt: expiresAt.toISOString() });
  });
  route("confirm", async (req, res, payer, stripe) => {
    const client = await pool.connect();
    let payment: any;
    try {
      await client.query("BEGIN");
      const candidate = (await client.query(
        "SELECT * FROM public.organizer_card_payments WHERE id=$1 AND payer_user_id=$2 AND payment_flow='direct'",
        [String(req.body?.paymentId ?? ""), payer],
      )).rows[0];
      if (!candidate) throw new OrganizerCardPaymentError("Payment quote not found.", 404, "quote_not_found");
      await lockActiveDirectAccount(client, candidate.organizer_user_id, candidate.stripe_account_id);
      const invoice = await invoiceForPayer(client, candidate.payment_request_id, payer, true);
      payment = (await client.query("SELECT * FROM public.organizer_card_payments WHERE id=$1 FOR UPDATE", [candidate.id])).rows[0];
      if (payment.quote_id !== req.body?.quoteId || !payment.confirmation_token_id ||
          parseBaseAmountCents(invoice.amount_per_person) !== payment.base_amount_cents ||
          !["pending","processing"].includes(payment.status)) {
        throw new OrganizerCardPaymentError("This quote changed. Review the total again.", 409, "quote_changed");
      }
      if ((payment.status === "pending" || (!payment.stripe_payment_intent_id && payment.processing_surcharge_cents > 0)) &&
          new Date(payment.quote_expires_at).getTime() <= Date.now()) {
        throw new OrganizerCardPaymentError("This quote expired. Review the total again.", 409, "quote_expired");
      }
      if (!payment.stripe_payment_intent_id && payment.processing_surcharge_cents > 0 &&
          payment.fee_policy_fingerprint !== directFeePolicyFingerprint(process.env.ORGANIZER_DIRECT_SURCHARGE_POLICIES)) {
        throw new OrganizerCardPaymentError("The processing-fee policy changed. Review a new total before paying.", 409, "fee_policy_changed");
      }
      if (payment.status === "processing" && !payment.stripe_payment_intent_id &&
          (!payment.confirmation_started_at || Date.now() - new Date(payment.confirmation_started_at).getTime() > 23 * 3600_000)) {
        throw new OrganizerCardPaymentError("This payment needs support review before retrying.", 409, "payment_recovery_required");
      }
      await client.query(`UPDATE public.organizer_card_payments SET status='processing',
        confirmation_started_at=COALESCE(confirmation_started_at,now()),updated_at=now() WHERE id=$1`, [payment.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    const invoice = await invoiceForPayer(pool, payment.payment_request_id, payer);
    const accountId = await receivingAccount(invoice, stripe);
    if (accountId !== payment.stripe_account_id) throw new OrganizerCardPaymentError("The receiving account changed. Contact support before retrying.", 409, "account_mapping_conflict");
    const options = directStripeOptions(accountId, payment.processing_surcharge_cents);
    let intent: Stripe.PaymentIntent;
    try {
      intent = payment.stripe_payment_intent_id
        ? await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id, {}, options)
        : await stripe.paymentIntents.create({
          amount: payment.total_amount_cents, currency: "usd", payment_method_types: ["card"],
          confirmation_token: payment.confirmation_token_id, confirm: true,
          return_url: new URL(`/payment-requests/${encodeURIComponent(payment.payment_request_id)}`, origin(req)).toString(),
          ...(payment.processing_surcharge_cents > 0 ? { amount_details: {
            surcharge: { amount: payment.processing_surcharge_cents, enforce_validation: "enabled" },
          } } : {}),
          metadata: {
            organizerCardPaymentId: payment.id, paymentRequestId: payment.payment_request_id,
            payerUserId: payer, organizerUserId: payment.organizer_user_id, quoteId: payment.quote_id,
          },
        } as any, { ...options, idempotencyKey: `${payment.idempotency_key}:${payment.quote_id}` });
    } catch (error: any) {
      const failedIntent = error?.payment_intent;
      if (failedIntent?.id && failedIntent?.metadata?.organizerCardPaymentId === payment.id &&
          failedIntent?.metadata?.quoteId === payment.quote_id) {
        await pool.query(`UPDATE public.organizer_card_payments SET stripe_payment_intent_id=$2,updated_at=now()
          WHERE id=$1 AND status='processing' AND stripe_payment_intent_id IS NULL`, [payment.id, failedIntent.id]);
      }
      // Leave uncertain requests processing. A timeout must never permit a
      // second quote/charge; the identical confirmation can recover idempotently.
      throw error;
    }
    await pool.query(`UPDATE public.organizer_card_payments SET stripe_payment_intent_id=COALESCE(stripe_payment_intent_id,$2),
      updated_at=now() WHERE id=$1 AND quote_id=$3`, [payment.id, intent.id, payment.quote_id]);
    res.json({ clientSecret: intent.client_secret, status: intent.status, paymentId: payment.id });
  });
}
