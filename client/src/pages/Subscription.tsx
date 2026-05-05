import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, CheckCircle2, Crown, Star, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import rosterLogo from '@assets/Roster-10_1775764992636.png';
import { useLocation } from 'wouter';
import { useState, useEffect, useCallback } from 'react';
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
  getIosProducts,
  getAndroidProducts,
  purchaseProduct,
  purchaseProductAndroid,
  restorePurchases,
  restorePurchasesAndroid,
  getAppAccountToken,
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

  // Confirmation shown when the user returns from a redirect-based Stripe
  // flow (billing-portal upgrade for existing subscribers, or any 3DS
  // fallback redirect from embedded checkout). The success URL in those
  // cases is `/subscription?success=true[&session_id=...]`.
  const [showRedirectConfirmation, setShowRedirectConfirmation] = useState(false);

  const { isIos, isAndroid, isUsRegion, isReady: platformReady } = useIosPlatform();

  // ─── TEMPORARY DEBUG BANNER ───────────────────────────────────────────────
  // Remove once Android platform detection is confirmed working on device.
  const debugInfo = typeof window !== 'undefined' ? {
    ua: navigator.userAgent,
    isIos,
    isAndroid,
    isUsRegion,
    iapReady,
    hasAgent: typeof (window as any).$agent !== 'undefined',
    hasNatively: !!(window as any).natively,
    hasCapacitor: !!(window as any).Capacitor,
  } : null;
  // ──────────────────────────────────────────────────────────────────────────

  const isCommissioner = role === 'commissioner';
  const isPlayerPlus = role === 'player_pro';
  const isFree = role === 'free_tier';

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

  // Initialize IAP on Android — same shape as iOS, but talks to Google Play
  // through the Natively / RevenueCat bridge. The localised price strings
  // come from Play Console (currency + tax-inclusive).
  //
  // IMPORTANT: setIapReady(true) is intentionally deferred until AFTER at
  // least one product price returns successfully. This means:
  //   - RevenueCat IS configured + SKUs active  → prices load → button enables
  //   - RevenueCat NOT configured / SKUs missing → prices time out → button
  //     stays disabled with "Google Play unavailable" instead of enabling and
  //     then silently hanging for 60 s on every purchase tap.
  useEffect(() => {
    if (!platformReady || !isAndroid) return;
    isAndroidBillingSupported().then(async (supported) => {
      console.log('[Subscription] Android billing supported:', supported, {
        ua: navigator.userAgent,
        hasAgent: typeof (window as any).$agent !== 'undefined',
      });
      if (!supported) return;

      console.log('[Subscription] Fetching Android product prices…');
      const products = await getAndroidProducts();
      console.log('[Subscription] Android products returned:', products.length, products);

      if (products.length === 0) {
        // RevenueCat bridge is not responding (API key missing in BuildNatively,
        // or SKUs not configured in RevenueCat dashboard). Leave iapReady false
        // so the button shows "Google Play unavailable" rather than spinning.
        console.warn('[Subscription] Android: 0 products returned — RevenueCat likely not configured for Android. Configure the Android API key in BuildNatively and add SKUs in RevenueCat dashboard.');
        return;
      }

      const priceMap: Record<string, string> = {};
      for (const p of products) {
        priceMap[p.identifier] = p.priceString;
      }
      setIosProductPrices((prev) => ({ ...prev, ...priceMap }));
      // Only enable the button once we know RevenueCat is live and responding.
      setIapReady(true);
      console.log('[Subscription] Android IAP ready. Price map:', priceMap);
    }).catch((err) => {
      console.warn('[Subscription] Android IAP init error:', err);
    });
  }, [platformReady, isAndroid]);

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

  const subscriptionPlans = [
    {
      name: "Free Tier",
      price: "$0",
      period: "forever",
      description: "Basic features for casual players",
      features: [
        "Join Leagues / Teams",
        "Scheduling",
        "RSVP Function",
        "Team Only Stats"
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
      description: "Enhanced features for serious players",
      features: [
        "FREE +",
        "Team Management",
        "In-App Messaging",
        "In-App Payments",
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
        "Awards & Records*",
        "Bracket Management*"
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
      const appAccountToken = user?.id ? getAppAccountToken(user.id) : undefined;
      const transaction = await purchaseProduct(productId, appAccountToken);

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
      toast({ title: 'Purchase failed', description: error.message || 'Something went wrong. Please try again.', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const handleIosRestore = async () => {
    setIsLoading(true);
    try {
      const purchases = await restorePurchases();

      if (!purchases.length) {
        toast({ title: 'No purchases found', description: 'No active subscription was found to restore.' });
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
        toast({ title: 'No purchases found', description: 'No active subscription was found to restore.' });
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
    setIsLoading(true);
    console.log(`Step 1: handleAndroidPurchase called with tier=${tier}`, {
      billingPeriod,
      iapReady,
      isAndroid,
      isIos,
      iosProductPricesKeys: Object.keys(iosProductPrices),
      ua: navigator.userAgent,
      hasAgent: typeof (window as any).$agent !== 'undefined',
    });
    try {
      const productId = billingPeriod === 'yearly'
        ? (tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
        : (tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER);

      console.log(`Step 2: Calling Natively Google Play purchase method for productId=${productId}`);
      const purchase = await purchaseProductAndroid(productId);
      console.log(`Step 3: Natively responded: ${JSON.stringify(purchase)}`);

      console.log(`Step 4: Sending receipt to /api/iap/verify-google`, {
        purchaseToken: purchase.purchaseToken?.slice(0, 20) + '…',
        productId: purchase.productIdentifier || productId,
      });
      const response = await apiRequest('POST', '/api/iap/verify-google', {
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productIdentifier || productId,
      });

      const serverJson = await response.json().catch(() => ({}));
      console.log(`Step 5: Server response: status=${response.status}`, serverJson);

      if (!response.ok) {
        throw new Error((serverJson as any).message || 'Purchase completed but role sync failed. Please tap Restore Purchases.');
      }

      toast({ title: 'Subscribed!', description: 'Your subscription is now active.' });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      window.location.reload();
    } catch (error: any) {
      console.error('[Subscription/Android] Purchase error:', error?.message, error?.stack);
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
      const purchases = await restorePurchasesAndroid();

      if (!purchases.length) {
        toast({ title: 'No purchases found', description: 'No active subscription was found to restore.' });
        setIsLoading(false);
        return;
      }

      // Try each restored purchase token until one verifies as active. Most
      // users only have one active sub, but multi-product accounts (e.g. an
      // upgrade from Player Pro → Commissioner) can have several.
      let verified = false;
      let lastError: string | null = null;
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
          lastError = data.message ?? null;
        } catch (err: any) {
          lastError = err?.message ?? 'Verification failed';
        }
      }

      if (verified) {
        toast({ title: 'Purchases restored!', description: 'Your subscription has been restored.' });
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

  // --- Sync (Stripe fallback for web) ---
  const handleSyncSubscription = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/sync-subscription');
      const data = await response.json() as { message: string; tier: string };
      toast({
        title: 'Success',
        description: `Your subscription has been synced! You are now on the ${data.tier === 'commissioner' ? 'Commissioner' : 'Player Pro'} tier.`,
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
    <div className="min-h-screen flex flex-col pb-24" data-testid="subscription-page">
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

      {/* ── TEMPORARY DEBUG BANNER — remove after Android platform detection confirmed ── */}
      {debugInfo && (
        <div style={{
          background: '#FFD700',
          color: '#000',
          padding: '12px 16px',
          fontSize: '13px',
          fontFamily: 'monospace',
          lineHeight: '1.8',
          wordBreak: 'break-all',
          zIndex: 9999,
          borderBottom: '2px solid #B8860B',
        }}>
          <strong style={{ fontSize: '15px' }}>🔍 Platform Debug</strong><br />
          <strong>isIos:</strong> {String(debugInfo.isIos)} &nbsp;
          <strong>isAndroid:</strong> {String(debugInfo.isAndroid)} &nbsp;
          <strong>isUsRegion:</strong> {String(debugInfo.isUsRegion)} &nbsp;
          <strong>iapReady:</strong> {String(debugInfo.iapReady)}<br />
          <strong>$agent:</strong> {String(debugInfo.hasAgent)} &nbsp;
          <strong>window.natively:</strong> {String(debugInfo.hasNatively)} &nbsp;
          <strong>Capacitor:</strong> {String(debugInfo.hasCapacitor)}<br />
          <strong>UA:</strong> {debugInfo.ua}
        </div>
      )}
      {/* ── END DEBUG BANNER ── */}
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
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => { setPageTransitionDirection('down'); navigate('/profile'); }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Manage Subscription</h1>
        </div>
      </div>
      {/* Current Status */}
      <div className="px-6 mb-6">
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
                  ? `${isIos ? (iosProductPrices[PRODUCT_COMMISSIONER] ?? commMonthlyDisplay) : commMonthlyDisplay}/month`
                  : isPlayerPlus
                  ? `${isIos ? (iosProductPrices[PRODUCT_PLAYER_PRO] ?? proMonthlyDisplay) : proMonthlyDisplay}/month`
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
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Manage or cancel your Google Play subscription in{' '}
                  <strong>Play Store → Profile → Payments &amp; subscriptions → Subscriptions</strong>.
                </p>
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
      <div className="px-6">
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>

        {/* Monthly / Yearly billing toggle */}
        <div className="flex items-center justify-center mb-5">
          <div className="flex bg-secondary rounded-lg p-1">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
                billingPeriod === 'monthly'
                  ? 'bg-[#3c83f6] text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
                billingPeriod === 'yearly'
                  ? 'bg-[#3c83f6] text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {subscriptionPlans.map((plan, index) => (
            <div
              key={plan.name}
              className={`bg-card rounded-xl border p-6 ${plan.highlight ? 'border-primary' : 'border-border'}`}
              data-testid={`plan-${plan.name.toLowerCase().replace(' ', '-')}`}
            >
              {plan.highlight && (
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-primary" />
                  <span className="text-primary text-sm font-medium">Recommended</span>
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold" data-testid={`text-plan-name-${index}`}>{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold" data-testid={`text-plan-price-${index}`}>{plan.price}</div>
                  <div className="text-sm text-muted-foreground">/{plan.period}</div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {plan.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-sm" data-testid={`text-feature-${index}-${featureIndex}`}>{feature}</span>
                  </div>
                ))}
              </div>

              {plan.current ? (
                <button
                  disabled
                  className="w-full py-3 rounded-lg font-semibold bg-secondary text-secondary-foreground cursor-not-allowed"
                  data-testid={`button-${plan.tier}`}
                >
                  Current Plan
                </button>
              ) : plan.tier === 'free_tier' ? (
                /* Paid user viewing Free Tier card — manage via platform-appropriate path */
                (isIos ? (<p className="text-sm text-muted-foreground text-center py-2">Manage via <strong>Settings → Apple ID → Subscriptions</strong>
                </p>) : isAndroid ? (<p className="text-sm text-muted-foreground text-center py-2">Manage via <strong>Play Store → Subscriptions</strong>
                </p>) : (<button
                  onClick={handleManageSubscription}
                  disabled={isLoading}
                  className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid={`button-${plan.tier}`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}Manage Subscription
                                    </button>))
              ) : isAndroid ? (
                /* Android: Roster (Stripe) on top dominant, Google Play below
                   outlined — same dual-button layout as iOS. */
                (() => {
                  const stripePriceStr = billingPeriod === 'yearly'
                    ? (plan.tier === 'player_pro' ? proYearlyDisplay : commYearlyDisplay)
                    : (plan.tier === 'player_pro' ? proMonthlyDisplay : commMonthlyDisplay);
                  const playPrice = iosProductPrices[
                    billingPeriod === 'yearly'
                      ? (plan.tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
                      : (plan.tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER)
                  ];
                  const stripePriceId = `price-android-stripe-${plan.tier}-${index}`;
                  const playPriceId = `price-google-${plan.tier}-${index}`;
                  const periodSuffix = billingPeriod === 'yearly' ? 'yr' : 'mo';
                  return (
                    <div className="flex flex-col gap-2">
                      {isUsRegion && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleStripeUpgrade(plan.tier as 'player_pro' | 'commissioner')}
                            disabled={isLoading || pricesLoading}
                            aria-describedby={stripePriceStr && stripePriceStr !== '...' ? stripePriceId : undefined}
                            className="flex-1 py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center"
                            data-testid={`button-stripe-${plan.tier}`}
                          >
                            {(isLoading || pricesLoading) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span className="flex items-center gap-2">
                                <span>Subscribe via</span>
                                <img src={rosterLogo} alt="Roster" className="h-6 object-contain" />
                              </span>
                            )}
                          </button>
                          {stripePriceStr && stripePriceStr !== '...' && (
                            <span
                              id={stripePriceId}
                              aria-label={`Roster price ${stripePriceStr} per ${billingPeriod === 'yearly' ? 'year' : 'month'}`}
                              className="text-sm font-medium text-muted-foreground whitespace-nowrap"
                              data-testid={`price-android-stripe-${plan.tier}`}
                            >
                              {stripePriceStr}/{periodSuffix}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleAndroidPurchase(plan.tier as 'player_pro' | 'commissioner')}
                          disabled={isLoading || !iapReady}
                          aria-describedby={playPrice ? playPriceId : undefined}
                          className="flex-1 py-3 rounded-lg font-semibold bg-transparent border border-gray-400 text-foreground hover:bg-muted disabled:opacity-50 flex items-center justify-center"
                          data-testid={`button-iap-android-${plan.tier}`}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : !iapReady ? (
                            'Google Play unavailable'
                          ) : (
                            'Subscribe via Google Play'
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
                    </div>
                  );
                })()
              ) : isIos ? (
                /* iOS: Roster (Stripe) on top dominant, App Store below outlined.
                   Each button shows its own price label so users can see the
                   difference without any "save" / promotional language in the
                   CTA itself (App Store anti-steering compliance). */
                (() => {
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
                      {isUsRegion && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleStripeUpgrade(plan.tier as 'player_pro' | 'commissioner')}
                            disabled={isLoading || pricesLoading}
                            aria-describedby={stripePriceStr ? stripePriceId : undefined}
                            className="flex-1 py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center"
                            data-testid={`button-stripe-${plan.tier}`}
                          >
                            {(isLoading || pricesLoading) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span className="flex items-center gap-2">
                                <span>Subscribe via</span>
                                <img src={rosterLogo} alt="Roster" className="h-6 object-contain" />
                              </span>
                            )}
                          </button>
                          {stripePriceStr && stripePriceStr !== '...' && (
                            <span
                              id={stripePriceId}
                              aria-label={`Roster price ${stripePriceStr} per ${billingPeriod === 'yearly' ? 'year' : 'month'}`}
                              className="text-sm font-medium text-muted-foreground whitespace-nowrap"
                              data-testid={`price-stripe-${plan.tier}`}
                            >
                              {stripePriceStr}/{periodSuffix}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleIosPurchase(plan.tier as 'player_pro' | 'commissioner')}
                          disabled={isLoading || !iapReady}
                          aria-describedby={appStorePrice ? appStorePriceId : undefined}
                          className="flex-1 py-3 rounded-lg font-semibold bg-transparent border border-gray-400 text-foreground hover:bg-muted disabled:opacity-50 flex items-center justify-center"
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
                    </div>
                  );
                })()
              ) : (
                /* Web / non-iOS: Stripe only */
                (() => {
                  const stripePriceStr = billingPeriod === 'yearly'
                    ? (plan.tier === 'player_pro' ? proYearlyDisplay : commYearlyDisplay)
                    : (plan.tier === 'player_pro' ? proMonthlyDisplay : commMonthlyDisplay);
                  const stripePriceId = `price-web-${plan.tier}-${index}`;
                  const periodSuffix = billingPeriod === 'yearly' ? 'yr' : 'mo';
                  return (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleStripeUpgrade(plan.tier as 'player_pro' | 'commissioner')}
                        disabled={isLoading || pricesLoading}
                        aria-describedby={stripePriceStr && stripePriceStr !== '...' ? stripePriceId : undefined}
                        className="flex-1 py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-2"
                        data-testid={`button-${plan.tier}`}
                      >
                        {(isLoading || pricesLoading) ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Loading...</>
                        ) : (
                          <>{plan.buttonText}<ExternalLink className="w-4 h-4" /></>
                        )}
                      </button>
                      {stripePriceStr && stripePriceStr !== '...' && (
                        <span
                          id={stripePriceId}
                          aria-label={`Price ${stripePriceStr} per ${billingPeriod === 'yearly' ? 'year' : 'month'}`}
                          className="text-sm font-medium text-muted-foreground whitespace-nowrap"
                          data-testid={`price-web-${plan.tier}`}
                        >
                          {stripePriceStr}/{periodSuffix}
                        </span>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Information Notice */}
      <div className="px-6 mt-[0px]">
        <p className="text-xs text-muted-foreground text-center">
          {isIos
            ? 'App Store subscriptions are managed through Apple. Cancel anytime via Settings → Apple ID → Subscriptions.'
            : isAndroid
            ? 'Google Play subscriptions auto-renew until cancelled. Cancel anytime via Play Store → Profile → Payments & subscriptions → Subscriptions.'
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
              By subscribing, you agree to the Google Play{' '}
              <a
                href="https://play.google.com/about/play-terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary"
              >
                Terms of Service
              </a>
              {' '}and our{' '}
              <a href="/terms-of-service" className="underline text-primary">
                Terms
              </a>{' '}
              and{' '}
              <a href="/privacy-policy" className="underline text-primary">
                Privacy Policy
              </a>
              .
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
    <div className="px-6 mb-4" data-testid="league-pro-active-seat-notice">
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
    <div className="px-6 mb-4" data-testid="league-pro-upcoming-seats-notice">
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
    <div className="px-6 mb-4" data-testid="league-pro-seats-full-upsell">
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
