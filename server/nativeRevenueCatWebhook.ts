import { createHash, timingSafeEqual } from 'node:crypto';
import type { TrustedRevenueCatTransaction } from './revenueCatAppleActivation';

export interface NativeRevenueCatWebhookDependencies {
  findAppleUser(customerId: string): Promise<string | undefined>;
  syncApple(userId: string, customerId: string, transaction?: TrustedRevenueCatTransaction): Promise<void>;
}

const APPLE_CUSTOMER_ID = /^roster_ios_[a-f0-9]{64}$/;

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
  if (event.type === 'TEST') {
    return { status: 200, body: { processed: false, reason: 'event_not_used_for_activation' } };
  }
  const transfer = event.type === 'TRANSFER';
  // TRANSFER omits app_user_id/product/expiry and may omit store/environment.
  // Its named accounts are checked against current production Apple records.
  if ((!transfer && (!('store' in event) || !('environment' in event))) ||
      ('store' in event && event.store !== 'APP_STORE') ||
      ('environment' in event && event.environment !== 'PRODUCTION')) {
    return { status: 200, body: { processed: false, reason: 'not_production_apple' } };
  }
  let customerIds: string[];
  if (transfer) {
    if (!('transferred_from' in event) || !Array.isArray(event.transferred_from) ||
        !('transferred_to' in event) || !Array.isArray(event.transferred_to) ||
        event.transferred_from.length + event.transferred_to.length > 200 ||
        [...event.transferred_from, ...event.transferred_to].some(id => typeof id !== 'string')) {
      return { status: 400, body: { processed: false, reason: 'invalid_transfer' } };
    }
    // Refresh sources before destinations; never move canonical Roster claims.
    customerIds = Array.from(new Set([...event.transferred_from, ...event.transferred_to]))
      .filter(id => APPLE_CUSTOMER_ID.test(id));
  } else {
    const customerId = 'app_user_id' in event ? event.app_user_id : undefined;
    customerIds = typeof customerId === 'string' && APPLE_CUSTOMER_ID.test(customerId)
      ? [customerId] : [];
  }
  if (!customerIds.length) {
    // Anonymous customers and aliases are not Roster ownership proof.
    return { status: 200, body: { processed: false, reason: 'unrecognized_purchase_context' } };
  }
  const originalTransactionId = transactionId('original_transaction_id' in event ? event.original_transaction_id : undefined);
  const latestTransactionId = transactionId('transaction_id' in event ? event.transaction_id : undefined);
  const transaction = !transfer && originalTransactionId && latestTransactionId
    ? { originalTransactionId, transactionId: latestTransactionId } : undefined;
  let processed = false;
  for (const customerId of customerIds) {
    const userId = await dependencies.findAppleUser(customerId);
    if (!userId) continue;
    await dependencies.syncApple(userId, customerId, transaction);
    processed = true;
  }
  return { status: 200, body: processed ? { processed: true }
    : { processed: false, reason: 'account_not_found' } };
}