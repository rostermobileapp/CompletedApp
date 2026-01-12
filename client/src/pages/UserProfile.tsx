import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, DollarSign, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getImageUrl } from '@/lib/queryClient';

interface UserProfileData {
  id: string;
  displayId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  city?: string | null;
  dateOfBirth?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
  playerType?: string | null;
  venmoUsername?: string | null;
  cashappUsername?: string | null;
  timezone?: string | null;
}

export default function UserProfile() {
  const params = useParams();
  const userId = params.userId;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<UserProfileData>({
    queryKey: ['/api/users', userId],
    enabled: !!userId,
  });

  const getTierDisplay = (role: string) => {
    switch (role) {
      case 'free_tier': return { label: 'FREE', class: 'bg-muted text-muted-foreground' };
      case 'player_pro': return { label: 'PLAYER PRO', class: 'bg-primary text-primary-foreground' };
      case 'secondary_commissioner':
      case 'commissioner': return { label: 'COMMISSIONER', class: 'bg-warning text-black' };
      default: return { label: 'FREE', class: 'bg-muted text-muted-foreground' };
    }
  };

  const formatTimezone = (tz: string | null | undefined): string => {
    if (!tz) return 'Not specified';
    const timezoneLabels: Record<string, string> = {
      'America/New_York': 'Eastern (ET)',
      'America/Chicago': 'Central (CT)',
      'America/Denver': 'Mountain (MT)',
      'America/Los_Angeles': 'Pacific (PT)',
      'America/Anchorage': 'Alaska (AKT)',
      'Pacific/Honolulu': 'Hawaii (HT)',
      'America/Phoenix': 'Arizona (MST)',
    };
    return timezoneLabels[tz] || tz;
  };

  const downloadVCF = () => {
    if (!userId) return;
    
    // Open in new window to trigger download without navigating away from app
    window.open(`/api/users/${userId}/contact.vcf`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">User not found</p>
        </div>
      </div>
    );
  }

  const tierDisplay = getTierDisplay(user.role || 'free_tier');

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="user-profile-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setPageTransitionDirection('down');
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  navigate('/');
                }
              }}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">User Profile</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadVCF}
            className="flex items-center gap-2 text-[16px] bg-[#3a7eec] text-white hover:bg-[#3a7eec]/90"
            data-testid="button-download-vcf"
          >
            <Download className="w-4 h-4" />
            Contact
          </Button>
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-6 flex items-center gap-4 text-left" data-testid="card-profile-info">
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center">
              {user.profileImageUrl ? (
                <img 
                  src={getImageUrl(user.profileImageUrl) || ''}
                  alt="Profile" 
                  className="w-full h-full rounded-full object-cover"
                  data-testid="img-profile-avatar"
                />
              ) : (
                <span className="text-primary-foreground text-2xl font-bold" data-testid="text-profile-initials">
                  {user.firstName ? user.firstName[0] : 'U'}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-1" data-testid="text-user-name">
              {user.firstName && user.lastName 
                ? `${user.lastName}, ${user.firstName}`
                : user.firstName || 'User'
              }
            </h2>
            <p className="text-xs text-muted-foreground/70 mb-2" data-testid="text-user-id">
              ID: {user.displayId || 'Not assigned'}
            </p>
            <div className="flex items-center gap-2">
              <span 
                className={`tier-badge text-xs px-3 py-1 rounded-full font-semibold ${tierDisplay.class}`}
                data-testid="badge-user-tier"
              >
                {tierDisplay.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Details */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" data-testid="text-profile-details-title">Profile Details</h2>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span data-testid="text-profile-name">{`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Not specified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span data-testid="text-profile-email">{user.email || 'Not specified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Birth:</span>
              <span data-testid="text-profile-dob">{user.dateOfBirth || 'Not specified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone:</span>
              <span data-testid="text-profile-phone">{user.phoneNumber || 'Not specified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">City:</span>
              <span data-testid="text-profile-city">{user.city || 'Not specified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Player Type:</span>
              <span data-testid="text-player-type">{user.playerType || 'Not specified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Timezone:</span>
              <span data-testid="text-profile-timezone">{formatTimezone(user.timezone)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold" data-testid="text-payment-methods-title">Payment Methods</h2>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Payment handles for sending money for games and events.
          </p>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Venmo:</span>
              {user.venmoUsername ? (
                <a
                  href={`https://venmo.com/${user.venmoUsername.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  data-testid="link-venmo"
                >
                  {user.venmoUsername.startsWith('@') ? user.venmoUsername : `@${user.venmoUsername}`}
                </a>
              ) : (
                <span className="text-muted-foreground" data-testid="text-venmo-not-set">Not set</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CashApp:</span>
              {user.cashappUsername ? (
                <a
                  href={`https://cash.app/${user.cashappUsername.replace('$', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  data-testid="link-cashapp"
                >
                  {user.cashappUsername.startsWith('$') ? user.cashappUsername : `$${user.cashappUsername}`}
                </a>
              ) : (
                <span className="text-muted-foreground" data-testid="text-cashapp-not-set">Not set</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
