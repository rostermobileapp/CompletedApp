import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useIosPlatform } from '@/hooks/useIosPlatform';
import { useTheme } from '@/context/ThemeContext';
import {
  getAndroidProducts,
  getIosProducts,
  isAndroidBillingSupported,
  isBillingSupported,
  type NativelyProductPrice,
} from '@/lib/nativePurchases';
import {
  buyOnboardingNativePlan,
  restoreOnboardingNativePurchase,
} from '@/lib/onboardingNativeCheckout';
import { annualSavings } from '@/lib/onboardingNativeProducts';
import SubscriptionOfferView, {
  type SubscriptionOfferTier,
  type SubscriptionOfferPeriod,
  type SubscriptionOfferPriceKey,
} from './SubscriptionOfferView';

interface Props {
  accountId?: string;
  preview?: boolean;
  onFinished: () => void;
  onBack: () => void;
}

export function OnboardingSubscriptionOffer({ accountId, preview, onFinished, onBack }: Props) {
  const { isIos, isAndroid, isReady } = useIosPlatform();
  const { theme } = useTheme();
  const { toast } = useToast();
  const [tier, setTier] = useState<SubscriptionOfferTier>('player_pro');
  const [period, setPeriod] = useState<SubscriptionOfferPeriod>('yearly');
  const [products, setProducts] = useState<NativelyProductPrice[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const inFlight = useRef(false);
  const initialAccount = useRef(accountId);
  const pendingKey = accountId ? `roster:onboarding-purchase-unresolved:${accountId}` : null;
  const [unresolved, setUnresolved] = useState(() => {
    try { return Boolean(pendingKey && sessionStorage.getItem(pendingKey) === '1'); }
    catch { return false; }
  });
  const unresolvedRef = useRef(unresolved);
  const markUnresolved = (value: boolean) => {
    unresolvedRef.current = value;
    setUnresolved(value);
    try {
      if (pendingKey) {
        if (value) sessionStorage.setItem(pendingKey, '1');
        else sessionStorage.removeItem(pendingKey);
      }
    } catch {}
  };
  const { data: profile } = useQuery<{ id?: string; role?: string }>({
    queryKey: ['/api/user'],
    enabled: Boolean(accountId) && !preview,
  });
  const { data: googleAvailability } = useQuery<{ available: boolean; productIds: string[] }>({
    queryKey: ['/api/iap/google-availability'],
    enabled: !preview && isAndroid,
    retry: 1,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isReady || preview || (!isIos && !isAndroid)) return;
    let active = true;
    const load = async () => {
      try {
        const supported = isIos ? await isBillingSupported() : await isAndroidBillingSupported();
        if (!supported || !active) return;
        const result = isIos ? await getIosProducts() : await getAndroidProducts();
        if (active) setProducts(result);
      } catch {
        if (active) setNotice('Store prices could not be loaded. You can still continue for free.');
      }
    };
    void load();
    return () => { active = false; };
  }, [isReady, isIos, isAndroid, preview]);

  const prices: Partial<Record<SubscriptionOfferPriceKey, string>> = {};
  for (const product of products) {
    prices[product.identifier as SubscriptionOfferPriceKey] = product.priceString;
  }
  const savings = {
    player_pro: annualSavings(products, 'player_pro'),
    commissioner: annualSavings(products, 'commissioner'),
  };
  const guarded = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      await action();
    } catch (error: any) {
      if (error?.code === 'PURCHASE_CANCELLED' || /purchase cancelled/i.test(error?.message ?? '')) {
        markUnresolved(false);
        setNotice('Purchase cancelled. Your selection is saved; you can retry or choose Free.');
      } else if (error?.code === 'PURCHASE_ALREADY_OWNED') {
        markUnresolved(true);
        setNotice('This subscription is already owned. Use Restore Purchases instead of buying again.');
      } else {
        setNotice(error instanceof Error ? error.message : 'Store access is unavailable. No new purchase was started.');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleContinue = () => {
    if (tier === 'free') {
      if (!inFlight.current) onFinished();
      return;
    }
    if (preview) {
      setNotice('Purchases are unavailable in the design preview.');
      return;
    }
    if (unresolvedRef.current) {
      setNotice('A previous purchase may still be pending. Do not buy again; use Restore Purchases to check it.');
      return;
    }
    if (!accountId || accountId !== initialAccount.current || profile?.id !== accountId) {
      setNotice('Sign in to your Roster account before subscribing.');
      return;
    }
    if (profile.role === 'player_pro' || profile.role === 'commissioner') {
      setNotice('Your account already has a paid plan. Manage your existing subscription before changing tiers.');
      return;
    }
    if (!isReady || (!isIos && !isAndroid)) {
      setNotice('Store purchases are available only in the Roster mobile app. Choose Free to continue.');
      return;
    }
    void guarded(async () => {
      const result = await buyOnboardingNativePlan(
        isIos ? 'ios' : 'android', tier, period, prices as Record<string, string>, googleAvailability,
        () => markUnresolved(true),
      );
      if (result === 'pending') {
        setNotice('Payment is pending store verification. Do not buy again; access will update after confirmation.');
      } else {
        markUnresolved(false);
        toast({ title: 'Subscribed!', description: 'Your subscription has been verified.' });
        onFinished();
      }
    });
  };

  const handleRestore = () => {
    if (preview) {
      setNotice('Restore is available in the installed Roster app.');
      return;
    }
    if (!accountId || accountId !== initialAccount.current || profile?.id !== accountId ||
        !isReady || (!isIos && !isAndroid)) {
      setNotice('Sign in to the Roster mobile app to restore your purchase.');
      return;
    }
    void guarded(async () => {
      const restored = await restoreOnboardingNativePurchase(isIos ? 'ios' : 'android');
      if (restored) {
        markUnresolved(false);
        toast({ title: 'Purchases restored', description: 'Your subscription has been verified.' });
        onFinished();
      } else {
        setNotice('No active subscription was verified. If you already paid, do not buy again; contact support.');
      }
    });
  };

  return (
    <SubscriptionOfferView
      tier={tier}
      period={period}
      appearance={preview ? 'dark' : theme}
      prices={prices}
      savings={savings}
      busy={busy}
      notice={notice || (unresolved ? 'A purchase may still be pending. Restore it before trying to buy again.' : undefined)}
      onTierChange={(value) => { setTier(value); setNotice(undefined); }}
      onPeriodChange={(value) => { setPeriod(value); setNotice(undefined); }}
      onContinue={handleContinue}
      onRestore={handleRestore}
      onBack={onBack}
    />
  );
}