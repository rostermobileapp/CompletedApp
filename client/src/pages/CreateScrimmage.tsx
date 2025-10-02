import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Calendar, Crown, MapPin, Users, Search } from 'lucide-react';
import { useLocation } from 'wouter';
import { createScrimmageRequestSchema } from '@shared/schema';
import { z } from 'zod';
import { usePermissions } from '@/context/SubscriptionContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Create form schema - includes UI fields that map to database fields
const createScrimmageSchema = createScrimmageRequestSchema.extend({
  selectedMemberIds: z.array(z.string()).optional().default([]), // Optional when no league available
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  venue: z.string().min(1, 'Venue is required'), // UI field that maps to location
  maxParticipants: z.number().min(2, 'Must have at least 2 participants'), // UI field that maps to maxPlayers
  costPerPlayer: z.string().optional(), // Optional cost field
}).omit({
  dateTime: true, // We'll construct this from date + time
  location: true, // We'll map venue to location  
  maxPlayers: true, // We'll map maxParticipants to maxPlayers
});

type CreateScrimmageForm = z.infer<typeof createScrimmageSchema>;

export default function CreateScrimmage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canAccessPremiumFeatures } = usePermissions();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Check permissions - free tier users cannot create scrimmages
  useEffect(() => {
    if (!canAccessPremiumFeatures) {
      toast({
        title: "Premium Feature",
        description: "Creating scrimmages is only available for Player Pro and Commissioner users.",
        variant: "destructive",
      });
      navigate('/');
    }
  }, [canAccessPremiumFeatures, navigate, toast]);

  const form = useForm<CreateScrimmageForm>({
    resolver: zodResolver(createScrimmageSchema),
    defaultValues: {
      title: '',
      notes: '',
      skillLevel: '',
      date: '',
      time: '',
      selectedMemberIds: [],
      venue: '', // UI field that maps to location
      maxParticipants: 20, // UI field that maps to maxPlayers
      costPerPlayer: '', // Optional cost field
    },
  });

  // Fetch user's leagues to get league members
  const { data: userLeagues = [], isLoading: leaguesLoading } = useQuery({
    queryKey: ['/api/user/leagues'],
  });

  // Fetch league members for the selected league
  const selectedLeague = (userLeagues as any[])?.[0]; // Use first league for now
  const { data: leagueMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague?.id}/members-for-scrimmage`],
    enabled: !!selectedLeague?.id,
  });

  // Filter members based on search term (names only)
  const filteredMembers = (leagueMembers as any[]).filter((member: any) => 
    `${member.user.firstName} ${member.user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createScrimmageRequest = useMutation({
    mutationFn: async (data: CreateScrimmageForm) => {
      // Guard against no leagues
      if (!selectedLeague?.id) {
        throw new Error('No league available. Please join a league first.');
      }
      
      // Map form fields to database schema
      const scrimmageData = {
        title: data.title,
        notes: data.notes,
        skillLevel: data.skillLevel,
        location: data.venue, // Map venue to location
        maxPlayers: data.maxParticipants, // Map maxParticipants to maxPlayers
        dateTime: new Date(`${data.date}T${data.time}`), // Combine date and time
        leagueId: selectedLeague.id, // Required by server
        costPerPlayer: data.costPerPlayer ? data.costPerPlayer : null, // Optional cost
      };

      // Filter out the creator from selectedMemberIds (they don't need to invite themselves)
      const userId = (user as any)?.id;
      const filteredMemberIds = userId 
        ? data.selectedMemberIds.filter(id => id !== userId)
        : data.selectedMemberIds;

      const response = await apiRequest('POST', '/api/scrimmages', {
        ...scrimmageData,
        selectedMemberIds: filteredMemberIds, // Include for targeted announcements
      });
      return response.json();
    },
    onSuccess: (scrimmage) => {
      toast({
        title: 'Scrimmage Request Created',
        description: `"${scrimmage.title}" has been created. Selected members will be notified.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-invites'] });
      setPageTransitionDirection('down');
      navigate(`/scrimmage/${scrimmage.id}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create Scrimmage',
        description: error.message || 'An error occurred while creating the scrimmage request',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreateScrimmageForm) => {
    // Additional validation for member selection when league is available
    if (selectedLeague && selectedMemberIds.length === 0) {
      form.setError('selectedMemberIds', {
        type: 'required',
        message: 'Please select at least one member to invite'
      });
      return;
    }
    
    const formData = { 
      ...data, 
      selectedMemberIds: selectedLeague ? selectedMemberIds : [] 
    };
    createScrimmageRequest.mutate(formData);
  };

  const toggleMemberSelection = (memberId: string) => {
    const newSelection = selectedMemberIds.includes(memberId) 
      ? selectedMemberIds.filter(id => id !== memberId)
      : [...selectedMemberIds, memberId];
    
    setSelectedMemberIds(newSelection);
    // Update form validation state
    form.setValue('selectedMemberIds', newSelection);
    // Trigger validation
    form.trigger('selectedMemberIds');
  };

  const selectAllMembers = () => {
    const allMemberIds = filteredMembers.map((member: any) => member.user.id);
    setSelectedMemberIds(allMemberIds);
    form.setValue('selectedMemberIds', allMemberIds);
    form.trigger('selectedMemberIds');
  };

  const deselectAllMembers = () => {
    setSelectedMemberIds([]);
    form.setValue('selectedMemberIds', []);
    form.trigger('selectedMemberIds');
  };

  // 🚨 SUBSCRIPTION GATE REMOVED - FULL ACCESS FOR EVERYONE! 🚨
  // All users now have free access to scrimmage creation

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="create-scrimmage-page">
      {/* Header */}
      <div className="p-6 pt-12">
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Schedule Scrimmage</h1>
          <Calendar className="w-6 h-6 text-primary" />
        </div>
        <p className="text-muted-foreground">
          Create a scrimmage request and invite league members to join
        </p>
      </div>

      {/* Form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 space-y-6">
        {/* Scrimmage Details */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Scrimmage Details
          </h3>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                {...form.register('title')}
                placeholder="Friday Night Scrimmage"
                data-testid="input-title"
              />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="notes">Description (Optional)</Label>
              <Textarea
                id="notes"
                {...form.register('notes')}
                placeholder="Casual scrimmage, all skill levels welcome"
                rows={3}
                data-testid="input-notes"
              />
            </div>

            <div>
              <Label htmlFor="skillLevel">Skill Level (Optional)</Label>
              <Select
                value={form.watch('skillLevel') || 'none'}
                onValueChange={(value) => form.setValue('skillLevel', value === 'none' ? '' : value)}
              >
                <SelectTrigger data-testid="select-skill-level">
                  <SelectValue placeholder="Select skill level (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                  <SelectItem value="A">A Level</SelectItem>
                  <SelectItem value="B">B Level</SelectItem>
                  <SelectItem value="C">C Level</SelectItem>
                  <SelectItem value="D">D Level</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  {...form.register('date')}
                  min={new Date().toISOString().split('T')[0]}
                  data-testid="input-date"
                />
                {form.formState.errors.date && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  {...form.register('time')}
                  data-testid="input-time"
                />
                {form.formState.errors.time && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.time.message}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Venue Information */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Venue Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                {...form.register('venue')}
                placeholder="Ice Arena, Basketball Court, etc."
                data-testid="input-venue"
              />
              {form.formState.errors.venue && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.venue.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="maxParticipants">Max Participants</Label>
              <Select
                value={form.watch('maxParticipants')?.toString()}
                onValueChange={(value) => form.setValue('maxParticipants', parseInt(value))}
              >
                <SelectTrigger data-testid="select-max-participants">
                  <SelectValue placeholder="Select max participants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 players</SelectItem>
                  <SelectItem value="15">15 players</SelectItem>
                  <SelectItem value="20">20 players</SelectItem>
                  <SelectItem value="25">25 players</SelectItem>
                  <SelectItem value="30">30 players</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="costPerPlayer">Cost Per Player (Optional)</Label>
              <Input
                id="costPerPlayer"
                {...form.register('costPerPlayer')}
                placeholder="$20.00"
                data-testid="input-cost-per-player"
              />
              <p className="text-xs text-muted-foreground mt-1">
                If there's a cost, you can create a payment request after approval
              </p>
            </div>
          </div>
        </div>

        {/* Member Selection - Only show if user has leagues */}
        {selectedLeague ? (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Invite League Members
            </h3>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-members"
            />
          </div>

          {/* Selected count and bulk actions */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground" data-testid="text-selected-count">
              {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllMembers}
                disabled={filteredMembers.length === 0}
                data-testid="button-select-all"
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={deselectAllMembers}
                disabled={selectedMemberIds.length === 0}
                data-testid="button-deselect-all"
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Member list */}
          <ScrollArea className="h-64">
            {membersLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                    <div className="w-10 h-10 bg-muted rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No members found' : 'No league members available'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map((member: any) => (
                  <div
                    key={member.user.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50"
                    data-testid={`member-item-${member.user.id}`}
                  >
                    <Checkbox
                      checked={selectedMemberIds.includes(member.user.id)}
                      onCheckedChange={() => toggleMemberSelection(member.user.id)}
                      data-testid={`checkbox-member-${member.user.id}`}
                    />
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.user.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {member.user.firstName?.[0]}{member.user.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium" data-testid={`text-member-name-${member.user.id}`}>
                        {member.user.firstName} {member.user.lastName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

            {selectedMemberIds.length === 0 && (
              <p className="text-sm text-destructive mt-2">Please select at least one member to invite</p>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              League Required
            </h3>
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-4">You need to join a league before you can schedule scrimmages.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPageTransitionDirection('up');
                  navigate('/league-search');
                }}
                data-testid="button-join-league"
              >
                Browse Leagues
              </Button>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="pb-6">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={
              createScrimmageRequest.isPending || 
              !selectedLeague?.id || 
              selectedMemberIds.length === 0
            }
            data-testid="button-create-scrimmage"
          >
            {createScrimmageRequest.isPending 
              ? 'Creating...' 
              : !selectedLeague?.id 
                ? 'Join a League First' 
                : 'Create Scrimmage Request'
            }
          </Button>
        </div>
      </form>
    </div>
  );
}