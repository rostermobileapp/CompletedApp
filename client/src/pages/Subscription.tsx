import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Crown, Check, Star } from 'lucide-react';
import { useLocation } from 'wouter';

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const SubscribeForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!stripe || !elements) {
      setIsLoading(false);
      return;
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/subscription',
      },
    });

    setIsLoading(false);

    if (error) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Payment Successful",
        description: "You are now subscribed to Player Pro!",
      });
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || isLoading}
        className="w-full bg-primary text-primary-foreground rounded-lg py-3 font-semibold disabled:opacity-50"
        data-testid="button-subscribe"
      >
        {isLoading ? 'Processing...' : 'Subscribe to Player Pro'}
      </button>
    </form>
  );
};

export default function Subscription() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const isCommissioner = role === 'commissioner';
  const isPlayerPlus = role === 'player_pro';
  const isFree = role === 'free_tier';

  useEffect(() => {
    // Only fetch payment intent if user wants to upgrade
    if (showPaymentForm && !clientSecret) {
      apiRequest("POST", "/api/get-or-create-subscription")
        .then((res) => res.json())
        .then((data) => {
          setClientSecret(data.clientSecret);
        })
        .catch((error) => {
          toast({
            title: "Error",
            description: "Failed to initialize payment. Please try again.",
            variant: "destructive",
          });
          setShowPaymentForm(false);
        });
    }
  }, [showPaymentForm, clientSecret, toast]);

  const handleUpgradeSuccess = () => {
    setShowPaymentForm(false);
    setClientSecret("");
    // Refresh the page to update user role
    window.location.reload();
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
      buttonText: isFree ? "Current Plan" : "Downgrade",
      buttonDisabled: true,
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
      buttonText: isPlayerPlus ? "Current Plan" : "Upgrade to Player Pro",
      buttonDisabled: isPlayerPlus,
      highlight: !isCommissioner,
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
        "Awards & Records",
        "Bracket Management"
      ],
      current: isCommissioner,
      buttonText: isCommissioner ? "Current Plan" : "Upgrade to Commissioner",
      buttonDisabled: isCommissioner,
      highlight: false,
    }
  ];

  if (showPaymentForm && clientSecret) {
    return (
      <div className="min-h-screen flex flex-col pb-24" data-testid="subscription-page">
        {/* Header */}
        <div className="p-6 pt-12">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={() => {
                setShowPaymentForm(false);
                setClientSecret("");
              }}
              className="text-muted-foreground"
              data-testid="button-back-to-plans"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Complete Subscription</h1>
          </div>
        </div>

        <div className="px-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="mb-6 text-center">
              <Crown className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-semibold mb-2">Upgrade to Player Pro</h2>
              <p className="text-muted-foreground">$8/month - Cancel anytime</p>
            </div>

            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <SubscribeForm onSuccess={handleUpgradeSuccess} />
            </Elements>
          </div>
        </div>
      </div>
    );
  }

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
              <p className="font-medium">
                {isCommissioner ? 'Commissioner' : isPlayerPlus ? 'Player Pro' : 'Free Tier'}
              </p>
              <p className="text-sm text-muted-foreground">
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
                  <h3 className="font-semibold text-lg">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm mb-2">{plan.description}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    {plan.price !== "$0" && (
                      <span className="text-muted-foreground">/{plan.period}</span>
                    )}
                  </div>
                </div>
                {plan.current && (
                  <span className="bg-success text-success-foreground px-2 py-1 rounded text-xs font-medium">
                    Current
                  </span>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-success" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => {
                  if (plan.name === "Player Pro" && !isPlayerPlus && !isCommissioner) {
                    setShowPaymentForm(true);
                  }
                }}
                disabled={plan.buttonDisabled}
                className={`w-full py-2 rounded-lg font-medium transition-colors ${
                  plan.buttonDisabled 
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : plan.highlight
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
                data-testid={`button-${plan.name.toLowerCase().replace(' ', '-')}`}
              >
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>

        {/* Note about current free access */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Note:</strong> During beta, all features are currently free and accessible to everyone. 
            Subscription plans will be activated after the beta period.
          </p>
        </div>
      </div>
    </div>
  );
}