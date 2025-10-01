import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Crown, Star, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';

const STRIPE_BILLING_PORTAL_URL = 'https://billing.stripe.com/p/login/9B68wO7cJ5ENeUqaaD2B200';

export default function Subscription() {
  const { role } = usePermissions();
  const [, navigate] = useLocation();

  const isCommissioner = role === 'commissioner';
  const isPlayerPlus = role === 'player_pro';
  const isFree = role === 'free_tier';

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

  const handleManageSubscription = () => {
    window.open(STRIPE_BILLING_PORTAL_URL, '_blank', 'noopener,noreferrer');
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
              className="w-full mt-4 bg-primary text-primary-foreground rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
              data-testid="button-manage-subscription"
            >
              Manage Subscription via Stripe
              <ExternalLink className="w-4 h-4" />
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
                onClick={handleManageSubscription}
                disabled={plan.buttonDisabled}
                className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                  plan.current
                    ? 'bg-secondary text-secondary-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
                data-testid={`button-${plan.tier}`}
              >
                {plan.buttonText}
                {!plan.current && <ExternalLink className="w-4 h-4" />}
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
