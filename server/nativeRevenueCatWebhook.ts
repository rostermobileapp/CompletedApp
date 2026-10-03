import { createHash, timingSafeEqual } from 'node:crypto';
import { IAP_PRODUCT_ROLES } from './appleNotificationHandler';
import type { TrustedRevenueCatTransaction } from './revenueCatAppleActivation';

export interface NativeRevenueCatWebhookDependencies {
  findAppleUser(customerId: string): Promise<string | undefined>;
  activateApple(userId: string, customerId: string, productId: string, transaction?: TrustedRevenueCatTransaction): Promise<void>;
  reconcileApple(userId: string): Promise<void>;
}

const ACTIVATION_EVENTS = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED',
  'PRODUCT_CHANGE',
]);
const STATUS_EVENTS = new Set(['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']);

function transactionId(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value
    : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^\d{10,20}$/.test(text) ? text : undefined;
}

function matchesSecret(authorization: unknown, secret: string): boolean {
  if (typeof authorization !== 'string') return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  const presented = hash(authorization);
  return timingSafeEqual(presented, hash(secret)) ||
    (!secret.startsWith('Bearer ') && timingSafeEqual(presented, hash(`Bearer ${secret}`)));
}

/** Authenticate provider events, then verify current access with RevenueCat. */
export async function handleNativeRevenueCatWebhook(
  input: { authorization: unknown; secret?: string; body: unknown },
  dependencies: NativeRevenueCatWebhookDependencies,
): Promise<{ status: number; body: { processed: boolean; reason?: string } }> {
  if (!input.secret) return { status: 503, body: { processed: false, reason: 'not_configured' } };
  if (!matchesSecret(input.authorization, input.secret)) {
    return { status: 401, body: { processed: false, reason: 'unauthorized' } };
  }
  const event = input.body && typeof input.body === 'object' && 'event' in input.body
    ? input.body.event : undefined;
  if (!event || typeof event !== 'object' || !('type' in event) || typeof event.type !== 'string') {
    return { status: 400, body: { processed: false, reason: 'invalid_event' } };
  }
  if (!ACTIVATION_EVENTS.has(event.type) && !STATUS_EVENTS.has(event.type)) {
    return { status: 200, body: { processed: false, reason: 'event_not_used_for_activation' } };
  }
  if (!('store' in event) || event.store !== 'APP_STORE' ||
      !('environment' in event) || event.environment !== 'PRODUCTION') {
    return { status: 200, body: { processed: false, reason: 'not_production_apple' } };
  }
  const customerId = 'app_user_id' in event ? event.app_user_id : undefined;
  const productId = event.type === 'PRODUCT_CHANGE' && 'new_product_id' in event
    ? event.new_product_id : 'product_id' in event ? event.product_id : undefined;
  if (typeof customerId !== 'string' || !/^roster_ios_[a-f0-9]{64}$/.test(customerId) ||
      typeof productId !== 'string' || !Object.hasOwn(IAP_PRODUCT_ROLES, productId)) {
    // Anonymous customers, aliases and subscriber attributes are not ownership proof.
    return { status: 200, body: { processed: false, reason: 'unrecognized_purchase_context' } };
  }
  const userId = await dependencies.findAppleUser(customerId);
  if (!userId) return { status: 200, body: { processed: false, reason: 'account_not_found' } };
  if (STATUS_EVENTS.has(event.type)) {
    // Cancellation alone is not expiry. Read the current provider record,
    // including any grace period, refund, or independently paid tier.
    await dependencies.reconcileApple(userId);
  } else {
    const originalTransactionId = transactionId('original_transaction_id' in event ? event.original_transaction_id : undefined);
    const latestTransactionId = transactionId('transaction_id' in event ? event.transaction_id : undefined);
    await dependencies.activateApple(userId, customerId, productId,
      originalTransactionId && latestTransactionId
        ? { originalTransactionId, transactionId: latestTransactionId } : undefined);
  }
  return { status: 200, body: { processed: true } };
}