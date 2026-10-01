import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, CheckCircle2, Crown, Star, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import rosterLogo from '@assets/Roster-10_1775764992636.png';
import subscriptionBanner from '@assets/2026-09-29_10_05_08-_1790880968971.png';
import './subscription-visual.css';
import { useLocation } from 'wouter';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIosPlatform } from '@/hooks/useIosPlatform';
import { StripeCheckoutModal } from '@/components/StripeCheckoutModal';
import {
  isBillingSupported,
  isAndroidBillingSupported,
  isAlreadyOwnedPurchaseError,
  canPurchaseAndroidProduct,
  getIosProducts,
  getAndroidProducts,
  purchaseProduct,
  purchaseProductAndroid,
  inspectAndroidPurchases,
  getAndroidPurchaseCustomerId,
  loginAndroidPurchaseAccount,
  restorePurchases,
  restorePurchasesAndroid,
  PRODUCT_PLAYER_PRO,
  PRODUCT_COMMISSIONER,
  PRODUCT_PLAYER_PRO_YEARLY,
  PRODUCT_COMMISSIONER_YEARLY,
  type NativelyTransaction,
} from '@/lib/nativePurchases';

export default function Subscription() {
  const { user } = usePermissions();
  const { role } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [pendingStripeUrl, setPendingStripeUrl] = useState<string | null>(null);
  const [iapReady, setIapReady] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [iosProductPrices, setIosProductPrices] = useState<Record<string, string>>({});
  const [androidLookupState, setAndroidLookupState] = useState<'checking' | 'loading' | 'ready' | 'unsupported' | 'unavailable'>('checking');
  const [androidLookupAttempt, setAndroidLookupAttempt] = useState(0);
  const [androidOwnedProducts, setAndroidOwnedProducts] = useState<string[]>([]);
  const [showFreeHelp, setShowFreeHelp] = useState(false);
  const [showGoogleOrderRecovery, setShowGoogleOrderRecovery] = useState(false);
  const [googleOrderId, setGoogleOrderId] = useState('');
  const [recoveryCustomerId, setRecoveryCustomerId] = useState<string | null>(null);

  // In-app embedded Stripe checkout for subscription upgrades — replaces the
  // hosted-checkout redirect we previously used. The server creates a Checkout
  // Session with `ui_mode: 'embedded'` and returns a `clientSecret`; we pass
  // that to <StripeCheckoutModal> which renders Stripe's payment form inline.
  // After payment we call `/api/stripe/sync-subscription` to update the user's
  // role immediately rather than waiting for the webhook, then refetch user
  // data so the page updates in place. The hosted-checkout fallback (returning
  // `{ url }`) is preserved for the existing-subscription portal-upgrade path.
  const [activeCheckout, setActiveCheckout] = useState<{
    clientSecret: string;
    sessionId: string;
    tier: 'player_pro' | 'commissioner';
  } | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Ref tracking the promo-code pending poll so it can be cleared on unmount
  const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingPollRef.current !== null) {
        clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
    };
  }, []);

  // Confirmation shown when the user returns from a redirect-based Stripe
  // flow (billing-portal upgrade for existing subscribers, or any 3DS
  // fallback redirect from embedded checkout). The success URL in those
  // cases is `/subscription?success=true[&session_id=...]`.
  const [showRedirectConfirmation, setShowRedirectConfirmation] = useState(false);

  const { isIos, isAndroid, isUsRegion, isReady: platformReady } = useIosPlatform();
  const {
    data: googleBillingAvailability,
    isLoading: googleBillingAvailabilityLoading,
    isError: googleBillingAvailabilityError,
    refetch: refetchGoogleBillingAvailability,
  } = useQuery<{ available: boolean; productIds: string[] }>({
    queryKey: ['/api/iap/google-availability'],
    enabled: isAndroid,
    staleTime: 0,
    retry: 1,
  });

  const isCommissioner = role === 'commissioner';
  const isPlayerPlus = role === 'player_pro';
  const isFree = role === 'free_tier';
  const hasStripePlan = Boolean(user?.stripeSubscriptionId);
  const [selectedTier, setSelectedTier] = useState<'free_tier' | 'player_pro' | 'commissioner'>(
    isCommissioner ? 'commissioner' : isPlayerPlus ? 'player_pro' : 'free_tier',
  );

  // Initialize IAP on iOS — check billing support then fetch real App Store prices
  useEffect(() => {
    if (!platformReady || !isIos) return;
    isBillingSupported().then(async (supported) => {
      if (!supported) return;
      setIapReady(true);
      const products = await getIosProducts();
      const priceMap: Record<string, string> = {};
      for (const p of products) {
        priceMap[p.identifier] = p.priceString;
      }
      setIosProductPrices(priceMap);
    }).catch((err) => {
      console.warn('[Subscription] IAP init error:', err);
    });
  }, [platformReady, isIos]);

  // The native bridge can arrive after the UA and first render. Publish prices
  // as each product resolves instead of labelling a 4-product lookup "unavailable".
  useEffect(() => {
    if (!platformReady || !isAndroid) return;
    let active = true;
    setAndroidLookupState('checking');
    setIosProductPrices({});
    setIapReady(false);
    (async () => {
      try {
        const supported = await isAndroidBillingSupported();
        if (!active) return;
        if (!supported) {
          setAndroidLookupState('unsupported');
          return;
        }
        setAndroidLookupState('loading');
        const products = await getAndroidProducts((product) => {
          if (active) setIosProductPrices((prev) => ({ ...prev, [product.identifier]: product.priceString }));
        });
        if (!active) return;
        if (products.length === 0) {
          console.warn('[Subscription] Android: no Google Play products returned by native bridge.');
          setAndroidLookupState('unavailable');
          return;
        }
        setAndroidLookupState('ready');
        setIapReady(true);
      } catch (err) {
        if (!active) return;
        console.warn('[Subscription] Android IAP init error:', err);
        setAndroidLookupState('unavailable');
      }
    })();
    return () => { active = false; };
  }, [platformReady, isAndroid, androidLookupAttempt]);

  // A bridge that appears after the initial timeout should recover without
  // requiring the buyer to notice and press Retry.
  useEffect(() => {
    if (!isAndroid || androidLookupState !== 'unsupported') return;
    const retryWhenReady = () => {
      if (typeof (window as any).$agent !== 'undefined') {
        setAndroidLookupAttempt((attempt) => attempt + 1);
      }
    };
    window.addEventListener('nativelyReady', retryWhenReady);
    const interval = window.setInterval(retryWhenReady, 1000);
    return () => {
      window.removeEventListener('nativelyReady', retryWhenReady);
      window.clearInterval(interval);
    };
  }, [isAndroid, androidLookupState]);

  // Silently check for pending purchases (e.g. promo code redeemed in the
  // Play Store outside the app) as soon as the billing bridge is confirmed
  // live. Mirrors the manual Restore flow but shows no toast on "nothing
  // found" — only surfaces a toast if an unacknowledged subscription is
  // discovered and activated.
  useEffect(() => {
    if (!isAndroid || androidLookupState !== 'ready' || !googleBillingAvailability?.available) return;
    (async () => {
      try {
        const { purchases, activeProductIds } = await inspectAndroidPurchases();
        setAndroidOwnedProducts(activeProductIds);
        if (!purchases.length) return;
        let verified = false;
        for (const p of purchases) {
          try {
            const response = await apiRequest('POST', '/api/iap/verify-google', {
              purchaseToken: p.purchaseToken,
              productId: p.productIdentifier,
            });
            const data = await response.json() as { role?: string; message?: string };
            if (response.ok && data.role && data.role !== 'free_tier') {
              verified = true;
              break;
            }
          } catch {
            // ignore individual token failures silently
          }
        }
        if (verified) {
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        }
      } catch {
        // silent — don't surface auto-check errors to the user
      }
    })();
  }, [isAndroid, androidLookupState, googleBillingAvailability?.available]);

  // Auto-sync subscription status on page load
  useEffect(() => {
    const syncSubscription = async () => {
      try {
        await apiRequest('POST', '/api/stripe/sync-subscription');
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      } catch (error) {
        console.log('Subscription sync check:', error);
      }
    };
    syncSubscription();
  }, []);

  // Detect a redirect-based Stripe success and show a confirmation that
  // mirrors the embedded checkout modal's success state. The auto-sync
  // effect above reconciles the user's role. The URL is left intact here
  // so a refresh before the user acknowledges still re-shows the dialog;
  // we strip the query params on dismiss (see `acknowledgeRedirectConfirmation`).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') !== 'true') return;
    setShowRedirectConfirmation(true);
  }, []);

  // Acknowledge the post-redirect confirmation: close the dialog and strip
  // the `success` / `session_id` query params so a refresh doesn't re-trigger
  // the banner. Other params on the URL (if any) are preserved.
  const acknowledgeRedirectConfirmation = useCallback(() => {
    setShowRedirectConfirmation(false);
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('success') && !params.has('session_id')) return;
    params.delete('success');
    params.delete('session_id');
    const remaining = params.toString();
    const newUrl =
      window.location.pathname +
      (remaining ? `?${remaining}` : '') +
      window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }, []);

  type StripePriceEntry = { id: string; amount: number | null; currency: string | null };
  type StripePricesResponse = {
    player_pro_monthly?: StripePriceEntry;
    commissioner_monthly?: StripePriceEntry;
    player_pro_yearly?: StripePriceEntry;
    commissioner_yearly?: StripePriceEntry;
  };

  const { data: stripePrices, isLoading: pricesLoading } = useQuery<StripePricesResponse>({
    queryKey: ['/api/stripe/prices'],
  });

  const formatPrice = (entry?: StripePriceEntry) => {
    if (!entry || entry.amount === null) return null;
    return `$${entry.amount % 1 === 0 ? entry.amount.toFixed(0) : entry.amount.toFixed(2)}`;
  };

  const proMonthlyDisplay = formatPrice(stripePrices?.player_pro_monthly) ?? '...';
  const commMonthlyDisplay = formatPrice(stripePrices?.commissioner_monthly) ?? '...';
  const proYearlyDisplay = formatPrice(stripePrices?.player_pro_yearly) ?? '...';
  const commYearlyDisplay = formatPrice(stripePrices?.commissioner_yearly) ?? '...';

  // For iOS users, return the price fetched from the App Store (localised + tax-inclusive)
  // for the selected billing period. For Android, return the Google Play price (also
  // localised + tax-inclusive). For web, return the Stripe price.
  const getPriceDisplay = (tier: 'player_pro' | 'commissioner') => {
    if (isIos || isAndroid) {
      const productId = billingPeriod === 'yearly'
        ? (tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
        : (tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER);
      return iosProductPrices[productId] ?? '...';
    }
    if (billingPeriod === 'yearly') {
      return tier === 'player_pro' ? proYearlyDisplay : commYearlyDisplay;
    }
    return tier === 'player_pro' ? proMonthlyDisplay : commMonthlyDisplay;
  };

  const getPriceForPeriod = (tier: 'player_pro' | 'commissioner', period: 'monthly' | 'yearly') => {
    if (isIos || isAndroid) {
      const productId = period === 'yearly'
        ? (tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
        : (tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER);
      const price = iosProductPrices[productId];
      if (price) return price;
      const nativePricesLoading = isIos
        ? !iapReady
        : androidLookupState === 'checking' || androidLookupState === 'loading' || googleBillingAvailabilityLoading;
      return nativePricesLoading ? 'Loading price' : 'Price unavailable';
    }
    const entry = period === 'yearly'
      ? (tier === 'player_pro' ? stripePrices?.player_pro_yearly : stripePrices?.commissioner_yearly)
      : (tier === 'player_pro' ? stripePrices?.player_pro_monthly : stripePrices?.commissioner_monthly);
    return formatPrice(entry) ?? (pricesLoading ? 'Loading price' : 'Price unavailable');
  };

  const getStripeSavingsPercent = (tier: 'player_pro' | 'commissioner') => {
    const monthly = tier === 'player_pro' ? stripePrices?.player_pro_monthly : stripePrices?.commissioner_monthly;
    const yearly = tier === 'player_pro' ? stripePrices?.player_pro_yearly : stripePrices?.commissioner_yearly;
    if (
      !monthly || !yearly ||
      monthly.amount === null || yearly.amount === null ||
      !Number.isFinite(monthly.amount) || !Number.isFinite(yearly.amount) ||
      !monthly.currency || !yearly.currency ||
      monthly.currency.toLowerCase() !== yearly.currency.toLowerCase() ||
      monthly.amount <= 0 || yearly.amount < 0
    ) return null;
    const annualAtMonthlyRate = monthly.amount * 12;
    const savings = Math.floor(((annualAtMonthlyRate - yearly.amount) / annualAtMonthlyRate) * 100);
    return savings > 0 ? savings : null;
  };

  const subscriptionPlans = [
    {
      name: "Free Tier",
      price: "$0",
      period: "forever",
      description: "Basic features for basic players",
      features: [
        "Join Leagues / Teams",
        "Scheduling",
        "RSVP Function",
        "Team Only Stats",
        "Team-Only Messaging"
      ],
      current: isFree,
      buttonText: isFree ? "Current Plan" : "Manage Subscription",
      buttonDisabled: isFree,
      tier: 'free_tier' as const,
    },
    {
      name: "Player Pro",
      price: getPriceDisplay('player_pro'),
      period: billingPeriod === 'yearly' ? 'year' : 'month',
      description: "For serious players",
      features: [
        "FREE +",
        "Team Management",
        "Unlimited Messaging",
        "Payment Tracking",
        "Team Scheduling",
        "League Stats",
        "League Standings",
        "League Announcements"
      ],
      current: isPlayerPlus,
      buttonText: isPlayerPlus ? "Current Plan" : "Upgrade Plan",
      buttonDisabled: isPlayerPlus,
      highlight: !isCommissioner,
      tier: 'player_pro' as const,
    },
    {
      name: "Commissioner",
      price: getPriceDisplay('commissioner'),
      period: billingPeriod === 'yearly' ? 'year' : 'month',
      description: "Full league management capabilities",
      features: [
        "FREE & PLAYER PRO +",
        "League Scheduling",
        "Scorekeeping",
        "Player Management",
        "League Wide Posts",
        "Awards & Records",
        "Bracket Management"
      ],
      current: isCommissioner,
      buttonText: isCommissioner ? "Current Plan" : "Upgrade Plan",
      buttonDisabled: isCommissioner,
      highlight: false,
      tier: 'commissioner' as const,
    }
  ];

  // --- Stripe helpers ---
  const openStripeUrl = (url: string) => {
    const stripeWindow = window.open(url, '_system');
    if (!stripeWindow) {
      toast({
        title: 'Unable to open browser',
        description: 'Please open your default browser and visit the payment page manually.',
        variant: 'destructive',
      });
    }
    setPendingStripeUrl(null);
    setIsLoading(false);
  };

  const routeStripeUrl = (url: string) => {
    if (isIos) {
      setPendingStripeUrl(url);
    } else {
      openStripeUrl(url);
    }
  };

  const handleManageSubscription = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/create-portal-session');
      const data = await response.json() as { url: string };
      routeStripeUrl(data.url);
    } catch (error: any) {
      let errorMessage = 'Failed to open subscription management. Please try again.';
      if (error.message) {
        try {
          const match = error.message.match(/\d+:\s*(.+)/);
          if (match) {
            const errorData = JSON.parse(match[1]);
            if (errorData.message) errorMessage = errorData.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const handleStripeUpgrade = async (tier: 'player_pro' | 'commissioner') => {
    setIsLoading(true);
    try {
      if (!stripePrices) throw new Error('Pricing information not available. Please try again.');
      let priceEntry: StripePriceEntry | undefined;
      if (billingPeriod === 'yearly') {
        priceEntry = tier === 'player_pro' ? stripePrices.player_pro_yearly : stripePrices.commissioner_yearly;
      } else {
        priceEntry = tier === 'player_pro' ? stripePrices.player_pro_monthly : stripePrices.commissioner_monthly;
      }
      const priceId = priceEntry?.id;
      if (!priceId) throw new Error(`Price not configured for ${tier} (${billingPeriod}). Please contact support.`);
      // Request embedded checkout so the payment form opens in our in-app
      // modal instead of redirecting away. Server still returns `{ url }` for
      // the existing-subscription portal-upgrade path — we redirect in that case.
      const response = await apiRequest('POST', '/api/stripe/create-checkout-session', { priceId, embedded: true });
      const data = await response.json() as { clientSecret?: string; sessionId?: string; url?: string };
      if (data.clientSecret && data.sessionId) {
        setActiveCheckout({ clientSecret: data.clientSecret, sessionId: data.sessionId, tier });
        setIsCheckoutOpen(true);
        setIsLoading(false);
        return;
      }
      if (data.url) {
        // Fallback: server returned a hosted URL (e.g. billing-portal upgrade
        // flow when the user already has an active subscription).
        routeStripeUrl(data.url);
        return;
      }
      throw new Error('No checkout session received from server');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to start checkout. Please try again.', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  // Called by the modal as soon as Stripe reports the payment complete.
  // We sync the user's subscription status server-side immediately so the role
  // updates without waiting on the webhook, then refetch user data so the page
  // updates in place. Memoized so EmbeddedCheckoutProvider options stay stable.
  const handleEmbeddedPaymentComplete = useCallback(async () => {
    // Capture the tier the user was upgrading *to* so we can show the correct
    // label even if the sync response omits `tier` (eventual-consistency edge
    // case where Stripe lists the subscription a beat after we ask).
    const purchasedTier = activeCheckout?.tier ?? null;
    let synced = false;
    let syncedTier: string | null = null;
    try {
      const response = await apiRequest('POST', '/api/stripe/sync-subscription');
      const data = await response.json() as { tier?: string };
      synced = true;
      syncedTier = data.tier ?? null;
    } catch (err) {
      // Non-fatal: webhook + the auto-sync on next page load will reconcile.
      console.warn('[Subscription] sync-subscription after embedded checkout failed:', err);
    } finally {
      // Refetch (not just invalidate) so the modal closes onto already-updated
      // UI rather than briefly showing stale data while the next fetch runs.
      await Promise.allSettled([
        queryClient.refetchQueries({ queryKey: ['/api/user'] }),
        queryClient.refetchQueries({ queryKey: ['/api/auth/user'] }),
      ]);
    }
    if (synced) {
      // Prefer the server's reported tier; fall back to the tier the user
      // just clicked so commissioner upgrades don't get mislabeled as
      // "Player Pro" when the sync response is missing the field.
      const resolvedTier = syncedTier ?? purchasedTier;
      const tierLabel = resolvedTier === 'commissioner' ? 'Commissioner' : 'Player Pro';
      toast({
        title: 'Subscription active!',
        description: `You're now on the ${tierLabel} plan.`,
      });
    } else {
      // Not necessarily a true failure — webhook will reconcile shortly.
      toast({
        title: "We're still confirming your subscription",
        description: "Stripe accepted the payment. If your plan doesn't update shortly, try the Sync button.",
      });
    }
  }, [activeCheckout, toast]);

  // --- iOS IAP helpers ---
  const handleIosPurchase = async (tier: 'player_pro' | 'commissioner') => {
    setIsLoading(true);
    try {
      const productId = billingPeriod === 'yearly'
        ? (tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
        : (tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER);
      const transaction = await purchaseProduct(productId);

      // Build the verification payload, preferring StoreKit 2 JWS > transactionId
      const verifyPayload: Record<string, string> = {};
      if (transaction.jwsRepresentation) {
        verifyPayload.jws = transaction.jwsRepresentation;
      } else if (transaction.transactionId) {
        verifyPayload.transactionId = transaction.transactionId;
      } else {
        throw new Error('No verifiable data returned from App Store. Please try again.');
      }

      const response = await apiRequest('POST', '/api/iap/verify', verifyPayload);

      if (!response.ok) {
        const data = await response.json() as { message?: string };
        throw new Error(data.message || 'Purchase completed but role sync failed. Please restart the app.');
      }

      toast({ title: 'Subscribed!', description: 'Your subscription is now active.' });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      window.location.reload();
    } catch (error: any) {
      if (
        error?.code === 'PURCHASE_CANCELLED' ||
        error?.message?.toLowerCase().includes('cancel') ||
        error?.message?.toLowerCase().includes('cancelled')
      ) {
        setIsLoading(false);
        return;
      }
      const purchaseNeedsVerification = error?.message?.startsWith('Purchase completed');
      toast({ title: purchaseNeedsVerification ? 'Purchase needs verification' : 'Purchase failed',
        description: purchaseNeedsVerification
          ? `${error.message} Do not purchase again; contact support.`
          : error.message || 'Something went wrong. Please try again.',
        variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const handleIosRestore = async () => {
    setIsLoading(true);
    try {
      const purchases = await restorePurchases();

      if (!purchases.length) {
        toast({ title: 'Purchase could not be verified', description: 'The App Store may have an active subscription, but this version of the app did not return transaction details. Please do not purchase again; contact support.' });
        setIsLoading(false);
        return;
      }

      // Prefer JWS > transactionId for restore verification
      let verifyPayload: Record<string, string> | null = null;
      for (const p of purchases as NativelyTransaction[]) {
        if (p.jwsRepresentation) {
          verifyPayload = { jws: p.jwsRepresentation };
          break;
        } else if (p.transactionId) {
          verifyPayload = { transactionId: p.transactionId };
          break;
        }
      }

      if (!verifyPayload) {
        toast({ title: 'Purchase could not be verified', description: 'The App Store may have an active subscription, but this version of the app did not return transaction details. Please do not purchase again; contact support.' });
        setIsLoading(false);
        return;
      }

      const response = await apiRequest('POST', '/api/iap/verify', verifyPayload);
      const data = await response.json() as { role?: string; message?: string };

      if (response.ok && data.role && data.role !== 'free_tier') {
        toast({ title: 'Purchases restored!', description: 'Your subscription has been restored.' });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        window.location.reload();
      } else {
        toast({ title: 'No active subscription', description: 'No active subscription was found to restore.' });
      }
    } catch (error: any) {
      toast({ title: 'Restore failed', description: error.message || 'Failed to restore purchases.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Android IAP helpers ---
  // Mirrors handleIosPurchase but routes through the Natively / RevenueCat
  // bridge to Google Play Billing and verifies the resulting purchase token
  // against /api/iap/verify-google. No Stripe involvement on Android.
  const handleAndroidPurchase = async (tier: 'player_pro' | 'commissioner') => {
    if (isCommissioner && tier === 'player_pro') {
      toast({
        title: 'Change your existing plan first',
        description: hasStripePlan
          ? 'Your Commissioner plan is billed by Roster. Restore your existing Google Play purchase, then manage the Roster subscription before switching plans.'
          : 'Manage your Commissioner subscription in Google Play before switching to Player Pro. Do not start a second subscription.',
      });
      return;
    }
    const productId = billingPeriod === 'yearly'
      ? (tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
      : (tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER);
    if (!canPurchaseAndroidProduct(iosProductPrices, productId, googleBillingAvailability?.available, googleBillingAvailability?.productIds)) {
      toast({ title: 'Google Play unavailable', description: 'This plan cannot be purchased right now. Please retry loading plans or contact support.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    console.log(`Step 1: handleAndroidPurchase called with tier=${tier}`, {
      billingPeriod,
      isAndroid,
      isIos,
      iosProductPricesKeys: Object.keys(iosProductPrices),
      ua: navigator.userAgent,
      hasAgent: typeof (window as any).$agent !== 'undefined',
    });
    try {
      console.log(`Step 2: Calling Natively Google Play purchase method for productId=${productId}`);
      const purchase = await purchaseProductAndroid(productId);
      console.log('Step 3: Natively purchase callback received; requesting server verification');
      const response = await apiRequest('POST', '/api/iap/verify-google', {
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productIdentifier || productId,
      });

      const serverJson = await response.json().catch(() => ({}));
      console.log(`Step 5: Server response: status=${response.status}`, serverJson);

      if (!response.ok) {
        throw new Error((serverJson as any).message || 'Purchase completed but role sync failed. Please tap Restore Purchases.');
      }

      // 202 = promo code accepted, payment pending — not yet activated.
      // Start a lightweight poll (every 30 s, max 10 attempts) that silently
      // re-runs restorePurchasesAndroid() + verify-google. The first active
      // response stops the poll, invalidates the user query, and shows a
      // success toast so the page upgrades automatically.
      if (response.status === 202) {
        toast({
          title: 'Promo code accepted!',
          description: (serverJson as any).message ?? 'Your subscription will activate once payment is confirmed — check back in a few minutes.',
        });
        setIsLoading(false);

        // Clear any existing poll before starting a new one
        if (pendingPollRef.current !== null) {
          clearInterval(pendingPollRef.current);
        }
        let attempts = 0;
        const MAX_ATTEMPTS = 10;
        pendingPollRef.current = setInterval(async () => {
          attempts += 1;
          try {
            const purchases = await restorePurchasesAndroid();
            for (const p of purchases) {
              try {
                const pollResponse = await apiRequest('POST', '/api/iap/verify-google', {
                  purchaseToken: p.purchaseToken,
                  productId: p.productIdentifier,
                });
                if (pollResponse.status === 202) continue;
                const pollData = await pollResponse.json().catch(() => ({})) as { role?: string };
                if (pollResponse.ok && pollData.role && pollData.role !== 'free_tier') {
                  clearInterval(pendingPollRef.current!);
                  pendingPollRef.current = null;
                  queryClient.invalidateQueries({ queryKey: ['/api/user'] });
                  toast({ title: 'Subscription activated!', description: 'Your subscription has been applied to your account.' });
                  return;
                }
              } catch {
                // ignore individual token failures
              }
            }
          } catch {
            // silent — don't surface poll errors
          }
          if (attempts >= MAX_ATTEMPTS) {
            clearInterval(pendingPollRef.current!);
            pendingPollRef.current = null;
          }
        }, 30_000);

        return;
      }

      toast({ title: 'Subscribed!', description: 'Your subscription is now active.' });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      window.location.reload();
    } catch (error: any) {
      console.error('[Subscription/Android] Purchase error:', error?.message, error?.stack);
      const duplicate = error?.code === 'PURCHASE_ALREADY_OWNED' ||
        isAlreadyOwnedPurchaseError(error?.message ?? '');
      if (duplicate) {
        setAndroidOwnedProducts((previous) => Array.from(new Set([...previous, productId])));
        toast({
          title: 'Already subscribed in Google Play',
          description: 'Google Play says this plan is already owned. Do not buy it again. Tap Restore Purchases to link it to your Roster account.',
        });
        setIsLoading(false);
        return;
      }
      if (
        error?.code === 'PURCHASE_CANCELLED' ||
        error?.message?.toLowerCase().includes('cancel') ||
        error?.message?.toLowerCase().includes('cancelled')
      ) {
        setIsLoading(false);
        return;
      }
      // Surface bridge timeouts with a more helpful message
      const msg = error?.message || 'Something went wrong. Please try again.';
      const isBridgeTimeout = msg.includes('NATIVELY_TIMEOUT');
      toast({
        title: 'Purchase failed',
        description: isBridgeTimeout
          ? 'Google Play didn\'t respond. The Play Billing service may not be set up in this build yet — try Subscribe via Roster instead, or contact support.'
          : msg,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleAndroidRestore = async () => {
    setIsLoading(true);
    try {
      const { purchases, activeProductIds } = await inspectAndroidPurchases();
      setAndroidOwnedProducts(activeProductIds);

      if (!purchases.length) {
        const originalCustomerId = await getAndroidPurchaseCustomerId();
        setRecoveryCustomerId(originalCustomerId.startsWith('$RCAnonymousID:') ? originalCustomerId : null);
        try {
          const identityResponse = await apiRequest('GET', '/api/iap/revenuecat-login-id');
          const { loginId } = await identityResponse.json() as { loginId: string };
          await loginAndroidPurchaseAccount(loginId);
          // RevenueCat associates the restored Play receipt with the
          // authenticated Roster account's server-derived identity.
          await inspectAndroidPurchases();
          const response = await apiRequest('POST', '/api/iap/restore-google-automatic');
          const data = await response.json() as { role?: string; message?: string };
          if (!data.role) throw new Error(data.message || 'Google Play could not verify this purchase.');
          toast({
            title: 'Google Play purchase verified',
            description: data.role === 'commissioner'
              ? 'Commissioner remains your highest verified tier.'
              : 'Your Player Pro subscription is linked to your Roster account.',
          });
          await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          window.location.reload();
        } catch (error: any) {
          // Only an original anonymous identity can be matched to Google's
          // purchase binding by the receipt fallback. A conflicting claim
          // needs support rather than another attempted transfer.
          if (originalCustomerId.startsWith('$RCAnonymousID:') &&
              (error?.status == null || [402, 404, 502, 503].includes(error.status))) {
            setShowGoogleOrderRecovery(true);
          } else {
            throw error;
          }
        }
        return;
      }

      // Verify every restored token. An account may have both Pro and
      // Commissioner purchases; stopping after the first would miss the
      // higher tier and might leave the role too low.
      let verifiedRole: string | null = null;
      let lastError: string | null = null;
      for (const p of purchases) {
        try {
          const response = await apiRequest('POST', '/api/iap/verify-google', {
            purchaseToken: p.purchaseToken,
            productId: p.productIdentifier,
          });
          const data = await response.json() as { role?: string; message?: string };
          if (response.ok && data.role && data.role !== 'free_tier') {
            verifiedRole = data.role;
            continue;
          }
          lastError = data.message ?? null;
        } catch (err: any) {
          lastError = err?.message ?? 'Verification failed';
        }
      }

      if (verifiedRole) {
        toast({
          title: 'Google Play purchase verified',
          description: verifiedRole === 'commissioner'
            ? 'Commissioner is still your highest verified tier. Check each billing source before changing plans.'
            : 'Your Player Pro subscription is now linked to your Roster account.',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        window.location.reload();
      } else {
        toast({
          title: 'No active subscription',
          description: lastError ?? 'No active subscription was found to restore.',
        });
      }
    } catch (error: any) {
      toast({ title: 'Restore failed', description: error.message || 'Failed to restore purchases.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleOrderRecovery = async () => {
    setIsLoading(true);
    try {
      // The native bridge supplies the original anonymous RevenueCat identity.
      // Google must independently confirm that this identity belongs to the
      // order. A receipt number by itself never grants access.
      const customerId = recoveryCustomerId ?? (await getAndroidPurchaseCustomerId());
      const response = await apiRequest('POST', '/api/iap/restore-google-order', {
        orderId: googleOrderId.trim(),
        customerId,
      });
      const data = await response.json() as { role?: string; message?: string };
      if (!response.ok || !data.role) throw new Error(data.message || 'Google Play could not verify this purchase.');
      setShowGoogleOrderRecovery(false);
      toast({
        title: 'Google Play purchase linked',
        description: data.role === 'commissioner'
          ? 'Commissioner remains your highest verified tier.'
          : 'Your Player Pro purchase is now linked to your Roster account.',
      });
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      window.location.reload();
    } catch (error: any) {
      toast({ title: 'Could not link purchase', description: error.message || 'Please contact support.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Sync (Stripe fallback for web) ---
  const handleSyncSubscription = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/sync-subscription');
      const data = await response.json() as { message: string; tier: string; actualRole?: string };
      toast({
        title: 'Success',
        description: `Your subscription has been synced. Your current tier is ${data.actualRole === 'commissioner' ? 'Commissioner' : 'Player Pro'}.`,
      });
      window.location.reload();
    } catch (error: any) {
      toast({ title: 'Sync Failed', description: error.message || 'Failed to sync subscription. Please try again or contact support.', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/stripe/cancel-subscription');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Subscription Cancelled', description: 'Your subscription has been cancelled immediately. You have been moved to the Free Tier.' });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      window.location.reload();
    },
    onError: (error: any) => {
      toast({ title: 'Cancellation Failed', description: error.message || 'Failed to cancel subscription. Please try again.', variant: 'destructive' });
    },
  });

  return (
    <div className="subscription-page flex flex-col" data-testid="subscription-page">
      {/* In-app Stripe payment modal — replaces the previous redirect to
         hosted Stripe checkout. After payment we sync the user's subscription
         server-side, refetch user data, then auto-close the modal. */}
      <StripeCheckoutModal
        clientSecret={activeCheckout?.clientSecret ?? null}
        open={isCheckoutOpen}
        onOpenChange={(open) => {
          setIsCheckoutOpen(open);
          if (!open) {
            // Discard the secret on close so reopening starts a fresh session.
            setActiveCheckout(null);
          }
        }}
        onPaymentComplete={handleEmbeddedPaymentComplete}
        title="Complete Your Subscription"
        successHeadline="Subscription active"
        successMessage="Updating your account…"
      />
      <Dialog open={showGoogleOrderRecovery} onOpenChange={setShowGoogleOrderRecovery}>
        <DialogContent className="max-w-md" data-testid="dialog-google-order-recovery">
          <DialogHeader>
            <DialogTitle>Recover your Google Play purchase</DialogTitle>
            <DialogDescription>
              Automatic verification could not find this purchase. As a fallback, enter the GPA order ID from your Google Play receipt. Roster will still check the active subscription and this app's purchase identity. This does not charge you.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="google-order-id" className="text-sm font-medium">Google Play order ID</label>
          <input
            id="google-order-id"
            value={googleOrderId}
            onChange={(event) => setGoogleOrderId(event.target.value)}
            placeholder="GPA.0000-0000-0000-00000"
            autoComplete="off"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
            data-testid="input-google-order-id"
          />
          <button type="button" onClick={handleGoogleOrderRecovery}
            disabled={isLoading || !/^GPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d+)?$/.test(googleOrderId.trim())}
            className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
            data-testid="button-verify-google-order">
            {isLoading ? 'Verifying with Google Play…' : 'Verify existing purchase'}
          </button>
          <p className="text-xs text-muted-foreground">
            If the purchase identity does not match, no access will change. Do not buy the plan again; contact support for account recovery.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={showFreeHelp} onOpenChange={setShowFreeHelp}>
        <DialogContent className="max-w-md" data-testid="dialog-switch-to-free">
          <DialogHeader>
            <DialogTitle>How to switch to Free</DialogTitle>
            <DialogDescription>
              Free starts after your paid subscriptions end. Cancel each subscription where it is billed; changing your Roster plan does not cancel a store charge.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {hasStripePlan && (
              <div className="rounded-lg border p-3">
                <p className="font-medium">Roster billing (Stripe)</p>
                <p className="text-muted-foreground mt-1">Your current plan is linked to Roster billing. Open billing management and cancel it there.</p>
                <button type="button" onClick={() => { setShowFreeHelp(false); void handleManageSubscription(); }}
                  className="text-primary underline mt-2" data-testid="button-free-manage-roster">
                  Manage Roster billing
                </button>
              </div>
            )}
            {isAndroid && (
              <div className="rounded-lg border p-3">
                <p className="font-medium">Google Play</p>
                    <p className="text-muted-foreground mt-1">If Play Store lists a Roster subscription, open Play Store → Profile → Payments &amp; subscriptions → Subscriptions → Roster → Cancel subscription. Use the Google account that bought it. Your paid access usually continues until its expiry.</p>
                <button type="button"
                  onClick={() => window.open('https://play.google.com/store/account/subscriptions', '_system')}
                  className="inline-block text-primary underline mt-2" data-testid="link-free-manage-play">
                  Open Google Play subscriptions
                </button>
              </div>
            )}
            {isIos && (
              <p>For an App Store subscription, open Settings → your name → Subscriptions → Roster → Cancel Subscription. Access usually continues until its expiry.</p>
            )}
            <p className="text-muted-foreground">If you have more than one paid subscription, cancel each one separately. If your Roster tier still appears paid after all billing ends, contact support—some access may be assigned separately from billing.</p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Confirmation shown after a redirect-based Stripe success returns to
         this page (billing-portal upgrade or 3DS fallback). Visually mirrors
         the embedded modal's success state so both flows feel consistent. */}
      <Dialog
        open={showRedirectConfirmation}
        onOpenChange={(open) => {
          if (!open) acknowledgeRedirectConfirmation();
        }}
      >
        <DialogContent
          className="max-w-md"
          data-testid="dialog-subscription-redirect-confirmation"
        >
          <DialogHeader>
            <DialogTitle>Subscription active</DialogTitle>
            <DialogDescription className="sr-only">
              Your subscription was successfully activated.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center text-center px-2 pb-4 pt-2 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-semibold">Subscription active!</h2>
            <p className="text-muted-foreground max-w-sm">
              {isCommissioner
                ? "You're now on the Commissioner plan."
                : isPlayerPlus
                ? "You're now on the Player Pro plan."
                : "Thanks for subscribing — we're confirming your new plan now."}
            </p>
            <button
              type="button"
              onClick={acknowledgeRedirectConfirmation}
              className="mt-1 bg-primary text-primary-foreground rounded-lg px-6 py-2 font-semibold hover:bg-primary/90 transition-colors"
              data-testid="button-redirect-confirmation-close"
            >
              Continue
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Apple-required disclosure dialog before opening external payment link — iOS only */}
      {isIos && (
        <AlertDialog open={!!pendingStripeUrl} onOpenChange={(open) => { if (!open) { setPendingStripeUrl(null); setIsLoading(false); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>You're leaving the app</AlertDialogTitle>
              <AlertDialogDescription>
                You're about to leave the app and visit an external website to complete your purchase. Apple is not responsible for the privacy or security of payments made on third-party sites.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => pendingStripeUrl && openStripeUrl(pendingStripeUrl)}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <div className="subscription-banner-wrap">
        <img
          className="subscription-banner"
          src={subscriptionBanner}
          alt="Roster hockey app, achievement patches, and a player"
        />
        <button
          onClick={() => { setPageTransitionDirection('down'); navigate('/profile'); }}
          className="subscription-back"
          aria-label="Back to profile"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <nav className="subscription-selector" aria-label="Choose a subscription plan">
        <div className="subscription-tier-tabs" role="group" aria-label="Subscription tiers">
          {subscriptionPlans.map((plan) => (
            <button
              key={plan.tier}
              type="button"
              aria-pressed={selectedTier === plan.tier}
              onClick={() => setSelectedTier(plan.tier)}
              className="subscription-tier-tab"
              data-testid={`tab-${plan.tier}`}
            >
              {plan.name === 'Free Tier' ? 'Free' : plan.name}
            </button>
          ))}
        </div>
        <p className="subscription-tier-description mt-[0px]">
          {subscriptionPlans.find((plan) => plan.tier === selectedTier)?.description}
        </p>
      </nav>
      {/* Current Status */}
      <div className="subscription-status px-6 mb-6">
        <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6">
          <div className="flex items-center gap-3 mb-3">
            <Crown className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold">Current Plan</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium" data-testid="text-current-plan-name">
                {isCommissioner ? 'Commissioner' : isPlayerPlus ? 'Player Pro' : 'Free Tier'}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-current-plan-price">
                  {isCommissioner
                  ? `${isIos || (isAndroid && !hasStripePlan) ? (iosProductPrices[PRODUCT_COMMISSIONER] ?? commMonthlyDisplay) : commMonthlyDisplay}/month`
                  : isPlayerPlus
                  ? `${isIos || (isAndroid && !hasStripePlan) ? (iosProductPrices[PRODUCT_PLAYER_PRO] ?? proMonthlyDisplay) : proMonthlyDisplay}/month`
                  : 'Free forever'}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              isCommissioner ? 'bg-warning text-black' :
              isPlayerPlus ? 'bg-primary text-primary-foreground' :
              'bg-secondary text-secondary-foreground'
            }`}>
              Active
            </span>
          </div>

          {/* Manage Subscription for Paid Users */}
          {!isFree && (
            <>
              {/* On iOS: subscriptions managed in Settings → Apple ID → Subscriptions */}
              {isIos ? (
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Manage or cancel your App Store subscription in{' '}
                  <strong>Settings → Apple ID → Subscriptions</strong>.
                </p>
              ) : isAndroid ? (
                <div className="mt-4 text-sm text-muted-foreground text-center space-y-2">
                  {hasStripePlan && (
                    <>
                      <p>Your current plan is billed through Roster (Stripe), not Google Play. Cancel it separately if you want to change plans.</p>
                      <button onClick={handleManageSubscription} disabled={isLoading}
                        className="w-full rounded-lg bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50"
                        data-testid="button-manage-roster-android">
                        {isLoading ? 'Opening billing…' : 'Manage Roster billing'}
                      </button>
                    </>
                  )}
                  <p>For a Google Play subscription, open Play Store → Profile → Payments &amp; subscriptions → Subscriptions. A Play purchase is billed separately from Roster billing.</p>
                </div>
              ) : (
                <button
                  onClick={handleManageSubscription}
                  disabled={isLoading || cancelSubscriptionMutation.isPending}
                  className="w-full mt-4 bg-primary text-primary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-manage-subscription"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Loading...</>
                  ) : (
                    <>Manage Subscription via Stripe<ExternalLink className="w-4 h-4" /></>
                  )}
                </button>
              )}

              {/* Cancel — only available via Stripe (web only). On iOS users
                  cancel via Settings; on Android via the Play Store. */}
              {!isIos && !isAndroid && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={isLoading || cancelSubscriptionMutation.isPending}
                      className="w-full mt-3 border border-destructive text-destructive rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-cancel-subscription"
                    >
                      {cancelSubscriptionMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Cancelling...</>
                      ) : (
                        <><XCircle className="w-4 h-4" />Cancel Subscription</>
                      )}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel your subscription? This will:
                        <br />• Take effect <strong>immediately</strong> — no waiting until the end of your billing period
                        <br />• Downgrade your account to the Free Tier right away
                        <br />• Remove access to all paid features
                        <br /><br />This action cannot be undone. You would need to re-subscribe to regain access.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelSubscriptionMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, Cancel Immediately
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )}

          {/* Sync / Restore */}
          {isFree && (
            <div className="flex flex-col gap-2 mt-4">
              {/* Web: Stripe sync (not shown on iOS or Android — they have native restore) */}
              {!isIos && !isAndroid && (
                <button
                  onClick={handleSyncSubscription}
                  disabled={isLoading}
                  className="w-full bg-secondary text-secondary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-sync-subscription"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Syncing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" />Sync Subscription from Stripe</>
                  )}
                </button>
              )}
              {/* iOS: Restore purchases */}
              {isIos && (
                <button
                  onClick={handleIosRestore}
                  disabled={isLoading}
                  className="w-full bg-secondary text-secondary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-restore-purchases"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Restoring...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" />Restore Purchases</>
                  )}
                </button>
              )}
              {/* Android: Restore purchases via Google Play */}
              {isAndroid && (
                <button
                  onClick={handleAndroidRestore}
                  disabled={isLoading}
                  className="w-full bg-secondary text-secondary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-restore-purchases-android"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Restoring...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" />Restore Purchases</>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* League-Wide Player Pro upsell explainer — shown only to free-tier
          users whose league commissioner has paid for Player Pro seats that
          are now all claimed. This is requirement #8 of the league-wide
          Player Pro spec: the upsell UI must explain that league-paid seats
          are full so the user understands why they're still on free tier. */}
      <LeagueProActiveSeatNotice />
      <LeagueProUpcomingSeatNotice />
      {isFree && <LeagueProSeatsFullUpsell />}
      {/* Available Plans */}
      <section className="subscription-plans-block order-2 w-full" aria-label="Selected plan details">
        <div className="space-y-4">
          {subscriptionPlans.map((plan, index) => (
            <div
              key={plan.name}
              className={`subscription-plan-panel ${selectedTier === plan.tier ? 'is-active mt-[0px]' : 'is-inactive'}`}
              data-testid={`plan-${plan.name.toLowerCase().replace(' ', '-')}`}
            >
              {plan.highlight && (
                <div className="subscription-recommendation flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-primary" />
                  <span className="text-primary text-sm font-medium">Recommended</span>
                </div>
              )}

              <div className="plan-intro flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold" data-testid={`text-plan-name-${index}`}>{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold" data-testid={`text-plan-price-${index}`}>{plan.price}</div>
                  <div className="text-sm text-muted-foreground">/{plan.period}</div>
                </div>
              </div>

              <div className={`sub-feature-list ${plan.tier === 'free_tier' ? 'tier-free' : 'tier-paid'}`}>
                {plan.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-center gap-2">
                    <div className="subscription-check" aria-hidden="true">✓</div>
                    <span className="text-sm" data-testid={`text-feature-${index}-${featureIndex}`}>{feature}</span>
                  </div>
                ))}
              </div>

              {plan.tier === 'free_tier' && (
                <p className="subscription-free-price" data-testid="free-plan-price">
                  <strong>{plan.price}</strong>/{plan.period}
                </p>
              )}

              {plan.tier !== 'free_tier' && (
                <div className="subscription-price-choices mt-[4px] mb-[8px]" aria-label="Billing period">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('yearly')}
                    aria-pressed={billingPeriod === 'yearly'}
                    className="subscription-price-choice"
                    data-testid={`billing-choice-yearly-${plan.tier}`}
                  >
                    <span className="price-period">Yearly</span>
                    <span className="price-value">{getPriceForPeriod(plan.tier, 'yearly')}</span>
                    {!isIos && !isAndroid && getStripeSavingsPercent(plan.tier) !== null && (
                      <span className="subscription-savings-pill">Save {getStripeSavingsPercent(plan.tier)}%</span>
                    )}
                    <span className="price-check" aria-hidden="true">✓</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    aria-pressed={billingPeriod === 'monthly'}
                    className="subscription-price-choice pt-[5px] pb-[5px]"
                    data-testid={`billing-choice-monthly-${plan.tier}`}
                  >
                    <span className="price-period">Monthly</span>
                    <span className="price-value">{getPriceForPeriod(plan.tier, 'monthly')}</span>
                    <span className="price-check" aria-hidden="true">✓</span>
                  </button>
                </div>
              )}

              {plan.current ? (
                <button
                  disabled
                  className="w-full py-3 rounded-lg font-semibold bg-secondary text-secondary-foreground cursor-not-allowed"
                  data-testid={`button-${plan.tier}`}
                >
                  Current Plan
                </button>
              ) : plan.tier === 'free_tier' ? (
                (isIos || isAndroid ? (<button
                  onClick={() => setShowFreeHelp(true)}
                  disabled={isLoading}
                  className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid={`button-${plan.tier}`}
                >
                  How to switch to Free
                </button>) : (<button
                  onClick={handleManageSubscription}
                  disabled={isLoading}
                  className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid={`button-${plan.tier}`}
                >Manage Subscription</button>))
              ) : isAndroid && isCommissioner && plan.tier === 'player_pro' ? (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    {hasStripePlan
                      ? 'Your Commissioner plan is billed through Roster. If Google Play already has Player Pro, restore it below; then manage your Roster-billed plan to switch. Do not buy Player Pro again.'
                      : 'Your Roster account currently has Commissioner access, but its billing source is not confirmed here. If Google Play shows Player Pro, do not buy it again. Restore it below; if Play returns no purchase proof, contact support. Do not cancel a subscription just to change the displayed tier.'}
                  </p>
                  <button type="button" onClick={handleAndroidRestore} disabled={isLoading}
                    className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground disabled:opacity-50"
                    data-testid="button-restore-existing-google">
                    {isLoading ? 'Checking Google Play…' : 'Restore existing Google Play purchase'}
                  </button>
                  {hasStripePlan ? (
                    <button type="button" onClick={handleManageSubscription} disabled={isLoading}
                      className="text-primary underline" data-testid="button-change-roster-plan">
                      Manage Roster-billed Commissioner plan
                    </button>
                  ) : (
                    <button type="button"
                      onClick={() => window.open('https://play.google.com/store/account/subscriptions', '_system')}
                      className="block text-primary underline">View Google Play subscriptions</button>
                  )}
                </div>
              ) : isAndroid ? (
                /* Android: only Google Play Billing inside the native app. */
                ((() => {
                  const productId = billingPeriod === 'yearly'
                    ? (plan.tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
                    : (plan.tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER);
                  const playPrice = iosProductPrices[productId];
                  const playPriceId = `price-google-${plan.tier}-${index}`;
                  const statusId = `status-google-${plan.tier}-${index}`;
                  const periodSuffix = billingPeriod === 'yearly' ? 'yr' : 'mo';
                  const checking = androidLookupState === 'checking' || androidLookupState === 'loading' || googleBillingAvailabilityLoading;
                  const canPurchase = canPurchaseAndroidProduct(iosProductPrices, productId, googleBillingAvailability?.available, googleBillingAvailability?.productIds);
                  const alreadyOwned = androidOwnedProducts.includes(productId);
                  const statusMessage = androidLookupState === 'unsupported'
                    ? 'The Google Play billing connection is not available in this app build. Update the app or contact support.'
                    : googleBillingAvailability?.available === false
                      ? 'Google Play purchases cannot be activated right now. Please contact support before attempting payment.'
                    : googleBillingAvailabilityError
                      ? 'Could not check payment availability. Check your connection and try again.'
                      : googleBillingAvailability?.available && !googleBillingAvailability.productIds.includes(productId)
                        ? 'This plan is not currently active in Google Play. Try another plan or contact support.'
                        : !playPrice && !checking
                          ? androidLookupState === 'ready'
                            ? 'This plan is not available from Google Play right now. Try another billing period or contact support.'
                            : 'Google Play plans did not load. Check your connection and Play Store account, then try again.'
                          : null;
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => alreadyOwned ? handleAndroidRestore() : handleAndroidPurchase(plan.tier as 'player_pro' | 'commissioner')}
                          disabled={isLoading || (!canPurchase && !alreadyOwned)}
                          aria-describedby={[playPrice ? playPriceId : '', statusMessage ? statusId : ''].filter(Boolean).join(' ') || undefined}
                          className="flex-1 py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center"
                          data-testid={`button-iap-android-${plan.tier}`}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : alreadyOwned ? (
                            'Restore Google Play subscription'
                          ) : canPurchase ? (
                            'Subscribe via Google Play'
                          ) : checking && !statusMessage ? (
                            'Checking Google Play...'
                          ) : (
                            'Google Play unavailable'
                          )}
                        </button>
                        {playPrice && (
                          <span
                            id={playPriceId}
                            aria-label={`Google Play price ${playPrice} per ${billingPeriod === 'yearly' ? 'year' : 'month'}`}
                            className="text-sm font-medium text-muted-foreground whitespace-nowrap"
                            data-testid={`price-google-${plan.tier}`}
                          >
                            {playPrice}/{periodSuffix}
                          </span>
                        )}
                      </div>
                      {alreadyOwned && (
                        <p role="status" className="text-xs text-muted-foreground">
                          Google Play reports this plan already active. Do not purchase it again; restore it to verify your Roster access.
                        </p>
                      )}
                      {statusMessage && (
                        <p id={statusId} role="status" className="text-xs text-muted-foreground" data-testid={`status-google-${plan.tier}`}>
                          {statusMessage}
                        </p>
                      )}
                      {!alreadyOwned && !canPurchase && (!checking || statusMessage) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAndroidLookupAttempt((attempt) => attempt + 1);
                            void refetchGoogleBillingAvailability();
                          }}
                          className="text-xs text-primary underline text-left"
                          data-testid={`retry-google-${plan.tier}`}
                        >
                          Retry Google Play
                        </button>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Manage via <strong>Play Store → Profile → Payments &amp; subscriptions</strong>
                      </p>
                      <button
                        onClick={() => window.open('https://play.google.com/redeem', '_system')}
                        className="text-xs text-primary underline text-left mt-1 hover:text-primary/80"
                        data-testid={`button-android-promo-${plan.tier}`}
                      >
                        Have a promo code?
                      </button>
                    </div>
                  );
                })())
              ) : isIos ? (
                /* iOS: Roster (Stripe) on top dominant, App Store below outlined.
                   Each button shows its own price label so users can see the
                   difference without any "save" / promotional language in the
                   CTA itself (App Store anti-steering compliance). */
                ((() => {
                  const stripePriceStr = billingPeriod === 'yearly'
                    ? (plan.tier === 'player_pro' ? proYearlyDisplay : commYearlyDisplay)
                    : (plan.tier === 'player_pro' ? proMonthlyDisplay : commMonthlyDisplay);
                  const appStorePrice = iosProductPrices[
                    billingPeriod === 'yearly'
                      ? (plan.tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
                      : (plan.tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER)
                  ];
                  const stripePriceId = `price-stripe-${plan.tier}-${index}`;
                  const appStorePriceId = `price-appstore-${plan.tier}-${index}`;
                  const periodSuffix = billingPeriod === 'yearly' ? 'yr' : 'mo';
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleIosPurchase(plan.tier as 'player_pro' | 'commissioner')}
                          disabled={isLoading || !iapReady}
                          aria-describedby={appStorePrice ? appStorePriceId : undefined}
                          className="flex-1 py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center"
                          data-testid={`button-iap-${plan.tier}`}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Subscribe via App Store'
                          )}
                        </button>
                        {appStorePrice && (
                          <span
                            id={appStorePriceId}
                            aria-label={`App Store price ${appStorePrice} per ${billingPeriod === 'yearly' ? 'year' : 'month'}`}
                            className="text-sm font-medium text-muted-foreground whitespace-nowrap"
                            data-testid={`price-appstore-${plan.tier}`}
                          >
                            {appStorePrice}/{periodSuffix}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Manage via <strong>Settings → Apple ID → Subscriptions</strong>
                      </p>
                    </div>
                  );
                })())
              ) : (
                /* Web / non-iOS: Stripe only */
                ((() => {
                  const stripePriceStr = billingPeriod === 'yearly'
                    ? (plan.tier === 'player_pro' ? proYearlyDisplay : commYearlyDisplay)
                    : (plan.tier === 'player_pro' ? proMonthlyDisplay : commMonthlyDisplay);
                  const stripePriceId = `price-web-${plan.tier}-${index}`;
                  const periodSuffix = billingPeriod === 'yearly' ? 'yr' : 'mo';
                  return (
                    <div className="subscription-web-actions">
                      <button
                        onClick={() => handleStripeUpgrade(plan.tier as 'player_pro' | 'commissioner')}
                        disabled={isLoading || pricesLoading}
                        aria-describedby={stripePriceStr && stripePriceStr !== '...' ? stripePriceId : undefined}
                        className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-2"
                        data-testid={`button-${plan.tier}`}
                      >
                        {(isLoading || pricesLoading) ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Loading...</>
                        ) : (
                          'Continue'
                        )}
                      </button>
                      {stripePriceStr && stripePriceStr !== '...' && (
                        <span
                          id={stripePriceId}
                          aria-label={`Price ${stripePriceStr} per ${billingPeriod === 'yearly' ? 'year' : 'month'}`}
                          className="sr-only"
                          data-testid={`price-web-${plan.tier}`}
                        >
                          {stripePriceStr}/{periodSuffix}
                        </span>
                      )}
                    </div>
                  );
                })())
              )}
              <nav className="subscription-legal-links" aria-label="Subscription legal information">
                <a href="/terms-of-service">Terms of Service</a>
                <span aria-hidden="true">·</span>
                <a href="/privacy-policy">Privacy Policy</a>
              </nav>
            </div>
          ))}
        </div>
      </section>
      {/* Information Notice */}
      <div className="subscription-disclosure px-6 mt-[0px]">
        <p className="text-xs text-muted-foreground text-center">
          {isIos
            ? 'App Store subscriptions are managed through Apple. Cancel anytime via Settings → Apple ID → Subscriptions.'
            : isAndroid
            ? hasStripePlan
              ? 'Your Roster-billed plan is managed through Roster billing. Google Play subscriptions, if any, must be cancelled separately in Play Store.'
              : 'Google Play subscriptions auto-renew until cancelled. Cancel via Play Store → Profile → Payments & subscriptions → Subscriptions.'
            : billingPeriod === 'yearly'
            ? 'Subscriptions are billed annually. Cancel anytime through your account settings.'
            : 'Subscriptions are billed monthly. Cancel anytime through your account settings.'}
        </p>
        {isAndroid && (
          <>
            <p className="text-xs text-muted-foreground text-center mt-2">
              * indicates features coming soon
            </p>
            <p className="text-xs text-muted-foreground text-center mt-3">
              By subscribing via Google Play, you agree to the{' '}
              <a
                href="https://play.google.com/about/play-terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary"
              >
                Google Play Terms of Service
              </a>
              {' '}and our{' '}
              <a href="/terms-of-service" className="underline text-primary">Terms</a>
              {' '}and{' '}
              <a href="/privacy-policy" className="underline text-primary">Privacy Policy</a>.
            </p>
          </>
        )}
        {isIos && (
          <>
            <p className="text-xs text-muted-foreground text-center mt-2">
              * indicates features coming soon
            </p>
            <p className="text-xs text-muted-foreground text-center mt-3">
              By subscribing, you agree to Apple's{' '}
              <a
                href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary"
                onClick={(e) => {
                  e.preventDefault();
                  window.open('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', '_system');
                }}
              >
                Terms of Use (EULA)
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Banner shown on the Subscription page when the user currently holds one or
 * more active League-Wide Player Pro seats. Tells them which league(s) are
 * covering their Pro access and when the grant ends, so they understand they
 * don't need to subscribe individually.
 */
function LeagueProActiveSeatNotice() {
  const { data: activeSeats = [] } = useQuery<
    {
      leagueId: string;
      leagueName: string;
      grantId: string;
      startMonth: string;
      endMonth: string;
    }[]
  >({ queryKey: ['/api/user/league-pro-seats'] });
  if (activeSeats.length === 0) return null;
  return (
    <div className="subscription-notice px-6 mb-4" data-testid="league-pro-active-seat-notice">
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
        <div className="flex items-start gap-3">
          <Crown className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold mb-1">
              Player Pro provided by your league
            </div>
            <ul className="text-muted-foreground space-y-0.5">
              {activeSeats.map((s) => (
                <li key={s.grantId}>
                  <span className="font-medium text-foreground">
                    {s.leagueName}
                  </span>{' '}
                  covers your Player Pro access through{' '}
                  <span className="font-medium text-foreground">
                    {formatMonthYM(s.endMonth)}
                  </span>
                  . No personal upgrade needed.
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Free-tier explainer card shown above the upgrade plans when the user is in
 * one or more leagues whose commissioner has bought League-Wide Player Pro
 * seats but every seat is already assigned. Lets the user know seats are full
 * so they aren't surprised that they're still on free tier despite their
 * league having Pro seats. Renders nothing when the user isn't in such a
 * league (so the section disappears once a seat opens up or the grant lapses).
 */
function formatMonthYM(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function LeagueProUpcomingSeatNotice() {
  const { data: upcoming = [] } = useQuery<
    {
      leagueId: string;
      leagueName: string;
      grantId: string;
      startMonth: string;
      endMonth: string;
    }[]
  >({ queryKey: ['/api/user/league-pro-seats-upcoming'] });
  if (upcoming.length === 0) return null;
  return (
    <div className="subscription-notice px-6 mb-4" data-testid="league-pro-upcoming-seats-notice">
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
        <div className="flex items-start gap-3">
          <Crown className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold mb-1">
              {upcoming.length === 1
                ? "You're reserved a Player Pro seat"
                : "You're reserved Player Pro seats"}
            </div>
            <ul className="text-muted-foreground space-y-0.5">
              {upcoming.map((s) => (
                <li key={s.grantId}>
                  <span className="font-medium text-foreground">
                    {s.leagueName}
                  </span>
                  : {formatMonthYM(s.startMonth)} – {formatMonthYM(s.endMonth)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeagueProSeatsFullUpsell() {
  const { data: leaguesFull = [] } = useQuery<
    { leagueId: string; leagueName: string; seatsTotal: number }[]
  >({
    queryKey: ['/api/user/league-pro-seats-full'],
  });
  if (leaguesFull.length === 0) return null;
  const single = leaguesFull.length === 1;
  return (
    <div className="subscription-notice px-6 mb-4" data-testid="league-pro-seats-full-upsell">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <Crown className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold mb-1">
              {single
                ? `Your league's Player Pro seats are full`
                : `Player Pro seats are full in your leagues`}
            </div>
            <p className="text-muted-foreground">
              {single ? (
                <>
                  <span className="font-medium text-foreground">
                    {leaguesFull[0].leagueName}
                  </span>{' '}
                  paid for {leaguesFull[0].seatsTotal} Player Pro seat
                  {leaguesFull[0].seatsTotal === 1 ? '' : 's'}, and they're all
                  in use by earlier members. You can upgrade individually
                  below to unlock Player Pro features right now.
                </>
              ) : (
                <>
                  These leagues paid for Player Pro seats but they're all in
                  use by earlier members:{' '}
                  <span className="font-medium text-foreground">
                    {leaguesFull
                      .map((l) => `${l.leagueName} (${l.seatsTotal} seats)`)
                      .join(', ')}
                  </span>
                  . You can upgrade individually below to unlock Player Pro
                  features right now.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
