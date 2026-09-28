import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';

type AppleRole = 'player_pro' | 'commissioner';

interface RevenueCatSubscription {
  store?: string;
  expires_date?: string | null;
  refunded_at?: string | null;
  ownership_type?: string | null;
}

interface RevenueCatResponse {
  subscriber?: {
    subscriptions?: Record<string, RevenueCatSubscription>;
  };
}

export interface VerifiedAppleSubscription {
  productId: string;
  role: AppleRole;
  expiresAt: string;
}

/** This is a project app API key used only by the server; never expose it in responses. */
export function isRevenueCatApiConfigured(): boolean {
  return Boolean(process.env.REVENUECAT_API_KEY);
}

export function getActiveAppleSubscriptions(
  data: RevenueCatResponse,
  now = Date.now(),
): VerifiedAppleSubscription[] {
  const subscriptions = data.subscriber?.subscriptions;
  if (!subscriptions || typeof subscriptions !== 'object' || Array.isArray(subscriptions)) {
    throw new Error('RevenueCat returned an invalid subscriber response');
  }

  return Object.entries(subscriptions).flatMap(([productId, sub]) => {
    const role = IAP_PRODUCT_ROLES[productId];
    if (!role || !sub || sub.store !== 'app_store' ||
        sub.refunded_at || sub.ownership_type !== 'PURCHASED') return [];
    const expiry = Date.parse(sub.expires_date ?? '');
    if (!Number.isFinite(expiry) || expiry <= now) return [];
    return [{ productId, role, expiresAt: new Date(expiry).toISOString() }];
  }).sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
}

/**
 * Does not modify Roster access. RevenueCat v1 calls this a "get or create"
 * endpoint: looking up an unknown ID may create an empty RevenueCat customer.
 * The caller must independently establish Roster account ownership.
 */
export async function getRevenueCatAppleSubscriptions(
  customerId: string,
  options: { apiKey?: string; fetcher?: typeof fetch } = {},
): Promise<VerifiedAppleSubscription[]> {
  if (typeof customerId !== 'string' || !customerId.trim() || customerId.length > 1500) {
    throw new Error('Invalid RevenueCat customer ID');
  }
  const key = options.apiKey ?? process.env.REVENUECAT_API_KEY;
  if (!key) throw new Error('RevenueCat API key is not configured');

  const response = await (options.fetcher ?? fetch)(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(customerId)}`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) {
    // Do not log the response body or request headers: they may contain
    // customer information or provider diagnostics.
    throw new Error(`RevenueCat subscriber lookup failed (HTTP ${response.status})`);
  }
  return getActiveAppleSubscriptions(await response.json() as RevenueCatResponse);
}