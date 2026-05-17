import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNativelyNotifications } from '@/hooks/useNativelyNotifications';
import { usePermissions } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ObjectUploader } from '@/components/ObjectUploader';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { NotificationPreferencesModal } from '@/components/NotificationPreferencesModal';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Settings, Bell, Moon, Shield, LogOut, Camera, Edit, Save, X, Users, Plus, Calendar, Crown, DollarSign, Lock } from 'lucide-react';
import { setSubscriberAttributes } from '@/lib/nativePurchases';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { FeatureLockOverlay } from '@/components/FeatureLockOverlay';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HPIBBanner } from '@/components/HPIBBanner';

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)' },
  { value: 'America/Toronto', label: 'Eastern Time - Toronto' },
  { value: 'America/Vancouver', label: 'Pacific Time - Vancouver' },
  { value: 'America/Edmonton', label: 'Mountain Time - Edmonton' },
  { value: 'America/Winnipeg', label: 'Central Time - Winnipeg' },
  { value: 'America/Halifax', label: 'Atlantic Time (AT)' },
  { value: 'America/St_Johns', label: 'Newfoundland Time (NT)' },
  { value: 'Europe/London', label: 'GMT/BST - London' },
  { value: 'Europe/Paris', label: 'CET - Paris' },
  { value: 'Europe/Berlin', label: 'CET - Berlin' },
  { value: 'Australia/Sydney', label: 'AEST - Sydney' },
  { value: 'Australia/Melbourne', label: 'AEST - Melbourne' },
  { value: 'Asia/Tokyo', label: 'JST - Tokyo' },
];

const profileSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  playerType: z.enum(['Skater', 'Goalie']).optional(),
  shoots: z.enum(['left', 'right']).optional(),
  timezone: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

const paymentMethodsSchema = z.object({
  venmoUsername: z.string().optional(),
  cashappUsername: z.string().optional(),
});

type PaymentMethodsForm = z.infer<typeof paymentMethodsSchema>;

export default function Profile() {
  const { user: supabaseUser } = useAuth();
  const { removeExternalId } = useNativelyNotifications();
  const { role, hasRole, canManageLeague, canAccessPremiumFeatures } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingPaymentMethods, setIsEditingPaymentMethods] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTeamForLeagueRequest, setSelectedTeamForLeagueRequest] = useState<string | null>(null);
  const [showLeagueRequestDialog, setShowLeagueRequestDialog] = useState(false);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>('');
  const [teamJoinLeagueMessage, setTeamJoinLeagueMessage] = useState('');
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false);
  const isDesktopWeb = useIsDesktopWeb();

  // Referral section local state
  const [referralPickerId, setReferralPickerId] = useState('');
  const [referralOtherText, setReferralOtherText] = useState('');

  // Fetch full user profile from database (includes displayId)
  const { data: user } = useQuery({
    queryKey: ['/api/user'],
    enabled: !!supabaseUser,
  });

  // Fetch approved referral partners for the dropdown
  const { data: approvedPartners = [] } = useQuery<{ id: string; orgName: string; referralCode?: string }[]>({
    queryKey: ['/api/referral/approved-partners'],
    enabled: !!supabaseUser,
  });

  const saveReferralMutation = useMutation({
    mutationFn: async (payload: { referralPartnerId?: string; referralSourceOther?: string; clearReferral?: boolean }) => {
      const response = await apiRequest('PATCH', '/api/user/onboarding', payload);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to save referral');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      // Push to RevenueCat subscriber attributes + localStorage for purchase-time pickup
      const attrs: Record<string, string> = {};
      if (data.referralPartnerId) attrs['referral_partner_id'] = data.referralPartnerId;
      if (data.referralCode) attrs['referral_code'] = data.referralCode;
      if (Object.keys(attrs).length > 0) {
        setSubscriberAttributes(attrs);
        try {
          if (attrs['referral_partner_id']) localStorage.setItem('pendingReferralPartnerId', attrs['referral_partner_id']);
          if (attrs['referral_code']) localStorage.setItem('pendingReferralCode', attrs['referral_code']);
        } catch {}
      } else {
        // clearReferral or "other" path — remove any stale pending attribution
        try {
          localStorage.removeItem('pendingReferralPartnerId');
          localStorage.removeItem('pendingReferralCode');
        } catch {}
      }
      toast({ title: 'Referral saved' });
    },
    onError: (err: any) => {
      toast({ title: err.message || 'Failed to save referral', variant: 'destructive' });
    },
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      email: (user as any)?.email || '',
      firstName: (user as any)?.firstName || '',
      lastName: (user as any)?.lastName || '',
      dateOfBirth: (user as any)?.dateOfBirth || '',
      city: (user as any)?.city || '',
      zipCode: (user as any)?.zipCode || '',
      playerType: (user as any)?.playerType || undefined,
      shoots: (user as any)?.shoots || undefined,
      timezone: (user as any)?.timezone || 'America/New_York',
    },
  });

  const paymentMethodsForm = useForm<PaymentMethodsForm>({
    resolver: zodResolver(paymentMethodsSchema),
    defaultValues: {
      venmoUsername: (user as any)?.venmoUsername || '',
      cashappUsername: (user as any)?.cashappUsername || '',
    },
  });


  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const response = await apiRequest('PATCH', '/api/auth/user/profile', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Profile updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setIsEditing(false);
    },
    onError: () => {
      toast({ 
        title: 'Failed to update profile',
        variant: 'destructive' 
      });
    },
  });

  const updateImageMutation = useMutation({
    mutationFn: async (profileImageUrl: string) => {
      const response = await apiRequest('PATCH', '/api/auth/user/image', { profileImageUrl });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Profile photo updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
    onError: () => {
      toast({ 
        title: 'Failed to update profile photo', 
        variant: 'destructive' 
      });
    },
  });

  const updatePaymentMethodsMutation = useMutation({
    mutationFn: async (data: PaymentMethodsForm) => {
      const response = await apiRequest('PATCH', '/api/users/payment-methods', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment methods updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      setIsEditingPaymentMethods(false);
    },
    onError: () => {
      toast({ 
        title: 'Failed to update payment methods', 
        variant: 'destructive' 
      });
    },
  });

  // Fetch user leagues
  const { data: userLeagues } = useQuery({
    queryKey: ['/api/user/leagues'],
  });

  // Fetch user teams
  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  // Leave league mutation
  const leaveLeagueMutation = useMutation({
    mutationFn: async (leagueId: string) => {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/leave`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: 'Successfully left league',
        description: data.message 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leagues'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/league-memberships'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to leave league', 
        description: error.message || 'Please try again.',
        variant: 'destructive' 
      });
    },
  });

  // Leave team mutation
  const leaveTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await apiRequest('POST', `/api/teams/${teamId}/leave`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: 'Successfully left team',
        description: data.message 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leagues'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to leave team', 
        description: error.message || 'Please try again.',
        variant: 'destructive' 
      });
    },
  });

  // Delete team mutation (for team captains)
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await apiRequest('DELETE', `/api/teams/${teamId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: 'Team deleted',
        description: data.message || 'Team has been permanently deleted'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leagues'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete team', 
        description: error.message || 'Please try again.',
        variant: 'destructive' 
      });
    },
  });

  // Query for available leagues
  const { data: availableLeagues } = useQuery<any[]>({
    queryKey: ['/api/leagues'],
    enabled: showLeagueRequestDialog,
  });

  // Query for aggregated user stats
  const { data: userStats } = useQuery<{
    goals: number;
    assists: number;
    points: number;
    gamesPlayed: number;
    penaltyMinutes: number;
  }>({
    queryKey: ['/api/user/stats/aggregate'],
  });

  // Request team to join league mutation
  const requestTeamJoinLeagueMutation = useMutation({
    mutationFn: async ({ teamId, leagueId, message }: { teamId: string; leagueId: string; message?: string }) => {
      // Trim and validate message
      const trimmedMessage = message?.trim();
      if (trimmedMessage && trimmedMessage.length > 500) {
        throw new Error('Message cannot exceed 500 characters');
      }
      const response = await apiRequest('POST', `/api/teams/${teamId}/join-league`, { 
        leagueId, 
        message: trimmedMessage || undefined 
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: 'Request Submitted',
        description: 'Your team\'s request to join the league has been sent to the commissioner for approval.' 
      });
      setShowLeagueRequestDialog(false);
      setSelectedTeamForLeagueRequest(null);
      setSelectedLeagueId('');
      setTeamJoinLeagueMessage('');
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Request Failed', 
        description: error.message || 'Please try again.',
        variant: 'destructive' 
      });
    },
  });

  // Delete profile mutation
  const deleteProfileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/auth/user');
      return response.json();
    },
    onSuccess: async () => {
      toast({ 
        title: 'Profile deleted',
        description: 'Your account has been permanently deleted' 
      });
      
      // Remove OneSignal external ID
      try {
        await removeExternalId();
      } catch (e) {
        // continue
      }
      
      // Sign out from Supabase
      try {
        await supabase.auth.signOut();
      } catch (e) {
        // continue
      }
      
      // Clear all cached data
      queryClient.clear();
      
      // Redirect to login page
      window.location.href = '/login';
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete profile', 
        description: error.message || 'Please try again.',
        variant: 'destructive' 
      });
    },
  });

  const handleGetUploadParameters = async () => {
    const response = await apiRequest('POST', '/api/profile-images/upload');
    const { uploadURL, path } = await response.json();
    return {
      method: 'PUT' as const,
      url: uploadURL,
      path, // Return normalized path for backend proxy
    };
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      // Use the normalized path for backend proxy serving
      const imageUrl = result.successful[0].path;
      updateImageMutation.mutate(imageUrl);
    }
  };

  const settingsItems = [
    {
      icon: Bell,
      label: 'Notifications',
      action: () => setShowNotificationPreferences(true),
    },
    {
      icon: Shield,
      label: 'Privacy',
      action: () => {
        setPageTransitionDirection('up');
        navigate('/privacy');
      },
    },
    {
      icon: Crown,
      label: 'Manage Subscription',
      locked: false,
      requiredTier: null,
      action: () => {
        setPageTransitionDirection('up');
        navigate('/subscription');
      },
      highlight: role === 'free_tier',
    },
  ];


  const getTierDisplay = () => {
    switch (role) {
      case 'free_tier': return { label: 'FREE', class: 'bg-muted text-muted-foreground' };
      case 'player_pro': return { label: 'PLAYER PRO', class: 'bg-primary text-primary-foreground' };
      case 'secondary_commissioner':
      case 'commissioner': return { label: 'COMMISSIONER', class: 'bg-warning text-black' };
      default: return { label: 'FREE', class: 'bg-muted text-muted-foreground' };
    }
  };

  const tierDisplay = getTierDisplay();

  return (
    <div className="min-h-screen flex flex-col" data-testid="profile-page">
      {/* Fixed Header Section - Profile Info and Banner */}
      <div className="sticky top-0 z-10 bg-background">
        {/* Profile Info */}
        <div className="px-6 pt-[24px] pb-[8px]">
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 flex items-center gap-4 text-left pl-[2px] pr-[2px] pt-[2px] pb-[2px]" data-testid="card-profile-info">
            <div className="relative flex-shrink-0">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center ${(user as any)?.profileImageUrl ? 'bg-transparent' : 'bg-primary'}`}>
                {(user as any)?.profileImageUrl ? (
                  <img 
                    src={getImageUrl((user as any).profileImageUrl) || ''}
                    alt="Profile" 
                    className="w-full h-full rounded-full object-cover bg-transparent"
                    data-testid="img-profile-avatar"
                  />
                ) : (
                  <span className="text-primary-foreground text-2xl font-bold" data-testid="text-profile-initials">
                    {(user as any)?.firstName ? (user as any).firstName[0] : 'U'}
                  </span>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={15728640} // 15MB
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handleUploadComplete}
                  cropShape="round"
                  cropDialogTitle="Position your profile photo"
                  buttonClassName="w-8 h-8 bg-primary hover:bg-primary text-primary-foreground rounded-full flex items-center justify-center border-2 border-background"
                >
                  <Camera className="w-4 h-4" />
                </ObjectUploader>
              </div>
            </div>
            
            <div className="flex-1 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold mb-1" data-testid="text-user-name">
                  {(user as any)?.firstName && (user as any)?.lastName 
                    ? `${(user as any).lastName}, ${(user as any).firstName}`
                    : (user as any)?.firstName || 'User'
                  }
                </h2>
                <p className="text-xs text-muted-foreground/70 mb-2 font-mono font-bold" data-testid="text-user-id">
                  User ID: {user ? ((user as any)?.displayId || 'Not assigned') : 'Loading...'}
                </p>
                <div className="flex items-center gap-2">
                  <span 
                    className={`tier-badge text-xs px-3 py-1 rounded-full font-semibold ${tierDisplay.class}`}
                    data-testid="badge-user-tier"
                  >
                    {tierDisplay.label}
                  </span>
                  
                  {/* Career Stats */}
                  {userStats && (
                    <span className="text-xs px-3 py-1 rounded-full font-semibold text-[#212121] dark:text-[#ffffff] bg-[#e2e2e2] dark:bg-[#212121]" data-testid="stat-career">
                      <span data-testid="stat-goals">{userStats.goals} G</span>
                      <span className="mx-1">•</span>
                      <span data-testid="stat-assists">{userStats.assists} A</span>
                      <span className="mx-1">•</span>
                      <span data-testid="stat-points">{userStats.points} P</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Upgrade button removed as everyone is commissioner now */}
          </div>
        </div>
        {/* HPIB Banner for paid users - below profile info */}
        <div className="px-6 pb-2">
          <HPIBBanner placement="profile-header" />
        </div>
      </div>
      
      {/* Scrollable Content Section */}
      <div className={`flex-1 overflow-y-auto ${role === 'free_tier' ? 'pb-52' : 'pb-24'}`}>
        {/* Profile Details */}
        <div className="px-6 mb-6 pt-2">
        <div className="rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 pt-[4px] pb-[4px] bg-[#e2e2e2] dark:bg-[#212121]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" data-testid="text-profile-details-title">Profile Details</h2>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-2 text-sm text-primary"
              data-testid="button-toggle-edit"
            >
              {isEditing ? <X className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
          </div>
          
          {isEditing ? (
            <form onSubmit={form.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name</label>
                  <input
                    {...form.register('firstName')}
                    className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name</label>
                  <input
                    {...form.register('lastName')}
                    className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  {...form.register('email')}
                  type="email"
                  className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="your@email.com"
                  data-testid="input-email"
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <input
                  {...form.register('dateOfBirth')}
                  type="date"
                  className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-date-of-birth"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  {...form.register('city')}
                  className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your city of residence"
                  data-testid="input-city"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Zip Code</label>
                <input
                  {...form.register('zipCode')}
                  className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. 80203 or T2P"
                  data-testid="input-zip-code"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Player Type</label>
                <Controller
                  name="playerType"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full" data-testid="select-player-type">
                        <SelectValue placeholder="Select player type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Skater" data-testid="option-skater">Skater</SelectItem>
                        <SelectItem value="Goalie" data-testid="option-goalie">Goalie</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Handedness</label>
                <Controller
                  name="shoots"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full" data-testid="select-shoots">
                        <SelectValue placeholder="Select handedness" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left" data-testid="option-left">Left</SelectItem>
                        <SelectItem value="right" data-testid="option-right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Timezone</label>
                <Controller
                  name="timezone"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full" data-testid="select-timezone">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground mt-1">Used for displaying game times and schedules</p>
              </div>
              
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="w-full bg-primary text-primary-foreground rounded-lg py-2 flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="button-save-profile"
              >
                <Save className="w-4 h-4" />
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span data-testid="text-profile-name">{`${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span data-testid="text-profile-email">{(user as any)?.email || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date of Birth:</span>
                <span>{(user as any)?.dateOfBirth || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">City:</span>
                <span>{(user as any)?.city || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zip Code:</span>
                <span>{(user as any)?.zipCode || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Player Type:</span>
                <span data-testid="text-player-type">{(user as any)?.playerType || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Handedness:</span>
                <span data-testid="text-shoots">
                  {(user as any)?.shoots ? ((user as any).shoots === 'left' ? 'Left' : 'Right') : 'Not specified'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timezone:</span>
                <span data-testid="text-timezone">
                  {TIMEZONE_OPTIONS.find(tz => tz.value === (user as any)?.timezone)?.label || 
                   (user as any)?.timezone || 
                   'Eastern Time (ET)'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Payment Methods */}
      <div className="px-6 mb-6">
        <div className="overflow-hidden rounded-xl">
          <FeatureLockOverlay isLocked={!canAccessPremiumFeatures()}>
            <div className="rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 pt-[4px] pb-[4px] bg-[#e2e2e2] dark:bg-[#212121]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold" data-testid="text-payment-methods-title">Payment Methods</h2>
            </div>
            <button
              onClick={() => setIsEditingPaymentMethods(!isEditingPaymentMethods)}
              className="flex items-center gap-2 text-sm text-primary"
              data-testid="button-toggle-edit-payment-methods"
            >
              {isEditingPaymentMethods ? <X className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
              {isEditingPaymentMethods ? 'Cancel' : 'Edit'}
            </button>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Add your payment handles to make it easier for others to send you money for games and events.
          </p>
          
          {isEditingPaymentMethods ? (
            <form onSubmit={paymentMethodsForm.handleSubmit((data) => updatePaymentMethodsMutation.mutate(data))} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Venmo Username</label>
                <input
                  {...paymentMethodsForm.register('venmoUsername')}
                  className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="@username"
                  data-testid="input-venmo-username"
                />
                <p className="text-xs text-muted-foreground mt-1">Enter your Venmo username (with or without @)</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">CashApp Username</label>
                <input
                  {...paymentMethodsForm.register('cashappUsername')}
                  className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="$username"
                  data-testid="input-cashapp-username"
                />
                <p className="text-xs text-muted-foreground mt-1">Enter your CashApp username (with or without $)</p>
              </div>
              
              <button
                type="submit"
                disabled={updatePaymentMethodsMutation.isPending}
                className="w-full bg-primary text-primary-foreground rounded-lg py-2 flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="button-save-payment-methods"
              >
                <Save className="w-4 h-4" />
                {updatePaymentMethodsMutation.isPending ? 'Saving...' : 'Save Payment Methods'}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Venmo:</span>
                {(user as any)?.venmoUsername ? (
                  <a
                    href={`https://venmo.com/${(user as any).venmoUsername.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                    data-testid="link-venmo-username"
                  >
                    {(user as any).venmoUsername}
                  </a>
                ) : (
                  <span data-testid="text-venmo-username">Not set</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CashApp:</span>
                {(user as any)?.cashappUsername ? (
                  <a
                    href={`https://cash.app/$${(user as any).cashappUsername.replace(/^\$/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                    data-testid="link-cashapp-username"
                  >
                    {(user as any).cashappUsername}
                  </a>
                ) : (
                  <span data-testid="text-cashapp-username">Not set</span>
                )}
              </div>
            </div>
          )}
        </div>
          </FeatureLockOverlay>
        </div>
      </div>
      {/* Referral Partner */}
      {(() => {
        const currentPartnerId = (user as any)?.referralPartnerId as string | null | undefined;
        const currentOther = (user as any)?.referralSourceOther as string | null | undefined;
        const lockedPartner = currentPartnerId
          ? approvedPartners.find((p) => p.id === currentPartnerId) ?? null
          : null;
        // Only lock if the partner ID is set AND the partner still exists (not deleted by admin)
        const isLocked = !!currentPartnerId && !!lockedPartner;

        const handleSave = () => {
          if (referralPickerId === 'other') {
            saveReferralMutation.mutate({ referralSourceOther: referralOtherText.trim() || 'other' });
          } else if (referralPickerId === 'none' || referralPickerId === '') {
            saveReferralMutation.mutate({ clearReferral: true });
          } else {
            saveReferralMutation.mutate({ referralPartnerId: referralPickerId });
          }
        };

        return (
          <div className="px-6 mb-6">
            <div className="rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 pt-[4px] pb-[4px] bg-[#e2e2e2] dark:bg-[#212121]">
              <div className="flex items-center justify-between mb-4 pt-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold" data-testid="text-referral-title">Who referred you?</h2>
                  {isLocked && <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {isLocked ? (
                <div className="space-y-2 pb-4" data-testid="referral-locked-state">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Partner:</span>
                    <span className="font-medium" data-testid="text-referral-partner-name">
                      {lockedPartner ? lockedPartner.orgName : currentPartnerId}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your referral partner is locked and cannot be changed.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pb-4" data-testid="referral-editable-state">
                  {currentOther && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Current:</span>
                      <span>{currentOther}</span>
                    </div>
                  )}
                  <Select
                    value={referralPickerId}
                    onValueChange={(val) => {
                      setReferralPickerId(val);
                      if (val === 'other') {
                        // Prepopulate with existing value so user doesn't have to retype
                        setReferralOtherText(currentOther || '');
                      } else {
                        setReferralOtherText('');
                      }
                    }}
                  >
                    <SelectTrigger className="w-full" data-testid="select-referral-partner">
                      <SelectValue placeholder="Select who referred you" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedPartners.map((p) => (
                        <SelectItem key={p.id} value={p.id} data-testid={`option-partner-${p.id}`}>
                          {p.orgName}
                        </SelectItem>
                      ))}
                      <SelectItem value="other">Other</SelectItem>
                      <SelectItem value="none">None / Not sure</SelectItem>
                    </SelectContent>
                  </Select>

                  {referralPickerId === 'other' && (
                    <input
                      value={referralOtherText}
                      onChange={(e) => setReferralOtherText(e.target.value)}
                      placeholder="How did you hear about us?"
                      className="w-full p-2 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                      data-testid="input-referral-other"
                    />
                  )}

                  <button
                    onClick={handleSave}
                    disabled={saveReferralMutation.isPending || referralPickerId === ''}
                    className="w-full bg-primary text-primary-foreground rounded-lg py-2 flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                    data-testid="button-save-referral"
                  >
                    <Save className="w-4 h-4" />
                    {saveReferralMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* League Management */}
      {userLeagues && Array.isArray(userLeagues) && userLeagues.length > 0 && (
        <div className="px-6 mb-6">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-leagues-title">Your Leagues</h2>
          <div className="space-y-3">
            {userLeagues.map((league: any) => (
              <div key={league.id} className="rounded-lg border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-4 pt-[4px] pb-[4px] bg-[#e2e2e2] dark:bg-[#212121]" data-testid={`card-league-${league.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium" data-testid={`text-league-name-${league.id}`}>{league.name}</p>
                      <p className="text-sm text-muted-foreground" data-testid={`text-league-sport-${league.id}`}>{league.sport}</p>
                    </div>
                  </div>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="px-3 py-1 text-sm text-destructive border border-destructive rounded-md hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                        disabled={leaveLeagueMutation.isPending}
                        data-testid={`button-leave-league-${league.id}`}
                      >
                        {leaveLeagueMutation.isPending ? 'Leaving...' : 'Leave'}
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent data-testid={`dialog-leave-league-${league.id}`}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Leave League</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to leave "{league.name}"? This will:
                          <br />• Remove you from your team
                          <br />• Clear your game history and RSVPs
                          <br />• Disconnect your profile from the league roster
                          <br /><br />This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid={`button-cancel-leave-${league.id}`}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => leaveLeagueMutation.mutate(league.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid={`button-confirm-leave-${league.id}`}
                        >
                          Leave League
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Team Management */}
      {userTeams && Array.isArray(userTeams) && userTeams.length > 0 && (
        <div className="px-6 mb-6">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-teams-title">Your Teams</h2>
          <div className="space-y-3">
            {userTeams.map((team: any) => {
              const isStandalone = !team.leagueId;
              const isTeamCreator = team.creatorId === (user as any)?.id;
              const isCaptain = team.captainId === (user as any)?.id;
              const showJoinLeagueButton = isStandalone && isTeamCreator;
              const showDeleteButton = isCaptain; // Captains can delete teams they manage
              
              return (
                <div key={team.id} className="rounded-lg border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-4 pt-[4px] pb-[4px] bg-[#e2e2e2] dark:bg-[#212121]" data-testid={`card-team-${team.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium" data-testid={`text-team-name-${team.id}`}>{team.name}</p>
                        {isStandalone ? (
                          <p className="text-xs text-muted-foreground">
                            Standalone Team {team.uniqueTeamId && `• ID: ${team.uniqueTeamId}`}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Part of a league</p>
                        )}
                      </div>
                    </div>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="px-3 py-1 text-sm text-destructive border border-destructive rounded-md hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                          disabled={showDeleteButton ? deleteTeamMutation.isPending : leaveTeamMutation.isPending}
                          data-testid={showDeleteButton ? `button-delete-team-${team.id}` : `button-leave-team-${team.id}`}
                        >
                          {showDeleteButton 
                            ? (deleteTeamMutation.isPending ? 'Deleting...' : 'Delete') 
                            : (leaveTeamMutation.isPending ? 'Leaving...' : 'Leave')
                          }
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent data-testid={showDeleteButton ? `dialog-delete-team-${team.id}` : `dialog-leave-team-${team.id}`}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{showDeleteButton ? 'Delete Team' : 'Leave Team'}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {showDeleteButton ? (
                              <>
                                Are you sure you want to delete "{team.name}"? This will:
                                <br />• Remove all team members
                                <br />• Delete all team games and schedules
                                <br />• Remove all team conversations and messages
                                <br />• Delete all team-related data
                                <br /><br />This action cannot be undone and will affect all team members.
                              </>
                            ) : (
                              <>
                                Are you sure you want to leave "{team.name}"? This will:
                                <br />• Remove you from the team roster
                                <br />• Clear your game RSVPs for this team
                                <br />• Remove your beverage duty assignments
                                <br /><br />This action cannot be undone.
                              </>
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid={showDeleteButton ? `button-cancel-delete-team-${team.id}` : `button-cancel-leave-team-${team.id}`}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => showDeleteButton ? deleteTeamMutation.mutate(team.id) : leaveTeamMutation.mutate(team.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid={showDeleteButton ? `button-confirm-delete-team-${team.id}` : `button-confirm-leave-team-${team.id}`}
                          >
                            {showDeleteButton ? 'Delete Team' : 'Leave Team'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {showJoinLeagueButton && (
                    <button
                      onClick={() => {
                        setSelectedTeamForLeagueRequest(team.id);
                        setShowLeagueRequestDialog(true);
                      }}
                      className="w-full mt-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary"
                      data-testid={`button-request-join-league-${team.id}`}
                    >
                      Request to Join League
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Settings */}
      <div className="px-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-settings-title">Settings</h2>
        <div className="space-y-2">
          {/* Theme Toggle — hidden on desktop web; desktop is light-only */}
          {!isDesktopWeb && (
            <div className="w-full border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] rounded-lg p-4 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121] pt-[16px] pb-[16px]">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-muted-foreground" />
                <span>Light Mode</span>
              </div>
              <ThemeToggle />
            </div>
          )}
          
          {settingsItems.map((item, index) => (
            <button
              key={index}
              onClick={item.action}
              className="w-full border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] rounded-lg p-4 flex items-center justify-between hover:bg-card/80 bg-[#e2e2e2] dark:bg-[#212121]"
              data-testid={`button-setting-${index}`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${item.highlight ? 'text-warning' : 'text-muted-foreground'}`} />
                <span>{item.label}</span>
              </div>
              <div className="w-4 h-4 text-muted-foreground">→</div>
            </button>
          ))}
          
          {/* Delete Profile */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <button
                className="w-full border border-destructive rounded-lg p-4 flex items-center justify-between text-destructive hover:bg-destructive/10 bg-[#e2e2e2] dark:bg-[#212121] font-bold"
                data-testid="button-delete-profile"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5" />
                  <span>Delete Profile</span>
                </div>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="dialog-delete-profile">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete your profile? This will:
                  <br />• Remove all your personal information
                  <br />• Delete all your league and team memberships
                  <br />• Erase your game history, stats, and RSVPs
                  <br />• Remove all your messages and announcements
                  <br /><br />This action cannot be undone and you will be signed out immediately.
                  {(user as any)?.stripeSubscriptionId && (user as any)?.role !== 'free_tier' && (
                    <>
                      <br /><br />
                      <strong className="text-destructive">⚠ You have an active subscription. To delete your account, you must first cancel your subscription from the Manage Subscription screen.</strong>
                    </>
                  )}
                  {userLeagues && Array.isArray(userLeagues) && userLeagues.some((l: any) => l.commissionerId === (user as any)?.id) && (
                    <>
                      <br /><br />
                      <strong className="text-destructive">Note: You are a commissioner of one or more leagues. Please transfer your commissioner status to another user before deleting your profile.</strong>
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                {(user as any)?.stripeSubscriptionId && (user as any)?.role !== 'free_tier' && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      navigate('/subscription');
                    }}
                    className="w-full rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20"
                  >
                    Go to Manage Subscription
                  </button>
                )}
                <div className="flex w-full gap-2">
                  <AlertDialogCancel className="flex-1" data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteProfileMutation.mutate()}
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={
                      deleteProfileMutation.isPending || 
                      ((user as any)?.stripeSubscriptionId && (user as any)?.role !== 'free_tier') ||
                      (userLeagues && Array.isArray(userLeagues) && userLeagues.some((l: any) => l.commissionerId === (user as any)?.id))
                    }
                    data-testid="button-confirm-delete"
                  >
                    {deleteProfileMutation.isPending ? 'Deleting...' : 'Delete Profile'}
                  </AlertDialogAction>
                </div>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Log Out */}
          <button
            onClick={async () => {
              // Clear stored OneSignal IDs from backend first (while still authenticated)
              // This prevents push notifications from being sent to this device after logout
              try {
                await apiRequest('POST', '/api/notification-preferences/clear-device');
              } catch (e) {
                // continue
              }
              // Unlink device from OneSignal on the client side
              try {
                await removeExternalId();
              } catch (e) {
                // continue
              }
              try {
                // Sign out user
                await supabase.auth.signOut();
              } catch (e) {
                // continue
              }
              // Clear all cached data to prevent stale user data from showing
              queryClient.clear();
              // Force a full page reload to the login page to clear all state
              window.location.href = '/login';
            }}
            className="w-full border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] rounded-lg p-4 flex items-center justify-between text-destructive hover:bg-card/80 bg-[#e2e2e2] dark:bg-[#212121] font-bold"
            data-testid="button-log-out"
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5" />
              <span>Log Out</span>
            </div>
          </button>
        </div>
      </div>
      </div>
      {/* League Request Dialog */}
      <AlertDialog open={showLeagueRequestDialog} onOpenChange={setShowLeagueRequestDialog}>
        <AlertDialogContent data-testid="dialog-request-join-league">
          <AlertDialogHeader>
            <AlertDialogTitle>Request to Join League</AlertDialogTitle>
            <AlertDialogDescription>
              Select a league for your team to join. Your request will be sent to the league commissioner for approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select League</label>
              <Select value={selectedLeagueId} onValueChange={setSelectedLeagueId}>
                <SelectTrigger data-testid="select-league">
                  <SelectValue placeholder="Choose a league" />
                </SelectTrigger>
                <SelectContent>
                  {availableLeagues && availableLeagues.length > 0 ? (
                    availableLeagues.map((league: any) => (
                      <SelectItem key={league.id} value={league.id} data-testid={`option-league-${league.id}`}>
                        {league.name} - {league.sport}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No leagues available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Message (Optional)</label>
              <textarea
                value={teamJoinLeagueMessage}
                onChange={(e) => setTeamJoinLeagueMessage(e.target.value)}
                placeholder="e.g., Our team is looking for a competitive league to join this season..."
                className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px]"
                maxLength={500}
                data-testid="textarea-team-join-message"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {teamJoinLeagueMessage.length}/500 characters
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setShowLeagueRequestDialog(false);
                setSelectedTeamForLeagueRequest(null);
                setSelectedLeagueId('');
                setTeamJoinLeagueMessage('');
              }}
              data-testid="button-cancel-league-request"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedTeamForLeagueRequest && selectedLeagueId) {
                  requestTeamJoinLeagueMutation.mutate({
                    teamId: selectedTeamForLeagueRequest,
                    leagueId: selectedLeagueId,
                    message: teamJoinLeagueMessage.trim() || undefined,
                  });
                }
              }}
              disabled={!selectedLeagueId || requestTeamJoinLeagueMutation.isPending}
              data-testid="button-confirm-league-request"
            >
              {requestTeamJoinLeagueMutation.isPending ? 'Sending...' : 'Send Request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <NotificationPreferencesModal
        open={showNotificationPreferences}
        onOpenChange={setShowNotificationPreferences}
      />
    </div>
  );
}