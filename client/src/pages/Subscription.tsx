import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/context/SubscriptionContext';
import { ArrowLeft, Check, Crown, Zap, Shield } from 'lucide-react';
import { useLocation } from 'wouter';
import { isUnauthorizedError } from '@/lib/authUtils';

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const SubscribeForm = () => {
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
        return_url: window.location.origin,
      },
    });

    if (error) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Subscription Active",
        description: "Welcome to Player Plus!",
      });
    }
    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="subscription-form">
      <PaymentElement />
      <button 
        type="submit" 
        disabled={!stripe || isLoading}
        className="w-full bg-primary text-primary-foreground rounded-lg py-3 font-semibold disabled:opacity-50"
        data-testid="button-complete-subscription"
      >
        {isLoading ? 'Processing...' : 'Complete Subscription'}
      </button>
    </form>
  );
};

export default function Subscription() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState("");
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    if (tier !== 'free') return;
    
    // Create subscription when user clicks upgrade
    if (showPayment) {
      apiRequest("POST", "/api/create-subscription")
        .then((res) => res.json())
        .then((data) => {
          setClientSecret(data.clientSecret);
        })
        .catch((error) => {
          if (isUnauthorizedError(error)) {
            toast({
              title: "Unauthorized",
              description: "You are logged out. Logging in again...",
              variant: "destructive",
            });
            setTimeout(() => {
              window.location.href = "/api/login";
            }, 500);
            return;
          }
          toast({
            title: "Error",
            description: "Failed to create subscription",
            variant: "destructive",
          });
        });
    }
  }, [showPayment, tier, toast]);

  const playerPlusFeatures = [
    'Team messaging & direct messages',
    'Find & request substitutes',
    'Detailed team & player stats',
    'League rankings & standings',
    'In-app payments',
    'Attendance confirmations',
  ];

  const commissionerFeatures = [
    'All Player Plus features',
    'League-wide messaging',
    'Player skill ratings',
    'Draft functionality',
    'Game scheduling',
    'Playoff bracket creation',
  ];

  if (showPayment && clientSecret) {
    return (
      <div className="min-h-screen flex flex-col pb-24" data-testid="subscription-payment-page">
        <div className="p-6 pt-12">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={() => setShowPayment(false)}
              className="text-muted-foreground"
              data-testid="button-back-to-plans"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold">Complete Payment</h1>
          </div>
        </div>
        
        <div className="px-6">
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <SubscribeForm />
          </Elements>
          
          <div className="mt-6 p-4 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3 text-center justify-center">
              <Shield className="w-5 h-5 text-success" />
              <span className="text-sm text-muted-foreground">Secure payment powered by Stripe</span>
            </div>
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
            onClick={() => navigate('/')}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Upgrade Account</h1>
        </div>
      </div>
      
      {/* Current Plan */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-4" data-testid="card-current-plan">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold" data-testid="text-current-plan-title">Current Plan</h3>
              <p className="text-muted-foreground" data-testid="text-current-plan-type">
                {tier === 'commissioner' ? 'Commissioner' : tier === 'player_plus' ? 'Player Plus' : 'Free Tier'}
              </p>
            </div>
            <span 
              className={`tier-badge text-xs px-2 py-1 rounded-full font-semibold ${
                tier === 'commissioner' 
                  ? 'bg-warning text-black' 
                  : tier === 'player_plus' 
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
              }`}
              data-testid="badge-current-tier"
            >
              {tier === 'commissioner' ? 'COMMISSIONER' : tier === 'player_plus' ? 'PLAYER PLUS' : 'FREE'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Subscription Plans */}
      <div className="px-6 mb-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-plans-title">Choose Your Plan</h2>
        
        {/* Player Plus Plan */}
        {tier === 'free' && (
          <div className="bg-primary/10 border-2 border-primary rounded-xl p-6 mb-4" data-testid="card-player-plus-plan">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold text-primary" data-testid="text-player-plus-title">Player Plus</h3>
                </div>
                <p className="text-muted-foreground" data-testid="text-player-plus-subtitle">Most Popular</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-primary" data-testid="text-player-plus-price">$5</p>
                <p className="text-sm text-muted-foreground">/month</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-6">
              {playerPlusFeatures.map((feature, index) => (
                <div key={index} className="flex items-center gap-3" data-testid={`feature-player-plus-${index}`}>
                  <Check className="w-4 h-4 text-primary" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
            
            <button 
              onClick={() => setShowPayment(true)}
              className="w-full bg-primary text-primary-foreground rounded-lg py-3 font-semibold"
              data-testid="button-upgrade-player-plus"
            >
              Upgrade to Player Plus
            </button>
          </div>
        )}
        
        {/* Commissioner Plan */}
        <div className="bg-card border border-border rounded-xl p-6" data-testid="card-commissioner-plan">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-warning" />
                <h3 className="text-xl font-bold text-warning" data-testid="text-commissioner-title">Commissioner</h3>
              </div>
              <p className="text-muted-foreground" data-testid="text-commissioner-subtitle">Full League Management</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-muted-foreground" data-testid="text-commissioner-price">Contact</p>
              <p className="text-sm text-muted-foreground">for pricing</p>
            </div>
          </div>
          
          <div className="space-y-3 mb-6">
            {commissionerFeatures.map((feature, index) => (
              <div key={index} className="flex items-center gap-3" data-testid={`feature-commissioner-${index}`}>
                <Check className="w-4 h-4 text-warning" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
          
          <button 
            className="w-full bg-warning text-black rounded-lg py-3 font-semibold"
            data-testid="button-contact-sales"
          >
            Contact Sales
          </button>
        </div>
      </div>
      
      {/* Payment Security */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-lg border border-border p-4" data-testid="card-payment-security">
          <div className="flex items-center gap-3 text-center justify-center">
            <Shield className="w-5 h-5 text-success" />
            <span className="text-sm text-muted-foreground">Secure payment powered by Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
