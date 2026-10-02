import { createHmac } from 'node:crypto';

export type NativeStorePlatform = 'ios' | 'android';

export function nativePurchaseLoginId(userId: string, platform: NativeStorePlatform, secret = process.env.SESSION_SECRET): string {
  if (!secret) throw Object.assign(new Error('Purchase-account setup is unavailable. Please try later.'), { status: 503 });
  const domain = platform === 'ios' ? 'revenuecat-apple:' : 'revenuecat-android:';
  return `roster_${platform === 'ios' ? 'ios_' : ''}${createHmac('sha256', secret).update(domain + userId).digest('hex')}`;
}

/** RevenueCat explicitly distinguishes the original anonymous ID from the
 * custom logged-in ID. Accept that observation only if the authenticated
 * lookup of OUR derived ID returns the very same original, never by querying
 * a caller-selected anonymous customer. This is association, not entitlement.
 */
export function confirmReportedNativeIdentity(
  loginId: string, originalId: unknown, observations: unknown[],
): 'current' | 'provider-confirmed-original' {
  if (observations.length !== 2 || observations.some(id =>
    typeof id !== 'string' || !id || id.length > 1500 ||
    (id !== loginId && !(id === originalId && /^\$RCAnonymousID:[A-Za-z0-9_-]{20,128}$/.test(id))),
  )) {
    throw Object.assign(new Error('Checkout was not opened: the native purchase account could not be confirmed. Update and reopen Roster or contact support.'), { status: 409 });
  }
  return observations.every(id => id === loginId) ? 'current' : 'provider-confirmed-original';
}