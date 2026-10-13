import Stripe from 'stripe';
import { nativePurchaseLoginId } from './nativePurchaseAccount';

export type AccountMergePolicy = {
  kind: 'free_free' | 'keep_paid' | 'billing_duplicate' | 'verification_required';
  message: string;
  autoSelected: boolean;
};
export type BillingAccount = { id: string; role: string; is_primary_commissioner?: boolean;
  stripe_customer_id?: string | null; stripe_subscription_id?: string | null; iap_original_transaction_id?: string | null };

export function accountIsNonFree(account: BillingAccount) {
  return account.role !== 'free_tier' || account.is_primary_commissioner === true;
}
export function selectAccountMergeDirection(source: BillingAccount, survivor: BillingAccount) {
  const a = accountIsNonFree(source), b = accountIsNonFree(survivor);
  const policy: AccountMergePolicy = a && b
    ? { kind: 'billing_duplicate', message: 'Both accounts are on non-free tiers. Resolve duplicate account billing before merging. No subscriptions will be canceled or combined automatically.', autoSelected: false }
    : a || b
      ? { kind: 'keep_paid', message: 'The non-free profile is the parent account. Its login, profile and subscription will be retained.', autoSelected: a }
      : { kind: 'free_free', message: 'Both accounts are free. The selected parent keeps its login and profile.', autoSelected: false };
  return { sourceId: a && !b ? survivor.id : source.id, survivorId: a && !b ? source.id : survivor.id, policy };
}

/** Read-only provider checks. No purchase identity is ever moved by a merge. */
export async function verifyHistoricalFreeBilling(account: BillingAccount, nativeHistory: boolean | string[], options: {
  stripeFactory?: (key: string) => Pick<Stripe, 'subscriptions'>; fetcher?: typeof fetch;
} = {}) {
  if (accountIsNonFree(account)) return { active: false, evidence: 'non-free-parent-policy' };
  const evidence: unknown[] = [];
  if (account.stripe_customer_id || account.stripe_subscription_id) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe billing verification is unavailable.');
    const stripe = options.stripeFactory?.(process.env.STRIPE_SECRET_KEY) ??
      new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 8000, maxNetworkRetries: 0 });
    const subscriptions: Stripe.Subscription[] = [];
    if (account.stripe_customer_id) {
      // Iterate every page rather than assuming the first ten cover all history.
      for await (const sub of stripe.subscriptions.list({ customer: account.stripe_customer_id, status: 'all', limit: 100 })) subscriptions.push(sub);
    }
    if (account.stripe_subscription_id && !subscriptions.some(s => s.id === account.stripe_subscription_id)) {
      subscriptions.push(await stripe.subscriptions.retrieve(account.stripe_subscription_id));
    }
    if (account.stripe_customer_id && subscriptions.some(s =>
      (typeof s.customer === 'string' ? s.customer : s.customer.id) !== account.stripe_customer_id))
      throw new Error('Stored subscription ownership does not match the billing customer.');
    const states = subscriptions.map(s => [s.id, s.status, s.customer]).sort();
    evidence.push(states);
    if (subscriptions.some(s => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(s.status)))
      return { active: true, evidence };
  }
  if ((Array.isArray(nativeHistory) ? nativeHistory.length : nativeHistory) || account.iap_original_transaction_id) {
    if (!process.env.REVENUECAT_API_KEY) throw new Error('Native billing verification is unavailable.');
    const customerIds = new Set([
      nativePurchaseLoginId(account.id, 'ios'), nativePurchaseLoginId(account.id, 'android'),
      ...(Array.isArray(nativeHistory) ? nativeHistory : []),
    ]);
    for (const loginId of Array.from(customerIds)) {
      const response = await (options.fetcher ?? fetch)(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(loginId)}`, {
        headers: { Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 404) { evidence.push([loginId, 'no-subscriber']); continue; }
      if (!response.ok) throw new Error('Native billing verification is temporarily unavailable.');
      const body = await response.json();
      const subscriber = body?.subscriber;
      if (!subscriber || !subscriber.subscriptions || !subscriber.entitlements) throw new Error('Invalid native billing verification response.');
      evidence.push([loginId, subscriber.subscriptions, subscriber.entitlements]);
      const now = Date.now();
      const active = (period: any) => {
        if (period.refunded_at) return false;
        if (period.expires_date === null) return true;
        const expiry = Date.parse(period.grace_period_expires_date || period.expires_date);
        if (!Number.isFinite(expiry)) throw new Error('Native billing expiry could not be verified.');
        return expiry > now;
      };
      if (Object.values(subscriber.subscriptions).some(active) || Object.values(subscriber.entitlements).some(active))
        return { active: true, evidence };
    }
  }
  return { active: false, evidence };
}
