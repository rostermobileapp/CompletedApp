/**
 * Apple App Store Server Notification handler — pure business logic.
 *
 * Extracted from the /api/iap/notifications route so it can be unit-tested
 * without a live database or real Apple JWS signatures.
 *
 * The route handler in routes.ts delegates to resolveNotificationAction to
 * decide what role change (if any) should be applied for a given notification,
 * then performs the actual DB and Supabase updates itself.
 */

/** Server-side truth: Apple product ID → subscription role. Never trust the client. */
export const IAP_PRODUCT_ROLES: Record<string, 'commissioner' | 'player_pro'> = {
  'com.rosterapp.commissioner_monthly': 'commissioner',
  'com.rosterapp.player_pro_monthly': 'player_pro',
  'com.rosterapp.commissioner_yearly': 'commissioner',
  'com.rosterapp.player_pro_yearly': 'player_pro',
};

/**
 * Notification types that indicate an active / newly-granted subscription.
 * Apple docs: https://developer.apple.com/documentation/appstoreservernotifications/notificationtype
 */
export const GRANT_TYPES = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'OFFER_REDEEMED',
  'DID_CHANGE_RENEWAL_STATUS',
]);

/**
 * Notification types that indicate the subscription has ended or been revoked.
 */
export const REVOKE_TYPES = new Set([
  'EXPIRED',
  'REFUND',
  'REVOKE',
  'GRACE_PERIOD_EXPIRED',
]);

export type NotificationAction =
  | { action: 'grant'; role: 'commissioner' | 'player_pro' }
  | { action: 'revoke' }
  | { action: 'ignore'; reason: string };

/**
 * Pure function: given a notification type + transaction details, returns what
 * role action should be taken.  No I/O — fully testable in isolation.
 *
 * @param notificationType - Apple notificationType string from the JWS envelope
 * @param productId        - Apple productId from the signed transaction payload
 * @param expiresDate      - expiresDate (ms since epoch) from the transaction, if present
 * @param nowMs            - Current time in ms (injected for deterministic testing)
 */
export function resolveNotificationAction(
  notificationType: string,
  productId: string,
  expiresDate: number | undefined,
  nowMs: number,
): NotificationAction {
  if (GRANT_TYPES.has(notificationType)) {
    if (expiresDate !== undefined && expiresDate < nowMs) {
      return {
        action: 'ignore',
        reason: `${notificationType} received but subscription already expired (expiresDate ${expiresDate} < now ${nowMs})`,
      };
    }
    const role = IAP_PRODUCT_ROLES[productId];
    if (!role) {
      return {
        action: 'ignore',
        reason: `${notificationType}: unrecognised productId "${productId}" — no role mapping`,
      };
    }
    return { action: 'grant', role };
  }

  if (REVOKE_TYPES.has(notificationType)) {
    return { action: 'revoke' };
  }

  return {
    action: 'ignore',
    reason: `Unhandled notification type: ${notificationType}`,
  };
}
