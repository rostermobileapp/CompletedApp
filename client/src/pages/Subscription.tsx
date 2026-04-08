import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Crown, Star, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function Subscription() {
  const { role } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [pendingStripeUrl, setPendingStripeUrl] = useState<string | null>(null);

  const isCommissioner = role === 'commissioner';
  const isPlayerPlus = role === 'player_pro';
  const isFree = role === 'free_tier';

  // Auto-sync subscription status on page load to ensure role is accurate
  useEffect(() => {
    const syncSubscription = async () => {
      try {
        await apiRequest('POST', '/api/stripe/sync-subscription');
        // Invalidate user query to refresh role
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      } catch (error) {
        // Silent fail - sync is best effort
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

  // Fetch Stripe price IDs and live amounts from backend
  const { data: stripePrices, isLoading: pricesLoading } = useQuery<StripePricesResponse>({
    queryKey: ['/api/stripe/prices'],
  });

  const formatPrice = (entry?: StripePriceEntry) => {
    if (!entry || entry.amount === null) return null;
    return `$${entry.amount % 1 === 0 ? entry.amount.toFixed(0) : entry.amount.toFixed(2)}`;
  };

  const proMonthlyDisplay = formatPrice(stripePrices?.player_pro_monthly) ?? '...';
  const commMonthlyDisplay = formatPrice(stripePrices?.commissioner_monthly) ?? '...';

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
      price: proMonthlyDisplay,
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
      price: commMonthlyDisplay,
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
      console.error('Error creating portal session:', error);
      
      // Extract the actual error message from the server response
      let errorMessage = 'Failed to open subscription management. Please try again.';
      
      if (error.message) {
        // Parse the error message which is in format "500: {...json...}"
        try {
          const match = error.message.match(/\d+:\s*(.+)/);
          if (match) {
            const jsonStr = match[1];
            const errorData = JSON.parse(jsonStr);
            if (errorData.message) {
              errorMessage = errorData.message;
            }
          }
        } catch (parseError) {
          // If parsing fails, use the original error message
          errorMessage = error.message;
        }
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleUpgradePlan = async (tier: 'player_pro' | 'commissioner') => {
    setIsLoading(true);
    try {
      // Get the correct price ID from the fetched Stripe prices
      if (!stripePrices) {
        throw new Error('Pricing information not available. Please try again.');
      }

      const priceEntry = tier === 'player_pro'
        ? stripePrices.player_pro_monthly
        : stripePrices.commissioner_monthly;

      const priceId = priceEntry?.id;

      if (!priceId) {
        throw new Error(`Price not configured for ${tier}. Please contact support.`);
      }

      const response = await apiRequest('POST', '/api/stripe/create-checkout-session', {
        priceId,
      });
      
      const data = await response.json() as { url: string };
      
      if (!data.url) {
        throw new Error('No checkout URL received from server');
      }
      
      setPendingStripeUrl(data.url);
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleSyncSubscription = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/sync-subscription');
      const data = await response.json() as { message: string; tier: string };
      
      toast({
        title: 'Success',
        description: `Your subscription has been synced! You are now on the ${data.tier === 'commissioner' ? 'Commissioner' : 'Player Pro'} tier.`,
      });
      
      // Reload the page to update the UI
      window.location.reload();
    } catch (error: any) {
      console.error('Error syncing subscription:', error);
      const errorMessage = error.message || 'Failed to sync subscription. Please try again or contact support.';
      toast({
        title: 'Sync Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/stripe/cancel-subscription');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription has been cancelled immediately. You have been moved to the Free Tier.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: 'Cancellation Failed',
        description: error.message || 'Failed to cancel subscription. Please try again.',
        variant: 'destructive',
      });
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
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/profile');
            }}
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
                  ? `${commMonthlyDisplay}/month`
                  : isPlayerPlus
                  ? `${proMonthlyDisplay}/month`
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
          
          {/* Manage Subscription Button for Paid Users */}
          {!isFree && (
            <>
              <button
                onClick={handleManageSubscription}
                disabled={isLoading || cancelSubscriptionMutation.isPending}
                className="w-full mt-4 bg-primary text-primary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-manage-subscription"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Manage Subscription via Stripe
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={isLoading || cancelSubscriptionMutation.isPending}
                    className="w-full mt-3 border border-destructive text-destructive rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="button-cancel-subscription"
                  >
                    {cancelSubscriptionMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        Cancel Subscription
                      </>
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
            </>
          )}

          {/* Sync Subscription Button for Free Users who might have paid in Stripe */}
          {isFree && (
            <button
              onClick={handleSyncSubscription}
              disabled={isLoading}
              className="w-full mt-4 bg-secondary text-secondary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-sync-subscription"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync Subscription from Stripe
                </>
              )}
            </button>
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
              className={`bg-card rounded-xl border p-6 ${
                plan.highlight ? 'border-primary' : 'border-border'
              }`}
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

              <button
                onClick={() => {
                  if (plan.current) return;
                  
                  // Use button text to determine action:
                  // "Upgrade Plan" -> Checkout
                  // "Manage Subscription" -> Portal
                  if (plan.buttonText === "Upgrade Plan" && plan.tier !== 'free_tier') {
                    handleUpgradePlan(plan.tier);
                  } else {
                    handleManageSubscription();
                  }
                }}
                disabled={plan.buttonDisabled || isLoading || pricesLoading}
                className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                  plan.current
                    ? 'bg-secondary text-secondary-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary disabled:opacity-50'
                }`}
                data-testid={`button-${plan.tier}`}
              >
                {(isLoading || pricesLoading) && !plan.current ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    {plan.buttonText}
                    {!plan.current && <ExternalLink className="w-4 h-4" />}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Information Notice */}
      <div className="px-6 mt-6">
        <div className="bg-muted/50 rounded-lg p-4 border border-border">
          <p className="text-sm text-muted-foreground">
            * Features coming soon
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            All subscription changes are managed securely through Stripe. You can upgrade, downgrade, or cancel your subscription at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
