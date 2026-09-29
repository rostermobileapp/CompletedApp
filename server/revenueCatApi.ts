import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';
import { isNativePaywallTestAccount } from './nativeRevenueCatLogic';

type AppleRole = 'player_pro' | 'commissioner';

interface RevenueCatSubscription {
  store?: string;
  is_sandbox?: boolean;
  expires_date?: string | null;
  original_purchase_date?: string | null;
  refunded_at?: string | null;
  ownership_type?: string | null;
  store_transaction_id?: string | number | null;
}

interface RevenueCatResponse {
  subscriber?: {
    subscriptions?: Record<string, RevenueCatSubscription>;
  };
}

export interface VerifiedRevenueCatNativeSubscription {
  productId: string;
  role: AppleRole;
  store: 'app_store' | 'play_store';
  expiresAt: string;
  isSandbox: boolean;
}

const PLAY_PRODUCT_ROLES: Record<string, AppleRole> = {
  commissioner_monthly: 'commissioner',
  commissioner_yearly: 'commissioner',
  player_pro_monthly: 'player_pro',
  player_pro_yearly: 'player_pro',
};

/**
 * RevenueCat is the entitlement authority for the native paywall. Only
 * recognized, currently active, purchased store subscriptions are eligible;
 * client callbacks, aliases and anonymous customer IDs are never considered.
 */
export function getActiveRevenueCatNativeSubscriptions(
  data: RevenueCatResponse,
  now = Date.now(),
  allowSandbox = process.env.NODE_ENV !== 'production',
  requireKnownEnvironment = process.env.NODE_ENV === 'production',
): VerifiedRevenueCatNativeSubscription[] {
  const subscriptions = data.subscriber?.subscriptions;
  if (!subscriptions || typeof subscriptions !== 'object' || Array.isArray(subscriptions)) {
    throw new Error('RevenueCat returned an invalid subscriber response');
  }

  return Object.entries(subscriptions).flatMap(([productId, subscription]) => {
    // Production requires explicit store-environment proof, even for the single
    // tester. An absent flag is neither production nor sandbox proof.
    if (!subscription || (!allowSandbox && subscription.is_sandbox !== false) ||
        (requireKnownEnvironment && typeof subscription.is_sandbox !== 'boolean') ||
        subscription.refunded_at ||
        subscription.ownership_type !== 'PURCHASED') return [];

    const role = subscription.store === 'app_store'
      ? IAP_PRODUCT_ROLES[productId]
      : subscription.store === 'play_store'
        ? PLAY_PRODUCT_ROLES[productId]
        : undefined;
    const expiresAt = Date.parse(subscription.expires_date ?? '');
    if (!role || !Number.isFinite(expiresAt) || expiresAt <= now) return [];

    return [{
      productId,
      role,
      store: subscription.store as 'app_store' | 'play_store',
      expiresAt: new Date(expiresAt).toISOString(),
      isSandbox: subscription.is_sandbox === true,
    }];
  });
}

export async function getRevenueCatNativeSubscriptions(
  appUserId: string,
  options: { apiKey?: string; fetcher?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<VerifiedRevenueCatNativeSubscription[]> {
  if (!/^roster_[a-f0-9]{64}$/.test(appUserId)) {
    throw Object.assign(new Error('Invalid RevenueCat account identity'), { status: 400 });
  }
  const env = options.env ?? process.env;
  const key = options.apiKey ?? env.REVENUECAT_API_KEY;
  if (!key) throw Object.assign(new Error('RevenueCat API key is not configured'), { status: 503 });

  const response = await (options.fetcher ?? fetch)(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) {
    throw Object.assign(new Error('RevenueCat subscriber lookup failed'), { status: 502 });
  }
  return getActiveRevenueCatNativeSubscriptions(
    await response.json() as RevenueCatResponse,
    Date.now(),
    env.NODE_ENV !== 'production' || isNativePaywallTestAccount(appUserId, env),
    env.NODE_ENV === 'production',
  );
}

export interface VerifiedAppleSubscription {
  productId: string;
  role: AppleRole;
  expiresAt: string;
  originalPurchasedAt: string;
}

/** This is a project app API key used only by the server; never expose it in responses. */
export function isRevenueCatApiConfigured(): boolean {
  return Boolean(process.env.REVENUECAT_API_KEY);
}

export function getActiveAppleSubscriptions(
  data: RevenueCatResponse,
  now = Date.now(),
  allowSandbox = process.env.NODE_ENV !== 'production',
): VerifiedAppleSubscription[] {
  const subscriptions = data.subscriber?.subscriptions;
  if (!subscriptions || typeof subscriptions !== 'object' || Array.isArray(subscriptions)) {
    throw new Error('RevenueCat returned an invalid subscriber response');
  }

  return Object.entries(subscriptions).flatMap(([productId, sub]) => {
    const role = IAP_PRODUCT_ROLES[productId];
    if (!role || !sub || (!allowSandbox && sub.is_sandbox !== false) || sub.store !== 'app_store' ||
        sub.refunded_at || sub.ownership_type !== 'PURCHASED') return [];
    const expiry = Date.parse(sub.expires_date ?? '');
    const original = Date.parse(sub.original_purchase_date ?? '');
    if (!Number.isFinite(expiry) || expiry <= now || !Number.isFinite(original)) return [];
    return [{ productId, role, expiresAt: new Date(expiry).toISOString(),
      originalPurchasedAt: new Date(original).toISOString() }];
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
        sub.ownership_type !== 'PURCHASED' || sub.refunded_at ||
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