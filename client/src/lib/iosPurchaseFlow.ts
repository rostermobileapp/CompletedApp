/** Keep account association, checkout/restore and verification in one operation.
 * Dependencies make the native flow testable without a device or payment. */
export interface IosPurchaseFlow {
  currentUserId(): string | undefined;
  account(): Promise<{ loginId: string; userId: string }>;
  login(loginId: string): Promise<void>;
  customerId(): Promise<string>;
  purchase(productId: string): Promise<unknown>;
  restore(): Promise<unknown>;
  verify(payload: { loginId: string; expectedProductId?: string }): Promise<{ verified?: boolean; role?: string }>;
  refresh(): Promise<void>;
}

let busy = false;
export async function activateIosPurchase(flow: IosPurchaseFlow, productId?: string): Promise<void> {
  if (busy) throw new Error('Another App Store operation is in progress. Please wait.');
  busy = true;
  let completed = false;
  try {
    const userId = flow.currentUserId();
    const assertAccount = () => {
      if (!userId || flow.currentUserId() !== userId) {
        throw new Error('Your signed-in account changed. Sign in to the purchasing account and use Restore purchases.');
      }
    };
    assertAccount();
    const account = await flow.account();
    if (account.userId !== userId) throw new Error('Your account changed. Open Subscription again before continuing.');
    assertAccount();
    await flow.login(account.loginId);
    assertAccount();
    if (await flow.customerId() !== account.loginId) throw new Error('The App Store account could not be linked. Try again before purchasing.');
    assertAccount();
    if (productId) await flow.purchase(productId);
    else await flow.restore();
    completed = true;
    assertAccount();
    if (await flow.customerId() !== account.loginId) throw new Error('The native purchase account changed. Use Restore purchases on the purchasing account.');
    assertAccount();
    // The bridge takes RevenueCat package IDs; Apple/RevenueCat verification
    // uses the App Store's full product identifier, not that package alias.
    const result = await flow.verify({ loginId: account.loginId, ...(productId ? { expectedProductId: `com.rosterapp.${productId}` } : {}) });
    assertAccount();
    if (!result.verified || !result.role || result.role === 'free_tier') {
      throw new Error('No active App Store subscription was verified. Check your Apple subscriptions, then use Restore purchases.');
    }
    await flow.refresh();
    assertAccount();
  } catch (error) {
    if (completed) {
      throw new Error(`Purchase needs verification: ${error instanceof Error ? error.message : 'Verification is unavailable.'} Do not purchase again. Use Restore purchases to retry; contact support if it continues.`);
    }
    throw error;
  } finally {
    busy = false;
  }
}