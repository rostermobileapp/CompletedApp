import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Search, 
  Check,
  CheckCircle,
  Calendar,
  MessageCircle,
  BarChart3,
  Bell,
  Users,
  Crown,
  Sparkles
} from 'lucide-react';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  email: z.string().email('Invalid email'),
  phoneNumber: z.string().optional(),
  playerType: z.enum(['Skater', 'Goalie'], { required_error: 'Please select your position' }),
});

type ProfileForm = z.infer<typeof profileSchema>;

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
  isReplay?: boolean;
}

interface Facility {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string;
}

export function OnboardingFlow({ onComplete, onSkip, isReplay = false }: OnboardingFlowProps) {
  const [currentScreen, setCurrentScreen] = useState(isReplay ? 1 : 0);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro' | null>(null);
  const [isLoadingProgress, setIsLoadingProgress] = useState(!isReplay);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const totalScreens = 8;
  const startScreen = isReplay ? 1 : 0;

  // Fetch user data for replay and resume
  const { data: userData } = useQuery<any>({
    queryKey: ['/api/user'],
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      playerType: undefined,
    },
  });

  // Load saved progress and pre-populate form data
  useEffect(() => {
    if (!userData) return;

    // Pre-populate form data from user profile
    form.reset({
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      email: userData.email || '',
      phoneNumber: userData.phoneNumber || '',
      playerType: userData.playerType || undefined,
    });

    // Load saved onboarding progress for resume functionality
    if (!isReplay && userData.onboardingProgress) {
      const progress = userData.onboardingProgress;
      if (progress.currentScreen && typeof progress.currentScreen === 'number') {
        setCurrentScreen(progress.currentScreen);
      }
      if (progress.selectedFacility) {
        setSelectedFacility(progress.selectedFacility);
      }
      if (progress.selectedPlan) {
        setSelectedPlan(progress.selectedPlan);
      }
    }

    // Fetch facility details if saved
    if (userData.selectedFacilityId) {
      fetchFacilityById(userData.selectedFacilityId);
    }

    setIsLoadingProgress(false);
  }, [userData, isReplay, form]);

  const fetchFacilityById = async (facilityId: string) => {
    try {
      const response = await fetch(`/api/facilities/${facilityId}`, {
        headers: {
          'Authorization': `Bearer ${(await import('@/lib/supabase').then(m => m.supabase.auth.getSession())).data.session?.access_token}`,
        },
      });
      if (response.ok) {
        const facility = await response.json();
        setSelectedFacility(facility);
      }
    } catch (error) {
      console.error('Error fetching facility:', error);
    }
  };

  // Search facilities
  const { data: facilities = [], isLoading: isSearching } = useQuery<Facility[]>({
    queryKey: ['/api/facilities', facilitySearchQuery],
    enabled: facilitySearchQuery.length >= 2 && currentScreen === 2,
  });

  const saveProgressMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', '/api/user/onboarding', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', '/api/user/onboarding', {
        ...data,
        onboardingCompleted: true,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: isReplay ? 'Profile updated!' : 'Welcome to Roster!',
        description: isReplay ? 'Your information has been updated.' : 'You\'re all set to start using the app.',
      });
      onComplete();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to complete onboarding. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleNext = async () => {
    const formData = form.getValues();

    // Save progress based on current screen
    if (currentScreen === 1) {
      // Profile setup screen
      const result = form.trigger();
      if (!await result) {
        return;
      }

      await saveProgressMutation.mutateAsync({
        ...formData,
        onboardingProgress: { currentScreen: currentScreen + 1 },
      });
    } else if (currentScreen === 2 && selectedFacility) {
      // Facility selection screen
      await saveProgressMutation.mutateAsync({
        selectedFacilityId: selectedFacility.id,
        onboardingProgress: { currentScreen: currentScreen + 1, selectedFacility },
      });
    } else if (currentScreen === 4 && selectedPlan === 'pro') {
      // Player Pro upgrade screen
      await saveProgressMutation.mutateAsync({
        role: 'player_pro',
        onboardingProgress: { currentScreen: currentScreen + 1, selectedPlan },
      });
    } else {
      // Save progress for all other screens
      await saveProgressMutation.mutateAsync({
        onboardingProgress: { currentScreen: currentScreen + 1, selectedFacility, selectedPlan },
      });
    }

    setCurrentScreen(currentScreen + 1);
  };

  const handleBack = () => {
    setCurrentScreen(Math.max(startScreen, currentScreen - 1));
  };

  const handleSkipOnboarding = () => {
    saveProgressMutation.mutateAsync({
      onboardingCompleted: true,
      onboardingProgress: { skipped: true },
    });
    onSkip();
  };

  const handleComplete = async () => {
    const formData = form.getValues();
    await completeOnboardingMutation.mutateAsync({
      ...formData,
      selectedFacilityId: selectedFacility?.id || null,
      role: selectedPlan === 'pro' ? 'player_pro' : 'free_tier',
    });
  };

  const progressPercentage = ((currentScreen - startScreen + 1) / (totalScreens - startScreen)) * 100;

  // Show loading state while fetching saved progress
  if (isLoadingProgress) {
    return (
      <div className="fixed inset-0 bg-black dark:bg-black bg-opacity-95 dark:bg-opacity-95 z-[60] flex items-center justify-center">
        <div className="text-white dark:text-white text-xl">Loading...</div>
      </div>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 0: // Welcome Screen
        return (
          <div className="flex flex-col items-center justify-center min-h-[500px] text-center px-4" data-testid="screen-welcome">
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-4 text-white dark:text-white">
                Welcome to Roster
              </h1>
              <p className="text-xl text-gray-300 dark:text-gray-300 max-w-md">
                Your all-in-one hockey league management platform
              </p>
            </div>
            <Button
              onClick={handleNext}
              size="lg"
              className="mt-4"
              data-testid="button-get-started"
            >
              Get Started
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              onClick={handleSkipOnboarding}
              variant="ghost"
              className="mt-4 text-gray-400 dark:text-gray-400"
              data-testid="button-skip"
            >
              Skip for now
            </Button>
          </div>
        );

      case 1: // Profile Setup
        return (
          <div className="max-w-md mx-auto" data-testid="screen-profile-setup">
            <h2 className="text-3xl font-bold mb-2 text-white dark:text-white">Set Up Your Profile</h2>
            <p className="text-gray-400 dark:text-gray-400 mb-6">Tell us a bit about yourself</p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="firstName" className="text-white dark:text-white">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  data-testid="input-firstName"
                  {...form.register('firstName')}
                  className="bg-gray-800 dark:bg-gray-800 text-white dark:text-white border-gray-700 dark:border-gray-700"
                />
                {form.formState.errors.firstName && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.firstName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="lastName" className="text-white dark:text-white">Last Name</Label>
                <Input
                  id="lastName"
                  data-testid="input-lastName"
                  {...form.register('lastName')}
                  className="bg-gray-800 dark:bg-gray-800 text-white dark:text-white border-gray-700 dark:border-gray-700"
                />
              </div>

              <div>
                <Label htmlFor="email" className="text-white dark:text-white">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="input-email"
                  {...form.register('email')}
                  className="bg-gray-800 dark:bg-gray-800 text-white dark:text-white border-gray-700 dark:border-gray-700"
                />
                {form.formState.errors.email && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="phoneNumber" className="text-white dark:text-white">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  data-testid="input-phoneNumber"
                  {...form.register('phoneNumber')}
                  className="bg-gray-800 dark:bg-gray-800 text-white dark:text-white border-gray-700 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-white dark:text-white mb-3 block">
                  Position <span className="text-red-500">*</span>
                </Label>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant={form.watch('playerType') === 'Skater' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => form.setValue('playerType', 'Skater')}
                    data-testid="button-position-skater"
                  >
                    Skater
                  </Button>
                  <Button
                    type="button"
                    variant={form.watch('playerType') === 'Goalie' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => form.setValue('playerType', 'Goalie')}
                    data-testid="button-position-goalie"
                  >
                    Goalie
                  </Button>
                </div>
                {form.formState.errors.playerType && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.playerType.message}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 2: // Find Facility
        return (
          <div className="max-w-2xl mx-auto" data-testid="screen-find-facility">
            <h2 className="text-3xl font-bold mb-2 text-white dark:text-white">Find Your Facility or League</h2>
            <p className="text-gray-400 dark:text-gray-400 mb-6">
              Search by facility name, zip code, city, or state
            </p>

            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search facilities..."
                  value={facilitySearchQuery}
                  onChange={(e) => setFacilitySearchQuery(e.target.value)}
                  className="pl-10 bg-gray-800 dark:bg-gray-800 text-white dark:text-white border-gray-700 dark:border-gray-700"
                  data-testid="input-facility-search"
                />
              </div>
            </div>

            {selectedFacility && (
              <Card className="mb-4 bg-green-900/20 border-green-700" data-testid="card-selected-facility">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white dark:text-white">{selectedFacility.name}</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      {selectedFacility.city}, {selectedFacility.state}
                    </p>
                  </div>
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </CardContent>
              </Card>
            )}

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {isSearching && (
                <p className="text-center text-gray-400 dark:text-gray-400 py-4">Searching...</p>
              )}
              {facilities.length > 0 ? (
                facilities.map((facility) => (
                  <Card
                    key={facility.id}
                    className="cursor-pointer hover:bg-gray-800 dark:hover:bg-gray-800 transition-colors bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700"
                    onClick={() => setSelectedFacility(facility)}
                    data-testid={`card-facility-${facility.id}`}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white dark:text-white">{facility.name}</p>
                        <p className="text-sm text-gray-400 dark:text-gray-400">
                          {facility.city}, {facility.state}
                        </p>
                      </div>
                      <Button size="sm" data-testid={`button-join-${facility.id}`}>
                        Join
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : facilitySearchQuery.length >= 2 && !isSearching ? (
                <p className="text-center text-gray-400 dark:text-gray-400 py-4">No facilities found</p>
              ) : null}
            </div>

            <Button
              variant="ghost"
              className="mt-4 text-gray-400 dark:text-gray-400"
              onClick={handleNext}
              data-testid="button-join-later"
            >
              I'll join later
            </Button>
          </div>
        );

      case 3: // Player Features
        return (
          <div className="max-w-2xl mx-auto" data-testid="screen-player-features">
            <h2 className="text-3xl font-bold mb-2 text-center text-white dark:text-white">
              Free Player Features
            </h2>
            <p className="text-gray-400 dark:text-gray-400 mb-8 text-center">
              Everything you need to manage your hockey games
            </p>

            <div className="grid gap-4">
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">RSVP to games</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Let your team know if you're attending
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <Calendar className="h-6 w-6 text-blue-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">View your schedule</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      See all your upcoming games in one place
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <Users className="h-6 w-6 text-purple-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">Claim game duties</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Volunteer as referee, scorekeeper, and more
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <Bell className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">Get notifications</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Stay updated on game changes and announcements
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <Users className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">Basic team roster access</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      View your teammates and contact information
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 4: // Upgrade to Player Pro
        return (
          <div className="max-w-2xl mx-auto" data-testid="screen-upgrade-pro">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-full mb-4">
                <Sparkles className="h-5 w-5" />
                <span className="font-semibold">14-Day Free Trial</span>
              </div>
              <h2 className="text-3xl font-bold mb-2 text-white dark:text-white">
                Upgrade to Player Pro
              </h2>
              <p className="text-gray-400 dark:text-gray-400">
                Unlock premium features to enhance your experience
              </p>
            </div>

            <div className="grid gap-4 mb-8">
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <MessageCircle className="h-6 w-6 text-blue-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">
                      Send and receive team & league messages
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Stay connected with your team
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <BarChart3 className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">
                      View detailed league stats and standings
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Track your performance and rankings
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <Check className="h-6 w-6 text-purple-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">Advanced scheduling features</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Manage scrimmages and custom events
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <CheckCircle className="h-6 w-6 text-emerald-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">Payments and Invoicing</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Send and track payment requests for league fees
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-start gap-4">
                  <Users className="h-6 w-6 text-orange-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-white dark:text-white">Manage team and line combinations</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400">
                      Organize your roster and create custom line pairings
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            
          </div>
        );

      case 5: // Commissioner Tier
        return (
          <div className="max-w-2xl mx-auto" data-testid="screen-commissioner-preview">
            <div className="text-center mb-6">
              <Crown className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
              <h2 className="text-3xl font-bold mb-2 text-white dark:text-white">
                For League Administrators
              </h2>
              <p className="text-gray-400 dark:text-gray-400">
                The Commissioner tier is reserved for league administrators
              </p>
            </div>

            <div className="grid gap-3 mb-6">
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-3 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-1" />
                  <p className="text-sm text-white dark:text-white">Set up entire leagues from scratch</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-3 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-1" />
                  <p className="text-sm text-white dark:text-white">Manage multiple teams and divisions</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-3 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-1" />
                  <p className="text-sm text-white dark:text-white">
                    Advanced scheduling and tournament management
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-3 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-1" />
                  <p className="text-sm text-white dark:text-white">Financial oversight and reporting</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-3 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-1" />
                  <p className="text-sm text-white dark:text-white">Bulk communications and announcements</p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 6: // Success/Complete
        return (
          <div className="max-w-2xl mx-auto text-center" data-testid="screen-success">
            <CheckCircle className="h-20 w-20 mx-auto mb-6 text-green-500" />
            <h2 className="text-3xl font-bold mb-4 text-white dark:text-white">
              {isReplay ? 'Profile Updated!' : 'You\'re All Set!'}
            </h2>

            <div className="mb-8 space-y-3">
              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <p className="text-white dark:text-white">Profile created ✓</p>
                </CardContent>
              </Card>

              {selectedFacility && (
                <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <p className="text-white dark:text-white">
                      Facility joined: {selectedFacility.name} ✓
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <p className="text-white dark:text-white">
                    Plan: {selectedPlan === 'pro' ? 'Player Pro (Trial)' : 'Free'} ✓
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="mb-8">
              <img 
                src="https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMjk1cThia2ZtZzEwYnN5ZGF4dmJoeXB0dGNyOXVvdzlrM29na2FuZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/E1e2nyfdaD0g4Rg2aD/giphy.gif"
                alt="Celebration"
                className="mx-auto rounded-lg max-w-xs"
              />
            </div>

            <Button
              size="lg"
              onClick={handleComplete}
              disabled={completeOnboardingMutation.isPending}
              data-testid="button-goto-dashboard"
            >
              {completeOnboardingMutation.isPending ? 'Saving...' : (isReplay ? 'Save Changes' : 'Go to Dashboard')}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black dark:bg-black bg-opacity-95 dark:bg-opacity-95 z-[60] overflow-y-auto">
      <div className="min-h-screen p-4 py-8">
        {/* Header */}
        <div className="max-w-4xl mx-auto mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {currentScreen > startScreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  data-testid="button-back"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
              )}
              <div className="text-sm text-gray-400 dark:text-gray-400">
                Step {currentScreen - startScreen + 1} of {totalScreens - startScreen}
              </div>
            </div>
            {!isReplay && currentScreen < 6 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipOnboarding}
                data-testid="button-close"
              >
                <X className="h-6 w-6" />
              </Button>
            )}
          </div>

          {/* Progress Bar */}
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto">
          {renderScreen()}
        </div>

        {/* Navigation Buttons */}
        {currentScreen !== startScreen && currentScreen !== 6 && (
          <div className="max-w-4xl mx-auto mt-8 flex justify-end">
            <Button
              onClick={handleNext}
              disabled={saveProgressMutation.isPending}
              data-testid="button-continue"
            >
              {saveProgressMutation.isPending ? 'Saving...' : 'Continue'}
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
