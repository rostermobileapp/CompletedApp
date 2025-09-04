import { useState } from 'react';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/useAuth';
import { useSubscription, type SubscriptionTier } from '@/context/SubscriptionContext';
import { ArrowLeft, Check, Crown, Zap, Shield } from 'lucide-react';
import { useLocation } from 'wouter';
import { isUnauthorizedError } from '@/lib/authUtils';
import { queryClient } from "@/lib/queryClient";

export default function Subscription() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isChanging, setIsChanging] = useState(false);

  const handleTierChange = async (newTier: SubscriptionTier) => {
    if (newTier === tier) return;
    
    setIsChanging(true);
    try {
      await apiRequest("POST", "/api/change-tier", { tier: newTier });
      
      // Invalidate auth query to refresh user data
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      
      toast({
        title: "Tier Updated",
        description: `Successfully switched to ${newTier === 'free' ? 'Free' : newTier === 'player_plus' ? 'Player Plus' : 'Commissioner'} tier`,
      });
    } catch (error) {
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
        description: "Failed to update subscription tier",
        variant: "destructive",
      });
    } finally {
      setIsChanging(false);
    }
  };

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
    'Create and manage leagues',
    'Team management & captain assignment',
  ];

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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Choose Your Plan</h1>
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
      
      {/* Demo Notice */}
      <div className="px-6 mb-6">
        <div className="bg-accent/20 border border-accent rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-accent-foreground" />
            <span className="font-semibold text-accent-foreground">Demo Mode</span>
          </div>
          <p className="text-sm text-muted-foreground">
            All subscription tiers are free for testing purposes. Switch between tiers instantly to explore features.
          </p>
        </div>
      </div>
      
      {/* Subscription Plans */}
      <div className="px-6 mb-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-plans-title">Available Plans</h2>
        
        {/* Free Tier */}
        <div className={`bg-card rounded-xl border p-6 mb-4 ${tier === 'free' ? 'border-primary' : 'border-border'}`} data-testid="card-plan-free">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-foreground" data-testid="text-plan-free-title">Free</h3>
              <p className="text-muted-foreground" data-testid="text-plan-free-description">
                Basic features for individual players
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">FREE</span>
            </div>
          </div>
          
          <ul className="space-y-2 mb-6">
            <li className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-success" />
              <span>Join teams and leagues</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-success" />
              <span>View team roster</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-success" />
              <span>Basic game calendar</span>
            </li>
          </ul>
          
          <button
            onClick={() => handleTierChange('free')}
            disabled={tier === 'free' || isChanging}
            className={`w-full rounded-lg py-3 font-semibold transition-colors ${
              tier === 'free' 
                ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
            data-testid="button-select-free"
          >
            {tier === 'free' ? 'Current Plan' : isChanging ? 'Switching...' : 'Select Free'}
          </button>
        </div>

        {/* Player Plus Tier */}
        <div className={`bg-card rounded-xl border p-6 mb-4 ${tier === 'player_plus' ? 'border-primary' : 'border-border'}`} data-testid="card-plan-player-plus">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-primary" data-testid="text-plan-player-plus-title">Player Plus</h3>
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <p className="text-muted-foreground" data-testid="text-plan-player-plus-description">
                Enhanced features for active players
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-primary">FREE</span>
            </div>
          </div>
          
          <ul className="space-y-2 mb-6">
            {playerPlusFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-success" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          
          <button
            onClick={() => handleTierChange('player_plus')}
            disabled={tier === 'player_plus' || isChanging}
            className={`w-full rounded-lg py-3 font-semibold transition-colors ${
              tier === 'player_plus' 
                ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
            data-testid="button-select-player-plus"
          >
            {tier === 'player_plus' ? 'Current Plan' : isChanging ? 'Switching...' : 'Select Player Plus'}
          </button>
        </div>

        {/* Commissioner Tier */}
        <div className={`bg-card rounded-xl border p-6 ${tier === 'commissioner' ? 'border-warning' : 'border-border'}`} data-testid="card-plan-commissioner">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-warning" data-testid="text-plan-commissioner-title">Commissioner</h3>
                <Crown className="w-5 h-5 text-warning" />
              </div>
              <p className="text-muted-foreground" data-testid="text-plan-commissioner-description">
                Complete league management tools
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-warning">FREE</span>
            </div>
          </div>
          
          <ul className="space-y-2 mb-6">
            {commissionerFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-success" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          
          <button
            onClick={() => handleTierChange('commissioner')}
            disabled={tier === 'commissioner' || isChanging}
            className={`w-full rounded-lg py-3 font-semibold transition-colors ${
              tier === 'commissioner' 
                ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                : 'bg-warning text-black hover:bg-warning/90'
            }`}
            data-testid="button-select-commissioner"
          >
            {tier === 'commissioner' ? 'Current Plan' : isChanging ? 'Switching...' : 'Select Commissioner'}
          </button>
        </div>
      </div>
    </div>
  );
}