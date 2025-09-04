import { type ReactNode } from 'react';
import { useSubscription, type SubscriptionTier } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { Lock, Crown, Zap } from 'lucide-react';

interface SubscriptionGateProps {
  requiredTier: SubscriptionTier;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgrade?: boolean;
}

const tierIcons = {
  player_plus: Zap,
  commissioner: Crown,
};

const tierLabels = {
  player_plus: 'Player Plus',
  commissioner: 'Commissioner',
};

const tierColors = {
  player_plus: 'primary',
  commissioner: 'warning',
};

export function SubscriptionGate({ 
  requiredTier, 
  children, 
  fallback,
  showUpgrade = true 
}: SubscriptionGateProps) {
  const { hasAccess } = useSubscription();
  const [, navigate] = useLocation();

  if (hasAccess(requiredTier)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgrade) {
    return null;
  }

  const Icon = tierIcons[requiredTier as keyof typeof tierIcons] || Lock;
  const label = tierLabels[requiredTier as keyof typeof tierLabels] || 'Premium';
  const colorClass = tierColors[requiredTier as keyof typeof tierColors] || 'primary';

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-xl p-4" data-testid="subscription-gate">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 bg-${colorClass} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h3 className={`font-semibold text-${colorClass}`}>Upgrade to {label}</h3>
          <p className="text-sm text-muted-foreground">
            {requiredTier === 'player_plus' 
              ? 'Unlock messaging, stats, and more features'
              : 'Get full league management capabilities'
            }
          </p>
        </div>
      </div>
      <button 
        onClick={() => navigate('/subscription')}
        className={`w-full bg-${colorClass} text-primary-foreground rounded-lg py-3 font-semibold`}
        data-testid="button-upgrade"
      >
        {requiredTier === 'player_plus' ? 'Upgrade for $5/month' : 'Contact Sales'}
      </button>
    </div>
  );
}
