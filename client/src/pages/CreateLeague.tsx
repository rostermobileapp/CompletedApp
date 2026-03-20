import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Crown, MapPin, Calendar, Globe } from 'lucide-react';
import { useLocation } from 'wouter';
import { FixedBottomButton } from '@/components/FixedBottomButton';
import { insertLeagueSchema } from '@shared/schema';
import type { z } from 'zod';
import { usePermissions } from '@/context/SubscriptionContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

// Create a form schema that includes the new fields, making most fields optional
const createLeagueSchema = insertLeagueSchema.extend({
  uniqueLeagueId: insertLeagueSchema.shape.uniqueLeagueId.optional(),
  description: insertLeagueSchema.shape.description.optional(),
  location: insertLeagueSchema.shape.location.optional(),
  rinkName: insertLeagueSchema.shape.rinkName.optional(),
  rinkAddress: insertLeagueSchema.shape.rinkAddress.optional(),
  season: insertLeagueSchema.shape.season.optional(),
  sport: insertLeagueSchema.shape.sport.optional(),
}).partial().extend({
  name: insertLeagueSchema.shape.name, // Keep name as required
  maxTeams: insertLeagueSchema.shape.maxTeams, // Keep maxTeams as required
});

type CreateLeagueForm = z.infer<typeof createLeagueSchema>;

export default function CreateLeague() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManageLeague } = usePermissions();
  
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
      toast({
        title: 'League Created',
        description: `${league.name} has been created successfully!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues'] });
      navigate(`/league-management?leagueId=${league.id}`);
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
    createLeagueMutation.mutate(data);
  };

  // 🚨 SUBSCRIPTION GATE REMOVED - FULL ACCESS FOR EVERYONE! 🚨
  // All users now have commissioner access to create leagues

  return (
    <div className="min-h-screen flex flex-col pb-48" data-testid="create-league-page">
      {/* Header */}
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
      {/* Form */}
      <div className="px-6">
        <form id="create-league-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-card rounded-xl border border-border p-6 pt-[4px] pb-[4px]">
            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-league-name">
                  League Name *
                </label>
                <input
                  {...form.register('name')}
                  className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                  className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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

          {/* Location & Venue */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Location & Venue</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-location">
                  General Location
                </label>
                <input
                  {...form.register('location')}
                  className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Downtown Toronto"
                  data-testid="input-location"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-rink-name">
                  Rink/Venue Name
                </label>
                <input
                  {...form.register('rinkName')}
                  className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Metro Ice Center"
                  data-testid="input-rink-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" data-testid="label-rink-address">
                  Venue Address
                </label>
                <textarea
                  {...form.register('rinkAddress')}
                  className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={2}
                  placeholder="Full address of the venue"
                  data-testid="textarea-rink-address"
                />
              </div>
            </div>
          </div>

          {/* League Settings */}
          <div className="bg-card rounded-xl border border-border p-6">
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
                  className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                  className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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