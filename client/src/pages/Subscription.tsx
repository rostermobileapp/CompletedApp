import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Crown, Star, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import rosterLogo from '@assets/Roster-10_1775764992636.png';
import { useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useIosPlatform } from '@/hooks/useIosPlatform';
import {
  isBillingSupported,
  getIosProducts,
  purchaseProduct,
  restorePurchases,
  getAppAccountToken,
  PRODUCT_PLAYER_PRO,
  PRODUCT_COMMISSIONER,
  PRODUCT_PLAYER_PRO_YEARLY,
  PRODUCT_COMMISSIONER_YEARLY,
  type NativelyTransaction,
} from '@/lib/nativePurchases';
import { debugLog, DEBUG_MODE } from '@/lib/debugLogger';
import DebugPanel from '@/components/DebugPanel';

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

  const { isIos, isUsRegion, isReady: platformReady } = useIosPlatform();

  const isCommissioner = role === 'commissioner';
  const isPlayerPlus = role === 'player_pro';
  const isFree = role === 'free_tier';

  // Initialize IAP on iOS — check billing support then fetch real App Store prices
  useEffect(() => {
    if (!platformReady || !isIos) return;
    debugLog(`IAP init — platformReady:${platformReady} isIos:${isIos}`, 'info');
    debugLog('Calling isBillingSupported()…', 'info');
    isBillingSupported().then(async (supported) => {
      debugLog(`isBillingSupported → ${supported}`, supported ? 'success' : 'warning');
      if (!supported) {
        debugLog('StoreKit not available on this device/environment', 'warning');
        return;
      }
      setIapReady(true);
      debugLog('IAP ready — fetching products…', 'info');
      const products = await getIosProducts();
      if (products.length === 0) {
        debugLog('getProducts() returned 0 products — check App Store Connect product IDs', 'warning');
      } else {
        debugLog(`getProducts() returned ${products.length} product(s)`, 'success');
        products.forEach((p) => debugLog(`  Product: ${p.identifier} → ${p.priceString}`, 'info'));
      }
      const priceMap: Record<string, string> = {};
      for (const p of products) {
        priceMap[p.identifier] = p.priceString;
      }
      setIosProductPrices(priceMap);
    }).catch((err) => {
      console.warn('[Subscription] IAP init error:', err);
      debugLog(`IAP init error: ${err?.message ?? String(err)}`, 'error');
    });
  }, [platformReady, isIos]);

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
  // for the selected billing period. For web/Android, return the Stripe price.
  const getPriceDisplay = (tier: 'player_pro' | 'commissioner') => {
    if (isIos) {
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
      const response = await apiRequest('POST', '/api/stripe/create-checkout-session', { priceId });
      const data = await response.json() as { url: string };
      if (!data.url) throw new Error('No checkout URL received from server');
      routeStripeUrl(data.url);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to start checkout. Please try again.', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  // --- iOS IAP helpers ---
  const handleIosPurchase = async (tier: 'player_pro' | 'commissioner') => {
    debugLog(`Subscribe via App Store tapped — tier:${tier} period:${billingPeriod} iapReady:${iapReady}`, 'info');
    setIsLoading(true);
    try {
      const productId = billingPeriod === 'yearly'
        ? (tier === 'player_pro' ? PRODUCT_PLAYER_PRO_YEARLY : PRODUCT_COMMISSIONER_YEARLY)
        : (tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER);
      debugLog(`Initiating purchaseProduct(${productId})…`, 'info');
      const appAccountToken = user?.id ? getAppAccountToken(user.id) : undefined;
      if (appAccountToken) debugLog(`appAccountToken: ${appAccountToken}`, 'info');
      const transaction = await purchaseProduct(productId, appAccountToken);
      debugLog(`purchaseProduct() resolved — txId:${transaction.transactionId ?? 'none'} hasJws:${!!transaction.jwsRepresentation}`, 'success');

      // Build the verification payload, preferring StoreKit 2 JWS > transactionId
      const verifyPayload: Record<string, string> = {};
      if (transaction.jwsRepresentation) {
        verifyPayload.jws = transaction.jwsRepresentation;
        debugLog('Using JWS representation for verification', 'info');
      } else if (transaction.transactionId) {
        verifyPayload.transactionId = transaction.transactionId;
        debugLog(`Using transactionId for verification: ${transaction.transactionId}`, 'info');
      } else {
        throw new Error('No verifiable data returned from App Store. Please try again.');
      }

      debugLog('Sending /api/iap/verify…', 'info');
      const response = await apiRequest('POST', '/api/iap/verify', verifyPayload);

      if (!response.ok) {
        const data = await response.json() as { message?: string };
        throw new Error(data.message || 'Purchase completed but role sync failed. Please restart the app.');
      }

      debugLog('Verification succeeded — subscription active!', 'success');
      toast({ title: 'Subscribed!', description: 'Your subscription is now active.' });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      window.location.reload();
    } catch (error: any) {
      if (
        error?.code === 'PURCHASE_CANCELLED' ||
        error?.message?.toLowerCase().includes('cancel') ||
        error?.message?.toLowerCase().includes('cancelled')
      ) {
        debugLog(`Purchase cancelled by user`, 'warning');
        setIsLoading(false);
        return;
      }
      debugLog(`Purchase failed — code:${error?.code ?? 'none'} msg:${error?.message ?? String(error)}`, 'error');
      toast({ title: 'Purchase failed', description: error.message || 'Something went wrong. Please try again.', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const handleIosRestore = async () => {
    debugLog('Restore Purchases tapped', 'info');
    setIsLoading(true);
    try {
      debugLog('Calling restorePurchases()…', 'info');
      const purchases = await restorePurchases();
      debugLog(`restorePurchases() returned ${purchases.length} item(s)`, purchases.length > 0 ? 'success' : 'warning');

      if (!purchases.length) {
        debugLog('No purchases returned — nothing to restore', 'warning');
        toast({ title: 'No purchases found', description: 'No active subscription was found to restore.' });
        setIsLoading(false);
        return;
      }

      // Prefer JWS > transactionId for restore verification
      let verifyPayload: Record<string, string> | null = null;
      for (const p of purchases as NativelyTransaction[]) {
        debugLog(`  Purchase: ${p.productIdentifier ?? 'unknown'} txId:${p.transactionId ?? 'none'} hasJws:${!!p.jwsRepresentation}`, 'info');
        if (p.jwsRepresentation) {
          verifyPayload = { jws: p.jwsRepresentation };
          debugLog('Using JWS for restore verification', 'info');
          break;
        } else if (p.transactionId) {
          verifyPayload = { transactionId: p.transactionId };
          debugLog(`Using transactionId for restore: ${p.transactionId}`, 'info');
          break;
        }
      }

      if (!verifyPayload) {
        debugLog('Purchases have no jws or transactionId — cannot verify', 'error');
        toast({ title: 'No purchases found', description: 'No active subscription was found to restore.' });
        setIsLoading(false);
        return;
      }

      debugLog('Sending /api/iap/verify for restore…', 'info');
      const response = await apiRequest('POST', '/api/iap/verify', verifyPayload);
      const data = await response.json() as { role?: string; message?: string };

      if (response.ok && data.role && data.role !== 'free_tier') {
        debugLog(`Restore verified — role: ${data.role}`, 'success');
        toast({ title: 'Purchases restored!', description: 'Your subscription has been restored.' });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        window.location.reload();
      } else {
        debugLog(`Restore verify response: ok=${response.ok} role=${data.role ?? 'none'} msg=${data.message ?? ''}`, 'warning');
        toast({ title: 'No active subscription', description: 'No active subscription was found to restore.' });
      }
    } catch (error: any) {
      debugLog(`Restore failed — ${error?.message ?? String(error)}`, 'error');
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
      <DebugPanel />
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
        <div className="bg-card rounded-xl border border-border p-6">
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

              {/* Cancel — only available via Stripe (non-iOS) */}
              {!isIos && (
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
              {/* Web: Stripe sync */}
              {!isIos && (
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
            </div>
          )}
        </div>
      </div>
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
              ) : isIos ? (
                /* iOS: Roster (Stripe) on top dominant, App Store below outlined */
                (<div className="flex flex-col gap-2">
                  {isUsRegion && (
                    <button
                      onClick={() => handleStripeUpgrade(plan.tier as 'player_pro' | 'commissioner')}
                      disabled={isLoading || pricesLoading}
                      className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center"
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
                  )}
                  <button
                    onClick={() => handleIosPurchase(plan.tier as 'player_pro' | 'commissioner')}
                    disabled={isLoading || (!iapReady && !DEBUG_MODE)}
                    className="w-full py-3 rounded-lg font-semibold bg-transparent border border-gray-400 text-foreground hover:bg-muted disabled:opacity-50 flex items-center justify-center"
                    data-testid={`button-iap-${plan.tier}`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Subscribe via App Store'
                    )}
                  </button>
                </div>)
              ) : (
                /* Web / non-iOS: Stripe only */
                (<button
                  onClick={() => handleStripeUpgrade(plan.tier as 'player_pro' | 'commissioner')}
                  disabled={isLoading || pricesLoading}
                  className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid={`button-${plan.tier}`}
                >
                  {(isLoading || pricesLoading) ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Loading...</>
                  ) : (
                    <>{plan.buttonText}<ExternalLink className="w-4 h-4" /></>
                  )}
                </button>)
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
            : billingPeriod === 'yearly'
            ? 'Subscriptions are billed annually. Cancel anytime through your account settings.'
            : 'Subscriptions are billed monthly. Cancel anytime through your account settings.'}
        </p>
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
