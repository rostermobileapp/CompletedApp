export interface NativeAssociationFlow {
  associate(loginId: string): Promise<{ loginReportedId: string; readBackId: string }>;
  confirmAssociation(payload: {
    loginId: string; expectedUserId: string; loginReportedId: string; readBackId: string;
  }): Promise<{ confirmed: boolean; activeProductIds?: string[] }>;
  nativeIdentity(): Promise<string>;
}

/** A native SUCCESS acknowledges login. If the bridge reports an original ID,
 * only the authenticated backend may establish its relationship to our ID.
 * Never use a callback ID to select another customer's subscription record.
 */
export async function associateBillingAccount(
  flow: NativeAssociationFlow, loginId: string | undefined, userId: string,
  assertAccount: () => void, checkoutProductId?: string,
): Promise<() => Promise<void>> {
  if (!loginId) throw new Error('Checkout was not opened: purchase-account setup is unavailable. Reopen Roster or contact support.');
  const association = await flow.associate(loginId);
  assertAccount();
  const result = await flow.confirmAssociation({ loginId, expectedUserId: userId, ...association });
  assertAccount();
  if (result.confirmed !== true) {
    throw new Error('Checkout was not opened: the native purchase account could not be confirmed. Update and reopen Roster or contact support.');
  }
  if (checkoutProductId && result.activeProductIds?.length) {
    throw Object.assign(new Error('You already have an active store subscription. Use Restore purchases, then manage the existing plan in the App Store or Google Play; do not start another subscription.'), { code: 'PURCHASE_ALREADY_OWNED' });
  }
  // These IDs are accepted only after server confirmation of the requested,
  // authenticated account. They are not receipt or entitlement authority.
  const accepted = new Set([loginId, association.loginReportedId, association.readBackId]);
  return async () => {
    assertAccount();
    const current = await flow.nativeIdentity();
    assertAccount();
    if (!accepted.has(current)) {
      throw new Error('The native purchase account changed. Reopen Roster on the purchasing account and restore; do not purchase again.');
    }
  };
}