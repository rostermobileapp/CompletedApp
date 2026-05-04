import { JWT } from 'google-auth-library';

/**
 * Google Play Developer API verification for in-app subscriptions.
 *
 * Mirrors `server/appleIap.ts` for the Android side. Uses the service account
 * JSON loaded from the GOOGLE_PLAY_SERVICE_ACCOUNT_JSON env var (same service
 * account that was already created in Google Cloud Console for the RevenueCat
 * dashboard work — we just reuse the credentials here).
 *
 * Auth flow: service account JSON → JWT → OAuth access token (scoped to
 * androidpublisher) → REST calls to https://androidpublisher.googleapis.com.
 *
 * TODO (post-launch): Real-Time Developer Notifications (RTDN).
 * Google Play does NOT push HTTP webhooks the way Apple does. To get real-
 * time renewal/cancellation/refund events you must:
 *   1. Create a Cloud Pub/Sub topic in the same GCP project as the service
 *      account.
 *   2. Grant the Google Play service account
 *      `roles/pubsub.publisher` on that topic.
 *   3. In Play Console → Monetisation setup → Real-time developer
 *      notifications, paste the topic name.
 *   4. Subscribe to the topic from this server (push subscription pointing at
 *      a new `/api/iap/google-rtdn` endpoint, or pull subscription via a
 *      worker). Each message contains a base64 `data` payload with
 *      { subscriptionNotification: { purchaseToken, subscriptionId, ... } }.
 *      Re-verify against the API and update the user's role accordingly.
 *
 * Until that's wired up, lifecycle changes (cancel from Play Store, refund,
 * grace period) are reconciled lazily — i.e. the next time the user opens
 * the app and we re-verify their last known purchase token, or when they
 * tap "Restore Purchases".
 */

const PLAY_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

let cachedClient: JWT | null = null;

function loadServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      console.warn('[GoogleIAP] Service account JSON missing client_email or private_key');
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('[GoogleIAP] Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:', err);
    return null;
  }
}

export function isGoogleIapConfigured(): boolean {
  return loadServiceAccount() !== null;
}

function getClient(): JWT {
  if (cachedClient) return cachedClient;
  const sa = loadServiceAccount();
  if (!sa) {
    throw Object.assign(new Error('Google Play service account not configured'), { status: 503 });
  }
  cachedClient = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [PLAY_SCOPE],
  });
  return cachedClient;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const client = getClient();
  const tokenResp = await client.getAccessToken();
  const accessToken = tokenResp?.token;
  if (!accessToken) {
    throw new Error('Failed to obtain Google Play access token');
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${PLAY_API_BASE}${path}`, { ...init, headers });
}

/**
 * Subset of fields returned by purchases.subscriptionsv2.get that we care about.
 * https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
 */
export interface GooglePlaySubscriptionPurchase {
  /** "SUBSCRIPTION_STATE_ACTIVE" | "SUBSCRIPTION_STATE_CANCELED" | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" | etc. */
  subscriptionState: string;
  /** ms since epoch */
  startTimeMs?: number;
  /** ms since epoch — when the current period ends. After this with no renewal, the sub is over. */
  expiryTimeMs?: number;
  /** The product (SKU) the user is currently on. With base-plan model this is on lineItems. */
  productId: string;
  /** Whether we still need to acknowledge this purchase. */
  acknowledgementState: 'ACKNOWLEDGED' | 'PENDING' | string;
  /** Echo of the purchase token we queried with — useful for downstream lookups. */
  purchaseToken: string;
  /** Linked profile token set by the client — analogous to Apple's appAccountToken. */
  obfuscatedExternalAccountId?: string;
  /** Raw payload for logging / debugging. */
  raw: any;
}

const ACTIVE_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  // A canceled-but-not-yet-expired sub is still ACTIVE for entitlement purposes
  // until expiryTime passes. State == CANCELED only means auto-renew is off.
  'SUBSCRIPTION_STATE_CANCELED',
]);

export function isSubscriptionEntitled(state: string, expiryTimeMs?: number): boolean {
  if (!ACTIVE_STATES.has(state)) return false;
  if (expiryTimeMs && expiryTimeMs < Date.now()) return false;
  return true;
}

/**
 * Verify a Google Play subscription purchase token via the v2 endpoint.
 * Throws on network / auth / 4xx errors; returns the normalised payload otherwise.
 */
export async function verifySubscriptionPurchase(
  packageName: string,
  purchaseToken: string,
): Promise<GooglePlaySubscriptionPurchase> {
  const path = `/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const resp = await authedFetch(path);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw Object.assign(
      new Error(`Google Play verification failed (${resp.status}): ${body || resp.statusText}`),
      { status: resp.status >= 400 && resp.status < 500 ? 402 : 502 },
    );
  }
  const data: any = await resp.json();

  // v2 schema: lineItems[0].productId is the active SKU; expiryTime is RFC3339.
  const lineItem = Array.isArray(data.lineItems) && data.lineItems.length > 0
    ? data.lineItems[0]
    : null;
  const productId: string = lineItem?.productId ?? data.productId ?? '';
  const expiryRfc: string | undefined = lineItem?.expiryTime ?? data.expiryTime;
  const startRfc: string | undefined = data.startTime;

  return {
    subscriptionState: data.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED',
    startTimeMs: startRfc ? Date.parse(startRfc) : undefined,
    expiryTimeMs: expiryRfc ? Date.parse(expiryRfc) : undefined,
    productId,
    acknowledgementState: data.acknowledgementState ?? 'PENDING',
    purchaseToken,
    obfuscatedExternalAccountId:
      data.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? undefined,
    raw: data,
  };
}

/**
 * Acknowledge a subscription purchase. Google requires acknowledgement within
 * 3 days or the purchase is auto-refunded. Idempotent — calling on an already
 * acknowledged purchase is a no-op (returns 200 with empty body).
 *
 * NB: For subscriptions you must use purchases.subscriptions.acknowledge
 * (the v1 endpoint), keyed by subscriptionId (== productId for the base plan).
 */
export async function acknowledgeSubscriptionPurchase(
  packageName: string,
  productId: string,
  purchaseToken: string,
): Promise<void> {
  const path = `/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const resp = await authedFetch(path, { method: 'POST', body: JSON.stringify({}) });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    // 400 with "purchase already acknowledged" is fine — treat as success.
    if (resp.status === 400 && /acknowledg/i.test(body)) return;
    console.warn(`[GoogleIAP] Acknowledge failed (${resp.status}): ${body}`);
    // Don't throw — failing to acknowledge is non-fatal for the user; we'll
    // try again on the next verification call.
  }
}
