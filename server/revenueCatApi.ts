import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';

type AppleRole = 'player_pro' | 'commissioner';

interface RevenueCatSubscription {
  store?: string;
  expires_date?: string | null;
  original_purchase_date?: string | null;
  refunded_at?: string | null;
  ownership_type?: string | null;
  store_transaction_id?: string | number | null;
}

interface RevenueCatResponse {
  subscriber?: {
    original_app_user_id?: string;
    subscriptions?: Record<string, RevenueCatSubscription>;
  };
}

export async function getRevenueCatSubscriber(
  loginId: string, options: { apiKey?: string; fetcher?: typeof fetch } = {},
): Promise<NonNullable<RevenueCatResponse['subscriber']>> {
  if (!/^roster_(?:ios_)?[a-f0-9]{64}$/.test(loginId)) {
    throw Object.assign(new Error('Invalid purchase-account context.'), { status: 400 });
  }
  const key = options.apiKey ?? process.env.REVENUECAT_API_KEY;
  if (!key) throw Object.assign(new Error('Subscription verification is unavailable. Please try later.'), { status: 503 });
  const response = await (options.fetcher ?? fetch)(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(loginId)}`,
    { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw Object.assign(new Error('Subscription verification is temporarily unavailable. Please try later.'), { status: 503 });
  const data = await response.json() as RevenueCatResponse;
  if (!data?.subscriber || typeof data.subscriber.original_app_user_id !== 'string' ||
      !data.subscriber.subscriptions || typeof data.subscriber.subscriptions !== 'object' ||
      Array.isArray(data.subscriber.subscriptions)) {
    throw Object.assign(new Error('Subscription verification returned an invalid response.'), { status: 503 });
  }
  return data.subscriber;
}

export interface VerifiedAppleSubscription {
  productId: string;
  role: AppleRole;
  expiresAt: string;
  originalPurchasedAt: string;
  storeTransactionId?: string;
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
    const original = Date.parse(sub.original_purchase_date ?? '');
    if (!Number.isFinite(expiry) || expiry <= now || !Number.isFinite(original)) return [];
    return [{
      productId, role, expiresAt: new Date(expiry).toISOString(),
      originalPurchasedAt: new Date(original).toISOString(),
      ...(typeof sub.store_transaction_id === 'string' ||
        (typeof sub.store_transaction_id === 'number' && Number.isSafeInteger(sub.store_transaction_id))
        ? { storeTransactionId: String(sub.store_transaction_id) } : {}),
    }];
  }).sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
}

/** Authenticated project lookup used only after deriving the app-user ID server-side. */
export async function getRevenueCatActiveAppleSubscriptions(
  customerId: string,
  options: { apiKey?: string; fetcher?: typeof fetch } = {},
): Promise<VerifiedAppleSubscription[]> {
  return getRevenueCatAppleSubscriptions(customerId, options);
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

const GOOGLE_ORDER_ID = /^GPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d+)?$/;
const GOOGLE_PRODUCTS = new Set([
  'player_pro_monthly', 'player_pro_yearly', 'commissioner_monthly', 'commissioner_yearly',
]);

/**
 * RevenueCat's v1 subscriber response includes the latest Play order ID for
 * each subscription. This is only a lookup hint, not entitlement proof: the
 * caller MUST verify that order with Google and compare its account binding
 * to the native customer ID before claiming it.
 */
export function getActiveGoogleOrderIds(
  data: RevenueCatResponse, now = Date.now(),
): string[] {
  const subscriptions = data.subscriber?.subscriptions;
  if (!subscriptions || typeof subscriptions !== 'object' || Array.isArray(subscriptions)) {
    throw new Error('RevenueCat returned an invalid subscriber response');
  }
  return Array.from(new Set(Object.entries(subscriptions).flatMap(([productId, sub]) => {
    if (!GOOGLE_PRODUCTS.has(productId) || sub?.store !== 'play_store' ||
        (sub.ownership_type != null && sub.ownership_type !== 'PURCHASED') || sub.refunded_at ||
        typeof sub.store_transaction_id !== 'string' ||
        !GOOGLE_ORDER_ID.test(sub.store_transaction_id) ||
        !(Date.parse(sub.expires_date ?? '') > now)) return [];
    return [sub.store_transaction_id];
  })));
}

export async function getRevenueCatGoogleOrderIds(
  customerId: string,
  options: { apiKey?: string; fetcher?: typeof fetch } = {},
): Promise<string[]> {
  if (!/^(?:\$RCAnonymousID:[A-Za-z0-9_-]{20,128}|roster_[a-f0-9]{64})$/.test(customerId)) {
    throw Object.assign(new Error('The Android app did not provide a valid purchase identity.'), { status: 400 });
  }
  const key = options.apiKey ?? process.env.REVENUECAT_API_KEY;
  if (!key) throw Object.assign(new Error('Automatic Google Play restore is unavailable.'), { status: 503 });
  const response = await (options.fetcher ?? fetch)(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(customerId)}`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) {
    // Do not expose the provider response body, customer ID or credentials.
    throw Object.assign(new Error('RevenueCat could not look up this purchase.'), { status: 502 });
  }
  return getActiveGoogleOrderIds(await response.json() as RevenueCatResponse);
}