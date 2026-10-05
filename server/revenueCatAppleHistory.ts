import type { VerifiedAppleSubscription } from './revenueCatApi';
import type { TrustedRevenueCatTransaction } from './revenueCatAppleActivation';

type HistoryOptions = { apiKey?: string; projectId?: string; fetcher?: typeof fetch };
const API = 'https://api.revenuecat.com';
const CUSTOMER = /^roster_ios_[a-f0-9]{64}$/;
const transactionId = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value
    : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^\d{10,20}$/.test(text) ? text : undefined;
};
function unavailable(message = 'Historical purchase verification is unavailable. Contact support; do not purchase again.'): never {
  throw Object.assign(new Error(message), { status: 503 });
}

export function isRevenueCatAppleHistoryConfigured(): boolean {
  return Boolean(process.env.REVENUECAT_V2_API_KEY && process.env.REVENUECAT_PROJECT_ID);
}

function context(customerId: string, options: HistoryOptions) {
  if (!CUSTOMER.test(customerId)) throw Object.assign(new Error('Invalid purchase-account context.'), { status: 400 });
  const projectId = options.projectId ?? process.env.REVENUECAT_PROJECT_ID;
  const apiKey = options.apiKey ?? process.env.REVENUECAT_V2_API_KEY;
  if (!apiKey || !projectId || !/^[A-Za-z0-9_-]{1,255}$/.test(projectId)) unavailable();
  return { projectId, apiKey, fetcher: options.fetcher ?? fetch };
}

async function request(path: string, ctx: ReturnType<typeof context>): Promise<Response> {
  try {
    return await ctx.fetcher(`${API}${path}`, {
      headers: { Authorization: `Bearer ${ctx.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
  } catch { return unavailable(); }
}

/** Unlike v1 GET /subscribers, this does not create an unknown customer. */
export async function revenueCatAppleCustomerExists(customerId: string, options: HistoryOptions = {}): Promise<boolean> {
  const ctx = context(customerId, options);
  const response = await request(`/v2/projects/${encodeURIComponent(ctx.projectId)}/customers/${encodeURIComponent(customerId)}`, ctx);
  if (response.status === 404) return false;
  if (!response.ok) unavailable();
  const body = await response.json().catch(() => unavailable());
  if (body?.object !== 'customer' || typeof body.id !== 'string') unavailable();
  return true;
}

/**
 * Read the named customer's historical provider events, including events never
 * delivered to our webhook. Event aliases and event entitlement/expiry hints
 * are NOT ownership or access proof: the caller supplies a fresh, server-read
 * purchased production subscription and we match its exact current transaction.
 */
export async function getRevenueCatAppleHistoricalTransaction(
  customerId: string, subscription: VerifiedAppleSubscription, options: HistoryOptions = {},
): Promise<TrustedRevenueCatTransaction | undefined> {
  const ctx = context(customerId, options);
  const currentId = transactionId(subscription.storeTransactionId);
  if (!currentId) return undefined;
  const base = `/v2/projects/${encodeURIComponent(ctx.projectId)}/customers/${encodeURIComponent(customerId)}/events`;
  let path: string | null = `${base}?environment=production&limit=100`;
  const seen = new Set<string>();
  const originals = new Set<string>();
  for (let page = 0; path && page < 20; page++) {
    if (seen.has(path)) unavailable();
    seen.add(path);
    const response = await request(path, ctx);
    if (!response.ok) unavailable();
    const data = await response.json().catch(() => unavailable());
    if (data?.object !== 'list' || !Array.isArray(data.items)) unavailable();
    for (const item of data.items) {
      const event = item?.body;
      if (item?.object !== 'customer.event' || typeof item.type !== 'string' ||
          !item.type.startsWith('PURCHASES_') || !event || typeof event !== 'object' ||
          event.store !== 'APP_STORE' || event.environment !== 'PRODUCTION' ||
          event.is_family_share === true || event.product_id !== subscription.productId ||
          transactionId(event.transaction_id) !== currentId) continue;
      const original = transactionId(event.original_transaction_id);
      if (original) originals.add(original);
    }
    if (data.next_page == null) { path = null; continue; }
    if (typeof data.next_page !== 'string') unavailable();
    // Never send the secret to a provider-supplied foreign host or different
    // customer's page. Validate absolute and relative pagination URLs alike.
    let next: URL;
    try { next = new URL(data.next_page, API); } catch { return unavailable(); }
    if (next.origin !== API || next.pathname !== base || next.hash ||
        next.username || next.password) unavailable();
    path = `${next.pathname}${next.search}`;
  }
  if (path) unavailable('Purchase history is too large to verify automatically. Contact support; do not purchase again.');
  if (originals.size > 1) {
    throw Object.assign(new Error('Conflicting purchase history requires support review.'), { status: 409 });
  }
  const originalTransactionId = Array.from(originals)[0];
  return originalTransactionId ? { originalTransactionId, transactionId: currentId } : undefined;
}
