import type { AndroidPurchaseStatus } from './androidPurchaseStatus';
import { assertBillingAccount, withNativeBillingOperation } from './nativeBillingOperation';
import { logBillingStage } from './nativeBillingDiagnostics';
import { associateBillingAccount, type NativeAssociationFlow } from './nativeAccountAssociation';

export interface AndroidRestoreFlow extends NativeAssociationFlow {
  currentUserId(): string | undefined;
  accountVersion?(): number;
  account(): Promise<{ userId: string; available: boolean; loginId?: string }>;
  restore(): Promise<AndroidPurchaseStatus>;
  verify(token: string, productId: string, userId: string): Promise<{ role?: string }>;
  recover(loginId: string, userId: string): Promise<{ role?: string; activeProductIds?: string[] }>;
  refresh(userId: string, role: string): Promise<void>;
}

export async function activateAndroidRestore(flow: AndroidRestoreFlow): Promise<{ activeProductIds: string[]; active: boolean }> {
  return withNativeBillingOperation(async () => {
    const userId = flow.currentUserId();
    const version = flow.accountVersion?.();
    const assertAccount = () => {
      assertBillingAccount(userId, flow.currentUserId());
      if (flow.accountVersion?.() !== version) throw new Error('Your signed-in account changed. Reopen Subscription.');
    };
    assertAccount();
    const account = await flow.account();
    assertAccount();
    if (account.userId !== userId) throw new Error('Your signed-in account changed. Reopen Subscription.');
    if (!account.available) throw new Error('Google Play verification is unavailable. Try Restore purchases later.');
    const assertNative = await associateBillingAccount(flow, account.loginId, userId!, assertAccount);
    await assertNative();
    logBillingStage('android', 'restore');
    const status = await flow.restore();
    assertAccount();
    await assertNative();
    let role: string | undefined;
    if (!status.purchases.length) {
      const result = await flow.recover(account.loginId!, userId!);
      await assertNative();
      role = result.role;
      if (result.activeProductIds) status.activeProductIds = result.activeProductIds;
    }
    for (const purchase of status.purchases) {
      await assertNative();
      logBillingStage('android', 'verify');
      const result = await flow.verify(purchase.purchaseToken, purchase.productIdentifier, userId!);
      await assertNative();
      if (result.role && result.role !== 'free_tier') role = result.role;
    }
    if (!role || role === 'free_tier') return { active: false, activeProductIds: status.activeProductIds };
    logBillingStage('android', 'refresh');
    await flow.refresh(userId!, role);
    await assertNative();
    logBillingStage('android', 'active');
    return { active: true, activeProductIds: status.activeProductIds };
  });
}