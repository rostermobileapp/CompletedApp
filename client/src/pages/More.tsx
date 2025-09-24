import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Users, BarChart3, UserPlus, Crown, Settings, Bell, Moon, Shield, LogOut, Plus, Calendar, CheckCircle } from 'lucide-react';
import { usePermissions } from '@/context/SubscriptionContext';
import { apiRequest } from '@/lib/queryClient';

export default function More() {
  const [, navigate] = useLocation();
  const { 
    canManageUsers, 
    canManageLeague, 
    canAccessPremiumFeatures, 
    hasRole,
    role 
  } = usePermissions();

// All features have been moved to the Profile section

// FeatureButton component removed - features moved to Profile section

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="more-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">More</h1>
      </div>
      
      {/* Content moved to Profile section */}
      <div className="px-6 space-y-6">
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <p className="text-muted-foreground mb-4">All features have been moved to your Profile page for easier access.</p>
          <button
            onClick={() => {
              setPageTransitionDirection('up');
              navigate('/profile');
            }}
            className="bg-primary text-primary-foreground rounded-lg px-6 py-2 font-semibold"
            data-testid="button-go-to-profile"
          >
            Go to Profile
          </button>
        </div>
      </div>
    </div>
  );
}
