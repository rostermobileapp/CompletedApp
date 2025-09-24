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
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">Chirp</h1>
      </div>
      
      
    </div>
  );
}
