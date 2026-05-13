import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Crown, MapPin, Calendar, Globe, Monitor, Snowflake } from 'lucide-react';
import { RinkPickerField } from '@/components/RinkPickerField';
import type { RinkSelection } from '@/components/RinkPickerField';
import { useLocation } from 'wouter';
import { FixedBottomButton } from '@/components/FixedBottomButton';
import { insertLeagueSchema } from '@shared/schema';
import type { z } from 'zod';
import { usePermissions } from '@/context/SubscriptionContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { DESKTOP_REQUIRED_COPY } from '@/components/DesktopRequiredDialog';

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

const createLeagueSchema = insertLeagueSchema.extend({
  uniqueLeagueId: insertLeagueSchema.shape.uniqueLeagueId.optional(),
  description: insertLeagueSchema.shape.description.optional(),
  location: insertLeagueSchema.shape.location.optional(),
  rinkName: insertLeagueSchema.shape.rinkName.optional(),
  rinkAddress: insertLeagueSchema.shape.rinkAddress.optional(),
  season: insertLeagueSchema.shape.season.optional(),
  sport: insertLeagueSchema.shape.sport.optional(),
}).partial().extend({
  name: insertLeagueSchema.shape.name,
  maxTeams: insertLeagueSchema.shape.maxTeams,
});

type CreateLeagueForm = z.infer<typeof createLeagueSchema>;

export default function CreateLeague() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManageLeague } = usePermissions();
  const isMobile = useIsMobile();
  const isDesktopWeb = useIsDesktopWeb();
  const [createdLeague, setCreatedLeague] = useState<{ id: string; name: string } | null>(null);
  const [selectedRink, setSelectedRink] = useState<RinkSelection | null>(null);

  const form = useForm<CreateLeagueForm>({
    resolver: zodResolver(createLeagueSchema),
    defaultValues: {
      name: '',
      sport: 'hockey',
      description: '',
      location: '',
      rinkName: '',
      rinkAddress: '',
      season: '',
      maxTeams: 16,
      timezone: 'America/New_York',
    },
  });

  const createLeagueMutation = useMutation({
    mutationFn: async (data: CreateLeagueForm) => {
      const response = await apiRequest('POST', '/api/leagues', data);
      return response.json();
    },
    onSuccess: (league) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues/commissioner'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leagues'] });
      if (isDesktopWeb) {
        setCreatedLeague({ id: league.id, name: league.name });
      } else {
        toast({
          title: 'League Created',
          description: `${league.name} has been created successfully!`,
        });
        navigate(`/league-management?leagueId=${league.id}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create League',
        description: error.message || 'An error occurred while creating the league',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreateLeagueForm) => {
    createLeagueMutation.mutate({
      ...data,
      rinkName: selectedRink?.name || data.rinkName || undefined,
      rinkAddress: selectedRink?.address || data.rinkAddress || undefined,
      facilityId: selectedRink?.facilityId || undefined,
    });
  };

  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col" data-testid="create-league-mobile-blocked">
        <div className="p-6 pt-[12px] pb-[12px]">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => {
                setPageTransitionDirection('down');
                navigate('/league-list');
              }}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Create League</h1>
          </div>
        </div>
        <div className="px-6 flex-1 flex items-center justify-center">
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-8 text-center max-w-md w-full">
            <div className="flex justify-center mb-4">
              <Monitor className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Desktop Required</h2>
            <p className="text-muted-foreground mb-6">
              {DESKTOP_REQUIRED_COPY.league}
            </p>
            <button
              onClick={() => {
                setPageTransitionDirection('down');
                navigate('/league-list');
              }}
              className="bg-primary text-primary-foreground rounded-lg px-6 py-2 font-medium"
              data-testid="button-back-to-leagues"
            >
              Back to My Leagues
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (createdLeague) {
    return (
      <div className="min-h-screen flex flex-col pb-12" data-testid="create-league-success">
        <div className="p-6 pt-[12px] pb-[12px]">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate(`/league-management?leagueId=${createdLeague.id}`)}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold">League Created</h1>
          </div>
        </div>
        <div className="px-6 space-y-4 max-w-xl">
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Crown className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="font-semibold">{createdLeague.name}</div>
                <div className="text-sm text-muted-foreground">Ready to go</div>
              </div>
            </div>
          </div>

          <div
            className="bg-card rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-5"
            data-testid="player-pro-upsell-card"
          >
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">Cover your players with Player Pro</div>
                <p className="text-sm text-muted-foreground mb-3">
                  As commissioner you can pre-pay Player Pro for your whole league and save
                  25% versus everyone paying individually. Seats auto-assign to members in
                  join order.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() =>
                      navigate(`/league-management?leagueId=${createdLeague.id}&settings=player-pro`)
                    }
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg text-sm font-medium"
                    data-testid="button-buy-player-pro"
                  >
                    Buy Player Pro seats
                  </button>
                  <button
                    onClick={() => navigate(`/league-management?leagueId=${createdLeague.id}`)}
                    className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-medium"
                    data-testid="button-skip-player-pro"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            className="bg-card rounded-xl border border-blue-500/40 bg-blue-500/5 p-5"
            data-testid="draft-tool-cta-card"
          >
            <div className="flex items-start gap-3">
              <Snowflake className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">Want to draft your rosters live?</div>
                <p className="text-sm text-muted-foreground mb-3">
                  Once you've added at least two teams (and any captains), open the league
                  and tap <span className="font-semibold">Setup Draft</span> next to
                  &quot;New Season&quot; to run a real-time, mobile-friendly draft with
                  timers, buddy pairs, and goalie modes.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() =>
                      navigate(`/league-management?leagueId=${createdLeague.id}&tab=teams`)
                    }
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-lg text-sm font-medium"
                    data-testid="button-add-teams-first"
                  >
                    Add teams now
                  </button>
                  <button
                    onClick={() => navigate(`/league-management?leagueId=${createdLeague.id}`)}
                    className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-medium"
                    data-testid="button-skip-draft-tool"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-48" data-testid="create-league-page">
      <div className="p-6 pt-[12px] pb-[12px]">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/more');
            }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Create League</h1>
          <Crown className="w-6 h-6 text-warning" />
        </div>
        <p className="text-muted-foreground">
          Set up a new league for your sport community
        </p>
      </div>
      <div className="px-6">
        <form id="create-league-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 pt-[4px] pb-[4px]">
            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-league-name">
                  League Name *
                </label>
                <input
                  {...form.register('name')}
                  className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Downtown Hockey League"
                  data-testid="input-league-name"
                />
                {form.formState.errors.name && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-unique-id">
                  League ID (optional)
                </label>
                <input
                  {...form.register('uniqueLeagueId')}
                  className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Leave blank for auto-generated ID"
                  data-testid="input-unique-id"
                />
                <p className="text-muted-foreground text-xs mt-1">
                  Players will use this ID to search and join your league
                </p>
                {form.formState.errors.uniqueLeagueId && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.uniqueLeagueId.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 pt-[4px] pb-[4px] mt-[4px]">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Location & Rink</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-location">
                  General Location
                </label>
                <input
                  {...form.register('location')}
                  className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Downtown Toronto"
                  data-testid="input-location"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-rink-picker">
                  Rink
                </label>
                <RinkPickerField
                  onSelect={(rink) => setSelectedRink(rink)}
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 mt-[4px] pt-[4px] pb-[4px]">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">League Settings</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-season">
                  Season
                </label>
                <input
                  {...form.register('season')}
                  className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Winter 2025"
                  data-testid="input-season"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-max-teams">
                  Maximum Teams
                </label>
                <input
                  {...form.register('maxTeams', { valueAsNumber: true })}
                  type="number"
                  min="4"
                  max="32"
                  className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-max-teams"
                />
                {form.formState.errors.maxTeams && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.maxTeams.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-primary" />
                  <label className="block text-sm font-medium" data-testid="label-timezone">
                    League Timezone
                  </label>
                </div>
                <Controller
                  name="timezone"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value || 'America/New_York'}
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
                <p className="text-muted-foreground text-xs mt-1">
                  All games and schedules will use this timezone by default
                </p>
              </div>
            </div>
          </div>

        </form>
      </div>
      <FixedBottomButton>
        <button
          type="submit"
          form="create-league-form"
          disabled={createLeagueMutation.isPending}
          className="w-full bg-warning text-black rounded-lg py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-create-league"
        >
          {createLeagueMutation.isPending ? 'Creating League...' : 'Create League'}
        </button>
      </FixedBottomButton>
    </div>
  );
}
