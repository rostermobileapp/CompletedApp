import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Crown, Star, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function Subscription() {
  const { role } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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

  // Fetch Stripe price IDs from backend
  const { data: stripePrices, isLoading: pricesLoading } = useQuery<{
    player_pro_monthly?: string;
    commissioner_monthly?: string;
    player_pro_yearly?: string;
    commissioner_yearly?: string;
  }>({
    queryKey: ['/api/stripe/prices'],
  });

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
      price: "$8",
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
      price: "$12", 
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

  const handleManageSubscription = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/create-portal-session');
      const data = await response.json() as { url: string };
      
      // Open billing portal in a new window/tab for better compatibility
      const stripeWindow = window.open(data.url, '_blank');
      if (!stripeWindow) {
        // If popup was blocked, try direct navigation as fallback
        window.location.href = data.url;
      }
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

      const priceId = tier === 'player_pro' 
        ? stripePrices.player_pro_monthly 
        : stripePrices.commissioner_monthly;

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
      
      // Open Stripe Checkout in a new window/tab for better compatibility
      const stripeWindow = window.open(data.url, '_blank');
      if (!stripeWindow) {
        // If popup was blocked, try direct navigation as fallback
        window.location.href = data.url;
      }
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

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="subscription-page">
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
                {isCommissioner ? '$12/month' : isPlayerPlus ? '$8/month' : 'Free forever'}
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
            <button
              onClick={handleManageSubscription}
              disabled={isLoading}
              className="w-full mt-4 bg-primary text-primary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
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
