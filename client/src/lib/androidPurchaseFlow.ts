import { assertBillingAccount, withNativeBillingOperation } from './nativeBillingOperation';
import { logBillingStage } from './nativeBillingDiagnostics';
import { associateBillingAccount, type NativeAssociationFlow } from './nativeAccountAssociation';

export interface AndroidPurchaseFlow extends NativeAssociationFlow {
  currentUserId(): string | undefined;
  accountVersion?(): number;
  account(): Promise<{ userId: string; available: boolean; productIds: string[]; loginId?: string }>;
  purchase(productId: string): Promise<{ purchaseToken?: string; productIdentifier: string }>;
  verify(payload: { purchaseToken?: string; productId: string; expectedUserId: string; loginId: string }): Promise<{ role?: string; pending?: boolean }>;
  refresh(userId: string, role: string): Promise<void>;
}

export async function activateAndroidPurchase(flow: AndroidPurchaseFlow, productId: string): Promise<'active' | 'pending'> {
  return withNativeBillingOperation(async () => {
    const userId = flow.currentUserId();
    const version = flow.accountVersion?.();
    const assertAccount = () => {
      assertBillingAccount(userId, flow.currentUserId());
      if (flow.accountVersion?.() !== version) throw new Error('Your signed-in account changed. Reopen Subscription on the purchasing account.');
    };
    let checkoutStarted = false;
    try {
      assertAccount();
      logBillingStage('android', 'preflight');
      const account = await flow.account();
      assertAccount();
      if (account.userId !== userId) throw new Error('Your signed-in account changed. Reopen Subscription.');
      if (!account.available || !account.productIds.includes(productId)) {
        throw new Error('Checkout was not opened: Google Play verification is unavailable for this plan. Try again later.');
      }
      const assertNative = await associateBillingAccount(flow, account.loginId, userId!, assertAccount, productId);
      await assertNative();
      checkoutStarted = true;
      logBillingStage('android', 'checkout');
      const purchase = await flow.purchase(productId);
      assertAccount();
      await assertNative();
      logBillingStage('android', 'verify');
      const result = await flow.verify({ purchaseToken: purchase.purchaseToken, productId, expectedUserId: userId!, loginId: account.loginId! });
      await assertNative();
      if (result.pending) { logBillingStage('android', 'pending'); return 'pending'; }
      if (!result.role || result.role === 'free_tier') throw new Error('Google Play did not activate your subscription.');
      logBillingStage('android', 'refresh');
      await flow.refresh(userId!, result.role);
      await assertNative();
      logBillingStage('android', 'active');
      return 'active';
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (checkoutStarted && code !== 'PURCHASE_CANCELLED' && code !== 'PURCHASE_ALREADY_OWNED') {
        throw new Error(`Purchase needs verification: ${error instanceof Error ? error.message : 'Activation is unavailable.'} Do not purchase again. Check Google Play subscriptions, then use Restore purchases or contact support.`);
      }
      throw error;
    }
  });
}