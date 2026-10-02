import { withNativeBillingOperation, assertBillingAccount } from './nativeBillingOperation';
import { logBillingStage } from './nativeBillingDiagnostics';
import { associateBillingAccount, type NativeAssociationFlow } from './nativeAccountAssociation';
export interface ApplePurchaseProof {
  productIdentifier: string;
  transactionId?: string;
  jwsRepresentation?: string;
}
export interface IosPurchaseFlow extends NativeAssociationFlow {
  currentUserId(): string | undefined;
  accountVersion?(): number;
  account(): Promise<{ userId: string; available: boolean; loginId?: string }>;
  purchase(productId: string): Promise<ApplePurchaseProof>;
  restore(): Promise<ApplePurchaseProof[]>;
  verify(payload: { loginId: string; expectedUserId: string; expectedProductId?: string }): Promise<{ role?: string }>;
  refresh(userId: string, role: string): Promise<void>;
}

export async function activateIosPurchase(flow: IosPurchaseFlow, productId?: string): Promise<void> {
  return withNativeBillingOperation(async () => {
    const userId = flow.currentUserId();
    const version = flow.accountVersion?.();
    const assertAccount = () => {
      assertBillingAccount(userId, flow.currentUserId());
      if (flow.accountVersion?.() !== version) throw new Error('Your signed-in account changed. Reopen Subscription.');
    };
    let started = false;
    try {
      assertAccount();
      logBillingStage('ios', 'preflight');
      const account = await flow.account();
      assertAccount();
      if (account.userId !== userId) throw new Error('Your signed-in account changed. Reopen Subscription.');
      if (!account.available) throw new Error('Apple verification is unavailable. Contact support before purchasing.');
      const assertNative = await associateBillingAccount(flow, account.loginId, userId!, assertAccount, productId);
      await assertNative();
      started = true;
      logBillingStage('ios', productId ? 'checkout' : 'restore');
      if (productId) await flow.purchase(productId);
      else await flow.restore();
      assertAccount();
      await assertNative();
      logBillingStage('ios', 'verify');
      const result = await flow.verify({
          loginId: account.loginId!, expectedUserId: userId!,
          ...(productId ? { expectedProductId: `com.rosterapp.${productId}` } : {}),
      });
      await assertNative();
      if (!result.role || result.role === 'free_tier') throw new Error('No active App Store subscription was verified.');
      logBillingStage('ios', 'refresh');
      await flow.refresh(userId!, result.role);
      await assertNative();
      logBillingStage('ios', 'active');
    } catch (error) {
      if (started && (error as { code?: string })?.code !== 'PURCHASE_CANCELLED') {
        throw new Error(`Purchase needs verification: ${error instanceof Error ? error.message : 'Verification is unavailable.'} Do not purchase again. Use Restore purchases to retry; contact support if it continues.`);
      }
      throw error;
    }
  });
}