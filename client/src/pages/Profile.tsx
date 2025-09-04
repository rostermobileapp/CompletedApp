import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { ArrowLeft, Settings, Bell, Moon, Shield, LogOut } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [, navigate] = useLocation();

  const settingsItems = [
    {
      icon: Bell,
      label: 'Notifications',
      action: () => {/* TODO: Navigate to notifications */},
    },
    {
      icon: Settings,
      label: 'General Settings',
      action: () => {/* TODO: Navigate to settings */},
    },
    {
      icon: Shield,
      label: 'Privacy',
      action: () => {/* TODO: Navigate to privacy */},
    },
  ];

  const getTierDisplay = () => {
    switch (tier) {
      case 'commissioner': return { label: 'COMMISSIONER', class: 'bg-warning text-black' };
      case 'player_plus': return { label: 'PLAYER PLUS', class: 'bg-primary text-primary-foreground' };
      default: return { label: 'FREE TIER', class: 'bg-secondary text-secondary-foreground' };
    }
  };

  const tierDisplay = getTierDisplay();

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="profile-page">
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Profile</h1>
        </div>
      </div>
      
      {/* Profile Info */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-6 text-center" data-testid="card-profile-info">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            {user && typeof user === 'object' && 'profileImageUrl' in user && user.profileImageUrl ? (
              <img 
                src={user && typeof user === 'object' && 'profileImageUrl' in user ? user.profileImageUrl : ''} 
                alt="Profile" 
                className="w-full h-full rounded-full object-cover"
                data-testid="img-profile-avatar"
              />
            ) : (
              <span className="text-primary-foreground text-2xl font-bold" data-testid="text-profile-initials">
                {user && typeof user === 'object' && 'firstName' in user && user.firstName ? user.firstName[0] : 'U'}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold mb-1" data-testid="text-user-name">
            {user && typeof user === 'object' && 'firstName' in user && 'lastName' in user && user.firstName && user.lastName 
              ? `${user.firstName} ${user.lastName}`
              : user && typeof user === 'object' && 'firstName' in user && user.firstName || 'User'
            }
          </h2>
          <p className="text-muted-foreground mb-3" data-testid="text-user-email">
            {user && typeof user === 'object' && 'email' in user && user.email || 'No email provided'}
          </p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span 
              className={`tier-badge text-xs px-3 py-1 rounded-full font-semibold ${tierDisplay.class}`}
              data-testid="badge-user-tier"
            >
              {tierDisplay.label}
            </span>
          </div>
          {tier === 'free' && (
            <button 
              onClick={() => navigate('/subscription')}
              className="bg-primary text-primary-foreground rounded-lg px-6 py-2 font-semibold"
              data-testid="button-upgrade-account"
            >
              Upgrade Account
            </button>
          )}
        </div>
      </div>
      
      {/* User Stats (Placeholder) */}
      <div className="px-6 mb-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-stats-title">Your Stats</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card rounded-lg border border-border p-4 text-center" data-testid="card-stat-games">
            <p className="text-2xl font-bold" data-testid="text-stat-games-value">12</p>
            <p className="text-sm text-muted-foreground">Games Played</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4 text-center" data-testid="card-stat-goals">
            <p className="text-2xl font-bold" data-testid="text-stat-goals-value">8</p>
            <p className="text-sm text-muted-foreground">Goals</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4 text-center" data-testid="card-stat-assists">
            <p className="text-2xl font-bold" data-testid="text-stat-assists-value">12</p>
            <p className="text-sm text-muted-foreground">Assists</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4 text-center" data-testid="card-stat-points">
            <p className="text-2xl font-bold" data-testid="text-stat-points-value">20</p>
            <p className="text-sm text-muted-foreground">Total Points</p>
          </div>
        </div>
      </div>
      
      {/* Settings */}
      <div className="px-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-settings-title">Settings</h2>
        <div className="space-y-2">
          {settingsItems.map((item, index) => (
            <button
              key={index}
              onClick={item.action}
              className="w-full bg-card border border-border rounded-lg p-4 flex items-center justify-between hover:bg-card/80"
              data-testid={`button-setting-${index}`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <span>{item.label}</span>
              </div>
              <div className="w-4 h-4 text-muted-foreground">→</div>
            </button>
          ))}
          
          {/* Dark Mode Toggle */}
          <div className="w-full bg-card border border-border rounded-lg p-4 flex items-center justify-between" data-testid="card-dark-mode">
            <div className="flex items-center gap-3">
              <Moon className="w-5 h-5 text-muted-foreground" />
              <span>Dark Mode</span>
            </div>
            <div className="w-12 h-6 bg-primary rounded-full flex items-center justify-end px-1" data-testid="toggle-dark-mode">
              <div className="w-4 h-4 bg-primary-foreground rounded-full"></div>
            </div>
          </div>
          
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
  );
}
