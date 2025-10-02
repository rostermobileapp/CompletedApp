import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ObjectUploader } from '@/components/ObjectUploader';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Settings, Bell, Moon, Shield, LogOut, Camera, Edit, Save, X, Users, Plus, Calendar, Crown, DollarSign } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { FeatureLockOverlay } from '@/components/FeatureLockOverlay';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  dateOfBirth: z.string().min(1, 'Date of birth is required').optional(),
  phoneNumber: z.string().optional(),
  city: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

const paymentMethodsSchema = z.object({
  venmoUsername: z.string().optional(),
  cashappUsername: z.string().optional(),
});

type PaymentMethodsForm = z.infer<typeof paymentMethodsSchema>;

export default function Profile() {
  const { user } = useAuth();
  const { role, hasRole, canManageLeague, canAccessPremiumFeatures } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingPaymentMethods, setIsEditingPaymentMethods] = useState(false);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: (user as any)?.firstName || '',
      lastName: (user as any)?.lastName || '',
      dateOfBirth: (user as any)?.dateOfBirth || '',
      phoneNumber: (user as any)?.phoneNumber || '',
      city: (user as any)?.city || '',
    },
  });

  const paymentMethodsForm = useForm<PaymentMethodsForm>({
    resolver: zodResolver(paymentMethodsSchema),
    defaultValues: {
      venmoUsername: (user as any)?.venmoUsername || '',
      cashappUsername: (user as any)?.cashappUsername || '',
    },
  });

  const leagueFeatures = [
    {
      icon: Calendar,
      label: 'Schedule Scrimmage',
      locked: !canAccessPremiumFeatures(),
      requiredTier: 'PRO',
      action: () => {
        setPageTransitionDirection('up');
        navigate('/create-scrimmage');
      },
    },
    {
      icon: Settings,
      label: 'Manage Scrimmages',
      locked: !canAccessPremiumFeatures(),
      requiredTier: 'PRO',
      action: () => {
        setPageTransitionDirection('up');
        navigate('/scrimmage-management');
      },
    },
    {
      icon: Plus,
      label: 'Create League',
      locked: !canManageLeague(),
      requiredTier: 'COMMISSIONER',
      action: () => {
        setPageTransitionDirection('up');
        navigate('/create-league');
      },
    },
    {
      icon: Crown,
      label: 'League Management',
      locked: !hasRole('secondary_commissioner'),
      requiredTier: 'COMMISSIONER',
      action: () => {
        setPageTransitionDirection('up');
        navigate('/league-list');
      },
    },
  ];

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const response = await apiRequest('PATCH', '/api/auth/user/profile', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Profile updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
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

  const handleGetUploadParameters = async () => {
    const response = await apiRequest('POST', '/api/profile-images/upload');
    const { uploadURL } = await response.json();
    return {
      method: 'PUT' as const,
      url: uploadURL,
    };
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadURL = result.successful[0].uploadURL;
      updateImageMutation.mutate(uploadURL);
    }
  };

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
    <div className="min-h-screen flex flex-col pb-24" data-testid="profile-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/');
            }}
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
        <div className="bg-card rounded-xl border border-border p-6 flex items-center gap-4 text-left pl-[2px] pr-[2px] pt-[2px] pb-[2px]" data-testid="card-profile-info">
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center">
              {(user as any)?.profileImageUrl ? (
                <img 
                  src={(user as any).profileImageUrl}
                  alt="Profile" 
                  className="w-full h-full rounded-full object-cover"
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
                buttonClassName="w-8 h-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full flex items-center justify-center border-2 border-background"
              >
                <Camera className="w-4 h-4" />
              </ObjectUploader>
            </div>
          </div>
          
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-1" data-testid="text-user-name">
              {(user as any)?.firstName && (user as any)?.lastName 
                ? `${(user as any).lastName}, ${(user as any).firstName}`
                : (user as any)?.firstName || 'User'
              }
            </h2>
            <p className="text-xs text-muted-foreground/70 mb-2" data-testid="text-user-id">
              ID: {(user as any)?.id}
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
          {/* Upgrade button removed as everyone is commissioner now */}
        </div>
      </div>
      {/* Profile Details */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-6">
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
          
          {/* Email Display */}
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span data-testid="text-profile-email">{(user as any)?.email || 'No email provided'}</span>
            </div>
          </div>
          
          {isEditing ? (
            <form onSubmit={form.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name</label>
                  <input
                    {...form.register('firstName')}
                    className="w-full p-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name</label>
                  <input
                    {...form.register('lastName')}
                    className="w-full p-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <input
                  {...form.register('dateOfBirth')}
                  type="date"
                  className="w-full p-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-date-of-birth"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number</label>
                <input
                  {...form.register('phoneNumber')}
                  type="tel"
                  className="w-full p-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="(555) 123-4567"
                  data-testid="input-phone"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  {...form.register('city')}
                  className="w-full p-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your city of residence"
                  data-testid="input-city"
                />
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
                <span className="text-muted-foreground">Date of Birth:</span>
                <span>{(user as any)?.dateOfBirth || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span>{(user as any)?.phoneNumber || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">City:</span>
                <span>{(user as any)?.city || 'Not specified'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Payment Methods */}
      <div className="px-6 mb-6">
        <FeatureLockOverlay isLocked={!canAccessPremiumFeatures()}>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
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
                  className="w-full p-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="@username"
                  data-testid="input-venmo-username"
                />
                <p className="text-xs text-muted-foreground mt-1">Enter your Venmo username (with or without @)</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">CashApp Username</label>
                <input
                  {...paymentMethodsForm.register('cashappUsername')}
                  className="w-full p-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                <span data-testid="text-venmo-username">{(user as any)?.venmoUsername || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CashApp:</span>
                <span data-testid="text-cashapp-username">{(user as any)?.cashappUsername || 'Not set'}</span>
              </div>
            </div>
          )}
        </div>
        </FeatureLockOverlay>
      </div>
      {/* League Features */}
      <div className="px-6 mb-6">
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
      {/* League Management */}
      {userLeagues && Array.isArray(userLeagues) && userLeagues.length > 0 && (
        <div className="px-6 mb-6">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-leagues-title">Your Leagues</h2>
          <div className="space-y-3">
            {userLeagues.map((league: any) => (
              <div key={league.id} className="bg-card rounded-lg border border-border p-4" data-testid={`card-league-${league.id}`}>
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
      {/* Settings */}
      <div className="px-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-settings-title">Settings</h2>
        <div className="space-y-2">
          {settingsItems.map((item, index) => (
            item.requiredTier !== undefined ? (
              <FeatureButton 
                key={index}
                feature={item} 
                testId={`button-setting-${index}`}
              />
            ) : (
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
            )
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