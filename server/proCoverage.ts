import Stripe from "stripe";
import { hasAccountPro, type AccountPro } from "../shared/proCoverage";
import { createProCoverageService, type ProAccount } from "./proCoverageService";
import { currentMonth } from "./leaguePro";
import { isVerifiedProductionRuntime } from "./runtimePolicy";
import { resolvePersonalPro } from "./personalProCoverage";

/** Read existing verified purchase records. Never mutate roles or purchases. */
const stripeChecks = new Map<string, { signature: string; until: number; value: AccountPro }>();
async function personal(account: ProAccount): Promise<AccountPro> {
  if (account.feeExempt || account.isPrimaryCommissioner) {
    return { personal: false, legacy: true, source: "operational" };
  }
  const { pool } = await import("./db");
  const result = await pool.query(
    `SELECT
       (SELECT json_build_object('expires',expires_at,'revoked',revoked_by_apple,'product',product_id)
          FROM apple_purchase_links WHERE user_id=$1) AS apple,
       (SELECT json_build_object('expires',expires_at,'product',product_id)
          FROM google_iap_claims WHERE user_id=$1 ORDER BY expires_at DESC NULLS LAST LIMIT 1) AS google`,
    [account.id],
  );
  const { apple, google } = result.rows[0] ?? {};
  const now = Date.now();
  const known = resolvePersonalPro(account, { apple, google }, undefined, now);
  if (known.personal || known.legacy) return known;
  if (account.stripeSubscriptionId) {
    const signature = `${account.stripeSubscriptionId}:${account.role}:${account.updatedAt}`;
    const previous = stripeChecks.get(account.id);
    const cached = previous?.signature === signature ? previous : undefined;
    if (cached && cached.until > now && (!cached.value.validUntil || +new Date(cached.value.validUntil) > now)) return cached.value;
    // Preview must never reach a live payment provider. Preserve the existing
    // local role mirror as legacy access, NOT as proof of an active purchase.
    if (!isVerifiedProductionRuntime()) return {
      personal: false, legacy: ["player_pro", "commissioner"].includes(account.role ?? ""), source: "legacy_grant",
    };
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { timeout: 5_000, maxNetworkRetries: 0 });
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(account.stripeSubscriptionId);
    } catch {
      // Honor only an already-verified, still-paid-through period during a
      // temporary outage. A failed lookup can never create or extend access.
      if (cached?.value.personal && cached.value.validUntil && +new Date(cached.value.validUntil) > now) return cached.value;
      throw new Error("Personal Player Pro verification is temporarily unavailable");
    }
    const prices = new Set([
      process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY, process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY,
      process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY, process.env.STRIPE_PRICE_COMMISSIONER_YEARLY,
    ].filter(Boolean));
    const item = subscription.items.data.find(item => prices.has(item.price.id));
    const expiry = (item as any)?.current_period_end ?? (subscription as any).current_period_end;
    const active = ["active", "trialing"].includes(subscription.status) && !!item && !!expiry && expiry * 1000 > now;
    const value = resolvePersonalPro(account, { apple, google }, { active, validUntil: expiry ? new Date(expiry * 1000).toISOString() : null }, now);
    // cancel_at_period_end remains covered until the paid-through date.
    stripeChecks.set(account.id, { signature, until: Math.min(now + 60_000, expiry ? expiry * 1000 : now + 60_000), value });
    return value;
  }
  return known;
}

const store = async () => (await import("./storage")).storage;
export const proCoverage = createProCoverageService({
  account: async id => (await store()).getUser(id),
  personal,
  team: async id => (await store()).getTeam(id),
  teams: async id => (await store()).getUserTeams(id),
  seats: async id => {
    const seats = await (await store()).getActiveLeagueProSeatsForUser(id, currentMonth());
    return seats.map(seat => ({ leagueId: seat.leagueId, startMonth: seat.grant.startMonth, endMonth: seat.grant.endMonth }));
  },
  seat: async (id, leagueId) => (await store()).userHasActiveLeagueProSeat(id, leagueId, currentMonth()),
});
export async function hasPersonalPro(userId: string) {
  return hasAccountPro(await proCoverage.accountCoverage(userId));
}
