import { createHmac, timingSafeEqual } from 'crypto';

export type BillingRole = 'free_tier' | 'player_pro' | 'secondary_commissioner' | 'commissioner';
export interface TimedBillingRole {
  role: BillingRole;
  expiresAt: Date | string | null;
}

const ROLE_RANK: Record<BillingRole, number> = {
  free_tier: 0,
  player_pro: 1,
  secondary_commissioner: 2,
  commissioner: 3,
};

export const roleValue = (value: unknown): BillingRole =>
  value === 'player_pro' || value === 'secondary_commissioner' || value === 'commissioner'
    ? value
    : 'free_tier';

export function resolveManualRoleBackfill(input: {
  currentRole: unknown;
  legacyBaseRole: unknown;
  hasKnownBillingSource: boolean;
}): BillingRole {
  if (input.hasKnownBillingSource) return 'free_tier';
  const current = roleValue(input.currentRole);
  if (current !== 'free_tier') return current;
  return roleValue(input.legacyBaseRole);
}

export function deriveRevenueCatAppUserId(userId: string, secret: string): string {
  return `roster_${createHmac('sha256', secret)
    .update(`revenuecat-android:${userId}`).digest('hex')}`;
}

export function highestBillingRole(...roles: BillingRole[]): BillingRole {
  return roles.reduce((highest, role) =>
    ROLE_RANK[role] > ROLE_RANK[highest] ? role : highest, 'free_tier');
}

function roleWhileActive(source: TimedBillingRole, now: number): BillingRole {
  const expiry = source.expiresAt instanceof Date
    ? source.expiresAt.getTime()
    : Date.parse(source.expiresAt ?? '');
  return Number.isFinite(expiry) && expiry > now ? source.role : 'free_tier';
}

export function resolveEffectiveBillingRole(input: {
  manualRole: BillingRole;
  stripe: TimedBillingRole;
  apple: TimedBillingRole[];
  google: TimedBillingRole[];
  native: TimedBillingRole[];
}, now = Date.now()): BillingRole {
  return highestBillingRole(
    input.manualRole,
    roleWhileActive(input.stripe, now),
    ...input.apple.map((source) => roleWhileActive(source, now)),
    ...input.google.map((source) => roleWhileActive(source, now)),
    ...input.native.map((source) => roleWhileActive(source, now)),
  );
}

export function shouldRetryRevenueCatWebhookForLag(
  eventProduct: string,
  eventType: string,
  eventExpiry: number,
  activeProducts: string[],
  now = Date.now(),
): boolean {
  const purchaseEvents = new Set([
    'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE',
    'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED',
  ]);
  return Boolean(eventProduct && purchaseEvents.has(eventType) && eventExpiry > now &&
    !activeProducts.includes(eventProduct));
}

export function verifyRevenueCatWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  signingSecret: string | undefined,
  now = Date.now(),
): boolean {
  if (!signatureHeader || !signingSecret) return false;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamps = parts.filter((part) => part.startsWith('t=')).map((part) => part.slice(2));
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0])) return false;
  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300) return false;

  const suppliedSignatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter((value) => /^[a-f0-9]{64}$/i.test(value))
    .map((value) => Buffer.from(value, 'hex'));
  if (!suppliedSignatures.length) return false;

  const expected = createHmac('sha256', signingSecret)
    .update(`${timestamps[0]}.`, 'utf8')
    .update(rawBody)
    .digest();
  return suppliedSignatures.reduce((matched, supplied) =>
    timingSafeEqual(expected, supplied) || matched, false);
}

export function isRevenueCatWebhookEnvironmentAllowed(
  environment: unknown,
  eventType: unknown,
): boolean {
  // TEST events may not carry an environment. Lifecycle events must state one.
  if (environment == null || environment === '') return eventType === 'TEST';
  if (typeof environment !== 'string') return false;
  const normalized = environment.trim().toUpperCase();
  return normalized === 'SANDBOX' || normalized === 'PRODUCTION';
}

export function shouldProcessRevenueCatWebhookEnvironment(
  environment: unknown,
  runtimeEnvironment: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!isRevenueCatWebhookEnvironmentAllowed(environment, 'LIFECYCLE')) return false;
  return runtimeEnvironment !== 'production' ||
    (environment as string).trim().toUpperCase() === 'PRODUCTION';
}

const REVENUECAT_LIFECYCLE_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'CANCELLATION',
  'BILLING_ISSUE',
  'SUBSCRIBER_ALIAS',
  'SUBSCRIPTION_PAUSED',
  'UNCANCELLATION',
  'TRANSFER',
  'EXPIRATION',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
  'REFUND_REDEEMED',
]);

export function isRecognizedRevenueCatLifecycleEvent(eventType: unknown): eventType is string {
  return typeof eventType === 'string' && REVENUECAT_LIFECYCLE_EVENT_TYPES.has(eventType);
}

export function getRevenueCatWebhookRetryDelaySeconds(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  return Math.min(3600, 5 * (2 ** Math.min(10, safeAttempt - 1)));
}

export function revenueCatWebhookEnqueueOutcome(inserted: boolean): 'queued' | 'duplicate' {
  return inserted ? 'queued' : 'duplicate';
}

export function isPaywallClaimAvailable(
  shownAt: Date | string | null,
  claimExpiresAt: Date | string | null,
  now = Date.now(),
): boolean {
  if (shownAt) return false;
  if (!claimExpiresAt) return true;
  const expiry = new Date(claimExpiresAt).getTime();
  return Number.isFinite(expiry) && expiry <= now;
}

export function isNativeRevenueCatPaywallEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NATIVE_PAYWALL_ENABLED === 'true' &&
    Boolean(env.REVENUECAT_API_KEY && env.REVENUECAT_WEBHOOK_SECRET);
}

/** A single explicitly configured, persisted RevenueCat identity may run the native sandbox test. */
export function isNativePaywallTestAccount(
  appUserId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return /^roster_[a-f0-9]{64}$/.test(appUserId) &&
    env.NATIVE_PAYWALL_TEST_APP_USER_ID === appUserId &&
    Boolean(env.REVENUECAT_API_KEY && env.REVENUECAT_WEBHOOK_SECRET);
}

export function shouldProcessRevenueCatWebhookForAccount(
  environment: unknown,
  appUserId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return shouldProcessRevenueCatWebhookEnvironment(environment, env.NODE_ENV) ||
    (typeof environment === 'string' && environment.trim().toUpperCase() === 'SANDBOX' &&
      isNativePaywallTestAccount(appUserId, env));
}