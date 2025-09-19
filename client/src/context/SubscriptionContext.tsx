import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

export type SubscriptionTier = 'free' | 'player_plus' | 'commissioner';

interface SubscriptionContextType {
  tier: SubscriptionTier;
  hasAccess: (requiredTier: SubscriptionTier) => boolean;
  isLoading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

const tierHierarchy: Record<SubscriptionTier, number> = {
  free: 0,
  player_plus: 1,
  commissioner: 2,
};

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  
  const tier: SubscriptionTier = (user && typeof user === 'object' && 'subscriptionTier' in user && typeof user.subscriptionTier === 'string') ? user.subscriptionTier as SubscriptionTier : 'free';
  
  const hasAccess = (requiredTier: SubscriptionTier): boolean => {
    // Allow bypassing subscription gate for testing/development
    const bypass = import.meta.env.VITE_DISABLE_SUBSCRIPTION_GATE === 'true' || import.meta.env.MODE === 'development';
    return bypass ? true : tierHierarchy[tier] >= tierHierarchy[requiredTier];
  };

  return (
    <SubscriptionContext.Provider value={{ tier, hasAccess, isLoading }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
