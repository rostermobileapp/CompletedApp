import { useLocation } from 'wouter';
import { Users, BarChart3, UserPlus, Trophy, Crown, Settings, Bell, Moon, Shield, LogOut, Plus } from 'lucide-react';
import { useSubscription } from '@/context/SubscriptionContext';

export default function More() {
  const [, navigate] = useLocation();
  const { hasAccess, tier } = useSubscription();

  const teamFeatures = [
    {
      icon: Users,
      label: 'Team Roster',
      locked: false,
      requiredTier: null,
      action: () => navigate('/roster'),
    },
    {
      icon: BarChart3,
      label: 'Team Stats',
      locked: !hasAccess('player_plus'),
      requiredTier: 'PLUS',
      action: () => {/* TODO: Navigate to stats */},
    },
    {
      icon: UserPlus,
      label: 'Find Subs',
      locked: !hasAccess('player_plus'),
      requiredTier: 'PLUS',
      action: () => {/* TODO: Navigate to subs */},
    },
  ];

  const leagueFeatures = [
    {
      icon: Plus,
      label: 'Create League',
      locked: !hasAccess('commissioner'),
      requiredTier: 'COMMISSIONER',
      action: () => navigate('/create-league'),
    },
    {
      icon: Trophy,
      label: 'Standings',
      locked: !hasAccess('player_plus'),
      requiredTier: 'PLUS',
      action: () => {/* TODO: Navigate to standings */},
    },
    {
      icon: Crown,
      label: 'League Management',
      locked: !hasAccess('commissioner'),
      requiredTier: 'COMMISSIONER',
      action: () => navigate('/league-management'),
    },
  ];

  const accountFeatures = [
    {
      icon: Crown,
      label: 'Upgrade Subscription',
      locked: false,
      requiredTier: null,
      action: () => navigate('/subscription'),
      highlight: tier === 'free',
    },
    {
      icon: Settings,
      label: 'Settings',
      locked: false,
      requiredTier: null,
      action: () => {/* TODO: Navigate to settings */},
    },
    {
      icon: Bell,
      label: 'Notifications',
      locked: false,
      requiredTier: null,
      action: () => {/* TODO: Navigate to notifications */},
    },
    {
      icon: Shield,
      label: 'Privacy',
      locked: false,
      requiredTier: null,
      action: () => {/* TODO: Navigate to privacy */},
    },
  ];

  const FeatureButton = ({ feature, testId }: { feature: any, testId: string }) => (
    <button
      onClick={feature.locked ? undefined : feature.action}
      className={`w-full bg-card border border-border rounded-lg p-4 flex items-center justify-between transition-opacity ${
        feature.locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-card/80'
      } ${feature.highlight ? 'border-warning' : ''}`}
      disabled={feature.locked}
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <feature.icon className={`w-5 h-5 ${feature.locked ? 'text-muted-foreground' : feature.highlight ? 'text-warning' : 'text-muted-foreground'}`} />
        <span className={feature.locked ? 'text-muted-foreground' : ''}>{feature.label}</span>
        {feature.requiredTier && (
          <span className={`tier-badge text-xs px-2 py-1 rounded-full font-semibold ml-2 ${
            feature.requiredTier === 'COMMISSIONER' ? 'bg-warning text-black' : 'bg-primary text-primary-foreground'
          }`}>
            {feature.requiredTier}
          </span>
        )}
      </div>
      {feature.locked ? (
        <div className="w-4 h-4 text-muted-foreground">
          🔒
        </div>
      ) : (
        <div className="w-4 h-4 text-muted-foreground">
          →
        </div>
      )}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="more-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">More</h1>
      </div>
      
      {/* Feature Sections */}
      <div className="px-6 space-y-6">
        {/* Team Features */}
        <div data-testid="section-team-features">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-team-features-title">Team Features</h2>
          <div className="space-y-2">
            {teamFeatures.map((feature, index) => (
              <FeatureButton 
                key={index} 
                feature={feature} 
                testId={`button-team-feature-${index}`}
              />
            ))}
          </div>
        </div>
        
        {/* League Features */}
        <div data-testid="section-league-features">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-league-features-title">League Features</h2>
          <div className="space-y-2">
            {leagueFeatures.map((feature, index) => (
              <FeatureButton 
                key={index} 
                feature={feature} 
                testId={`button-league-feature-${index}`}
              />
            ))}
          </div>
        </div>
        
        {/* Account */}
        <div data-testid="section-account">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-account-title">Account</h2>
          <div className="space-y-2">
            {accountFeatures.map((feature, index) => (
              <FeatureButton 
                key={index} 
                feature={feature} 
                testId={`button-account-feature-${index}`}
              />
            ))}
            
            {/* Sign Out */}
            <button
              onClick={() => window.location.href = '/api/logout'}
              className="w-full bg-card border border-border rounded-lg p-4 flex items-center justify-between text-destructive hover:bg-card/80"
              data-testid="button-sign-out"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
