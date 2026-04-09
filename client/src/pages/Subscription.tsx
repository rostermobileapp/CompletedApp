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
import type { Product } from '@capgo/native-purchases';
import {
  isBillingSupported,
  getIosProducts,
  purchaseProduct,
  restorePurchases,
  getAppAccountToken,
  PRODUCT_PLAYER_PRO,
  PRODUCT_COMMISSIONER,
} from '@/lib/nativePurchases';

export default function Subscription() {
  const { user } = usePermissions();
  const { role } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [pendingStripeUrl, setPendingStripeUrl] = useState<string | null>(null);
  const [iapReady, setIapReady] = useState(false);
  const [iosProducts, setIosProducts] = useState<Product[]>([]);

  const { isIos, isUsRegion, isReady: platformReady } = useIosPlatform();

  const isCommissioner = role === 'commissioner';
  const isPlayerPlus = role === 'player_pro';
  const isFree = role === 'free_tier';

  // Initialize IAP on iOS
  useEffect(() => {
    if (!platformReady || !isIos) return;
    isBillingSupported().then((supported) => {
      if (!supported) return;
      setIapReady(true);
      return getIosProducts();
    }).then((products) => {
      if (products) setIosProducts(products);
    }).catch((err) => {
      console.warn('[Subscription] IAP init error:', err);
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

  const getIosPrice = (productId: string): string => {
    const product = iosProducts.find((p: Product) => p.productIdentifier === productId);
    if (!product) return '...';
    if (product.priceString) return product.priceString;
    if (product.price != null) return `$${product.price.toFixed(2)}`;
    return '...';
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
      price: isIos ? getIosPrice(PRODUCT_PLAYER_PRO) : proMonthlyDisplay,
      period: "month",
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
      price: isIos ? getIosPrice(PRODUCT_COMMISSIONER) : commMonthlyDisplay,
      period: "month",
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

  const handleManageSubscription = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/create-portal-session');
      const data = await response.json() as { url: string };
      setPendingStripeUrl(data.url);
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
      const priceEntry = tier === 'player_pro' ? stripePrices.player_pro_monthly : stripePrices.commissioner_monthly;
      const priceId = priceEntry?.id;
      if (!priceId) throw new Error(`Price not configured for ${tier}. Please contact support.`);
      const response = await apiRequest('POST', '/api/stripe/create-checkout-session', { priceId });
      const data = await response.json() as { url: string };
      if (!data.url) throw new Error('No checkout URL received from server');
      setPendingStripeUrl(data.url);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to start checkout. Please try again.', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  // --- iOS IAP helpers ---
  const handleIosPurchase = async (tier: 'player_pro' | 'commissioner') => {
    setIsLoading(true);
    try {
      const productId = tier === 'player_pro' ? PRODUCT_PLAYER_PRO : PRODUCT_COMMISSIONER;
      const appAccountToken = user?.id ? getAppAccountToken(user.id) : undefined;
      const transaction = await purchaseProduct(productId, appAccountToken);

      if (!transaction.receipt) {
        throw new Error('No receipt returned from App Store. Please try again.');
      }

      // Send receipt + appAccountToken to backend — role is determined server-side from Apple's response
      // appAccountToken lets the server verify the purchase belongs to this user
      const response = await apiRequest('POST', '/api/iap/verify', {
        receipt: transaction.receipt,
        appAccountToken,
      });

      if (!response.ok) throw new Error('Purchase completed but role sync failed. Please restart the app.');

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

      // Find a purchase with a receipt and send it to backend for Apple validation
      const withReceipt = purchases.find((p) => p.receipt);
      if (!withReceipt?.receipt) {
        toast({ title: 'No purchases found', description: 'No active subscription was found to restore.' });
        setIsLoading(false);
        return;
      }

      const response = await apiRequest('POST', '/api/iap/verify', {
        receipt: withReceipt.receipt,
      });

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
      {/* Apple-required disclosure dialog before opening external payment link */}
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
                  ? (isIos ? `${getIosPrice(PRODUCT_COMMISSIONER)}/month` : `${commMonthlyDisplay}/month`)
                  : isPlayerPlus
                  ? (isIos ? `${getIosPrice(PRODUCT_PLAYER_PRO)}/month` : `${proMonthlyDisplay}/month`)
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
                isIos ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Manage via <strong>Settings → Apple ID → Subscriptions</strong>
                  </p>
                ) : (
                  <button
                    onClick={handleManageSubscription}
                    disabled={isLoading}
                    className="w-full py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-2"
                    data-testid={`button-${plan.tier}`}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Manage Subscription
                  </button>
                )
              ) : isIos ? (
                /* iOS: Roster (Stripe) on top dominant, App Store below outlined */
                <div className="flex flex-col gap-2">
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
                    disabled={isLoading || !iapReady}
                    className="w-full py-3 rounded-lg font-semibold bg-transparent border border-gray-400 text-foreground hover:bg-muted disabled:opacity-50 flex items-center justify-center"
                    data-testid={`button-iap-${plan.tier}`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Subscribe via App Store'
                    )}
                  </button>
                </div>
              ) : (
                /* Web / non-iOS: Stripe only */
                <button
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
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Information Notice */}
      <div className="px-6 mt-6">
        <p className="text-xs text-muted-foreground text-center">
          {isIos
            ? 'App Store subscriptions are managed through Apple. Cancel anytime via Settings → Apple ID → Subscriptions.'
            : 'Subscriptions are billed monthly. Cancel anytime through your account settings.'}
        </p>
        {isIos && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            * indicates features coming soon
          </p>
        )}
      </div>
    </div>
  );
}
