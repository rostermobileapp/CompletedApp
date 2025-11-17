import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Calendar, Crown, MapPin, Users, Search, Mail, X, UserPlus, BookMarked } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';

// Create form schema - includes UI fields that map to database fields
const createScrimmageSchema = createScrimmageRequestSchema.extend({
  selectedMemberIds: z.array(z.string()).optional().default([]), // Optional when no league available
  selectedEmails: z.array(z.string()).optional().default([]), // Email invites
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  venue: z.string().min(1, 'Venue is required'), // UI field that maps to location
  maxParticipants: z.number().min(2, 'Must have at least 2 participants'), // UI field that maps to maxPlayers
  costPerPlayer: z.string().optional(), // Optional cost field
  // Recurring event fields
  isRecurring: z.boolean().default(false),
  recurrenceType: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  recurrenceDays: z.array(z.number()).optional(), // Array of day numbers (0=Sunday, 1=Monday, etc.)
  recurrenceEndType: z.enum(['date', 'count']).optional(), // Either end by date or count
  recurrenceEndDate: z.string().optional(),
  recurrenceCount: z.number().optional(),
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
  
  // Email invite states
  const [emailSearchTerm, setEmailSearchTerm] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  
  // Invite group states
  const [selectedInviteGroupId, setSelectedInviteGroupId] = useState<string>("");

  // Fetch user's facility memberships
  const { data: facilityMemberships, isLoading: facilitiesLoading } = useQuery<Array<{ facility: { id: string; name: string; address: string; city: string; state: string } }>>({
    queryKey: ['/api/users/me/facility-memberships'],
    enabled: !!user,
  });

  // 🚨 SUBSCRIPTION GATE REMOVED - ALL USERS CAN CREATE SCRIMMAGES 🚨

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
      // Recurring event defaults
      isRecurring: false,
      recurrenceType: 'none',
      recurrenceDays: [],
      recurrenceEndType: 'date',
      recurrenceEndDate: '',
      recurrenceCount: 1,
    },
  });

  // Fetch user's leagues to get league members
  const { data: userLeagues = [], isLoading: leaguesLoading } = useQuery({
    queryKey: ['/api/user/leagues'],
  });

  // Fetch league members for the selected league
  const selectedLeague = (userLeagues as any[])?.[0]; // Use first league for now
  
  // Get the league's facility if it exists
  const leagueFacility = selectedLeague?.facility;
  const { data: leagueMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague?.id}/members-for-scrimmage`],
    enabled: !!selectedLeague?.id,
  });

  // Fetch invite groups for the current user
  const { data: inviteGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['/api/invite-groups', selectedLeague?.id],
    queryFn: async () => {
      const url = selectedLeague?.id 
        ? `/api/invite-groups?leagueId=${selectedLeague.id}`
        : '/api/invite-groups';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch invite groups');
      return response.json();
    },
    enabled: !!user,
  });

  // Search users by email
  const { data: emailSearchResults = [], isLoading: emailSearchLoading } = useQuery({
    queryKey: ['/api/users/search', emailSearchTerm],
    queryFn: async () => {
      const response = await fetch(`/api/users/search?email=${encodeURIComponent(emailSearchTerm)}`);
      if (!response.ok) throw new Error('Failed to search users');
      return response.json();
    },
    enabled: emailSearchTerm.length > 2,
  });

  // Filter members based on search term (names only)
  const filteredMembers = (leagueMembers as any[]).filter((member: any) => 
    `${member.user.firstName} ${member.user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Combine league facility with user facility memberships
  const allFacilities = (() => {
    const facilities: Array<{ id: string; name: string; city?: string; isLeagueFacility: boolean }> = [];
    
    // Add league's facility first (if it exists)
    if (leagueFacility) {
      facilities.push({
        id: leagueFacility.id,
        name: leagueFacility.name,
        city: leagueFacility.city,
        isLeagueFacility: true
      });
    }
    
    // Add user's facility memberships (if they exist and not already included)
    if (facilityMemberships && facilityMemberships.length > 0) {
      facilityMemberships.forEach((membership: any) => {
        // Don't add duplicates (league facility might also be in user's memberships)
        if (!facilities.some(f => f.id === membership.facility.id)) {
          facilities.push({
            id: membership.facility.id,
            name: membership.facility.name,
            city: membership.facility.city,
            isLeagueFacility: false
          });
        }
      });
    }
    
    return facilities;
  })();

  // Set default venue to league facility when it loads
  useEffect(() => {
    if (leagueFacility && !form.watch('venue')) {
      form.setValue('venue', leagueFacility.name);
    }
  }, [leagueFacility, form]);

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
        // Recurring event data
        isRecurring: data.isRecurring,
        recurrenceType: data.isRecurring ? data.recurrenceType : 'none',
        recurrenceDays: data.isRecurring && data.recurrenceType === 'weekly' ? data.recurrenceDays : null,
        recurrenceEndDate: data.isRecurring && data.recurrenceEndType === 'date' && data.recurrenceEndDate 
          ? new Date(data.recurrenceEndDate) 
          : null,
        recurrenceCount: data.isRecurring && data.recurrenceEndType === 'count' ? data.recurrenceCount : null,
      };

      // Filter out the creator from selectedMemberIds (they don't need to invite themselves)
      const userId = (user as any)?.id;
      const filteredMemberIds = userId 
        ? data.selectedMemberIds.filter(id => id !== userId)
        : data.selectedMemberIds;

      const response = await apiRequest('POST', '/api/scrimmages', {
        ...scrimmageData,
        selectedMemberIds: filteredMemberIds, // Include for targeted announcements
        selectedEmails: data.selectedEmails || [], // Include email invites
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
    if (selectedLeague && selectedMemberIds.length === 0 && selectedEmails.length === 0) {
      form.setError('selectedMemberIds', {
        type: 'required',
        message: 'Please select at least one member or add an email invite'
      });
      return;
    }
    
    const formData = { 
      ...data, 
      selectedMemberIds: selectedLeague ? selectedMemberIds : [],
      selectedEmails: selectedLeague ? selectedEmails : [],
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

  // Email invite handlers
  const addEmailInvite = (email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;
    
    // Strict email validation using zod
    const emailSchema = z.string().email();
    const validationResult = emailSchema.safeParse(trimmedEmail);
    
    if (!validationResult.success) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }
    
    // Check for duplicates
    if (selectedEmails.includes(trimmedEmail)) {
      toast({
        title: 'Duplicate Email',
        description: 'This email is already in your invite list',
        variant: 'destructive',
      });
      return;
    }
    
    // Add the validated, normalized email
    setSelectedEmails([...selectedEmails, trimmedEmail]);
    setManualEmail("");
    setEmailSearchTerm("");
  };

  const removeEmailInvite = (email: string) => {
    setSelectedEmails(selectedEmails.filter(e => e !== email));
  };

  // Load invite group
  const loadInviteGroup = async (groupId: string) => {
    if (!groupId) return;
    
    try {
      const response = await apiRequest('GET', `/api/invite-groups/${groupId}`);
      const groupData = await response.json();
      
      if (groupData.members) {
        const userIds: string[] = [];
        const emails: string[] = [];
        
        groupData.members.forEach((member: any) => {
          if (member.userId) {
            userIds.push(member.userId);
          } else if (member.email) {
            emails.push(member.email);
          }
        });
        
        setSelectedMemberIds(Array.from(new Set([...selectedMemberIds, ...userIds])));
        setSelectedEmails(Array.from(new Set([...selectedEmails, ...emails])));
        
        toast({
          title: 'Group Loaded',
          description: `Added ${userIds.length} members and ${emails.length} email invites from "${groupData.name}"`,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load invite group',
        variant: 'destructive',
      });
    }
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
              navigate('/');
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
        <div className="rounded-xl border border-border p-6 pt-[4px] pb-[4px] pl-[4px] pr-[4px] bg-[#e2e2e2] dark:bg-[#212121] text-[#212121] dark:text-[#ffffff]">
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

            {/* Recurring Event Settings */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isRecurring" className="text-base">Make this recurring</Label>
                  <p className="text-sm text-muted-foreground">Schedule multiple events at regular intervals</p>
                </div>
                <Switch
                  id="isRecurring"
                  checked={form.watch('isRecurring')}
                  onCheckedChange={(checked) => {
                    form.setValue('isRecurring', checked);
                    form.setValue('recurrenceType', checked ? 'weekly' : 'none');
                  }}
                  className="data-[state=unchecked]:bg-white"
                  data-testid="switch-recurring"
                />
              </div>

              {form.watch('isRecurring') && (
                <div className="space-y-4 pt-2">
                  {/* Recurrence Type */}
                  <div>
                    <Label>Repeat</Label>
                    <RadioGroup
                      value={form.watch('recurrenceType')}
                      onValueChange={(value: any) => form.setValue('recurrenceType', value)}
                      className="flex gap-4 mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="daily" id="daily" data-testid="radio-daily" />
                        <Label htmlFor="daily" className="font-normal cursor-pointer">Daily</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="weekly" id="weekly" data-testid="radio-weekly" />
                        <Label htmlFor="weekly" className="font-normal cursor-pointer">Weekly</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="monthly" id="monthly" data-testid="radio-monthly" />
                        <Label htmlFor="monthly" className="font-normal cursor-pointer">Monthly</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Days of Week (only for weekly) */}
                  {form.watch('recurrenceType') === 'weekly' && (
                    <div>
                      <Label>Repeat on</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                          <div key={day + index} className="flex items-center space-x-2">
                            <Checkbox
                              id={`day-${index}`}
                              checked={form.watch('recurrenceDays')?.includes(index)}
                              onCheckedChange={(checked) => {
                                const currentDays = form.watch('recurrenceDays') || [];
                                if (checked) {
                                  form.setValue('recurrenceDays', [...currentDays, index].sort());
                                } else {
                                  form.setValue('recurrenceDays', currentDays.filter(d => d !== index));
                                }
                              }}
                              data-testid={`checkbox-day-${index}`}
                            />
                            <Label htmlFor={`day-${index}`} className="font-normal cursor-pointer text-sm">{day}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* End Type */}
                  <div>
                    <Label>End</Label>
                    <RadioGroup
                      value={form.watch('recurrenceEndType')}
                      onValueChange={(value: any) => form.setValue('recurrenceEndType', value)}
                      className="space-y-2 mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="date" id="endDate" data-testid="radio-end-date" />
                        <Label htmlFor="endDate" className="font-normal cursor-pointer">On date</Label>
                        {form.watch('recurrenceEndType') === 'date' && (
                          <Input
                            type="date"
                            {...form.register('recurrenceEndDate')}
                            className="ml-2 w-40"
                            min={new Date().toISOString().split('T')[0]}
                            data-testid="input-recurrence-end-date"
                          />
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="count" id="endCount" data-testid="radio-end-count" />
                        <Label htmlFor="endCount" className="font-normal cursor-pointer">After</Label>
                        {form.watch('recurrenceEndType') === 'count' && (
                          <>
                            <Input
                              type="number"
                              {...form.register('recurrenceCount', { valueAsNumber: true })}
                              className="ml-2 w-20"
                              min={1}
                              max={52}
                              data-testid="input-recurrence-count"
                            />
                            <span className="text-sm text-muted-foreground">occurrences</span>
                          </>
                        )}
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              )}
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
        <div className="rounded-xl border border-border p-6 bg-[#e2e2e2] dark:bg-[#212121] text-[#212121] dark:text-[#ffffff] pt-[4px] pb-[4px] pl-[4px] pr-[4px] mt-[12px] mb-[12px]">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Venue Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="venue">Venue</Label>
              {facilitiesLoading ? (
                <div className="h-10 bg-muted rounded-md animate-pulse" />
              ) : allFacilities.length > 0 ? (
                <Select
                  value={form.watch('venue')}
                  onValueChange={(value) => form.setValue('venue', value)}
                >
                  <SelectTrigger data-testid="select-venue">
                    <SelectValue placeholder="Select a facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {allFacilities.map((facility) => (
                      <SelectItem 
                        key={facility.id} 
                        value={facility.name}
                      >
                        {facility.name}
                        {facility.city && ` - ${facility.city}`}
                        {facility.isLeagueFacility && " (League Facility)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="venue"
                  {...form.register('venue')}
                  placeholder="Enter venue location (e.g., Ice Rink, Sports Complex)"
                  data-testid="input-venue"
                />
              )}
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
          <div className="rounded-xl border border-border p-6 bg-[#e2e2e2] dark:bg-[#212121]">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Invite Members
            </h3>

          {/* Invite Group Selector - Always shown at top */}
          <div className="mb-6 p-4 bg-muted/30 rounded-lg border border-border">
            <Label htmlFor="invite-group" className="text-base font-semibold mb-2 block">
              Quick Load from Saved Group
            </Label>
            {(inviteGroups as any[]).length > 0 ? (
              <div className="flex gap-2">
                <Select
                  value={selectedInviteGroupId}
                  onValueChange={(value) => {
                    setSelectedInviteGroupId(value);
                    loadInviteGroup(value);
                  }}
                >
                  <SelectTrigger data-testid="select-invite-group">
                    <SelectValue placeholder="Select a group..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(inviteGroups as any[]).map((group: any) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/invite-groups')}
                  data-testid="button-manage-groups"
                >
                  Manage
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  No invite groups yet. Create groups to quickly invite the same people to scrimmages.
                </p>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => navigate('/invite-groups')}
                  data-testid="button-create-group"
                >
                  Create Group
                </Button>
              </div>
            )}
          </div>

          {/* League Members Section */}
          <div className="mb-6">
            <Label>League Members</Label>
            {/* Search */}
            <div className="relative mt-2 mb-4">
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
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 pt-[4px] pb-[4px]"
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
          </div>

          {/* Email Invites Section */}
          <div className="mt-6 border-t border-border pt-6">
            <Label className="text-base mb-3 block">
              <Mail className="inline-block w-4 h-4 mr-2" />
              Invite by Email
            </Label>
            <p className="text-sm text-muted-foreground mb-4">
              Invite users who aren't in the league yet
            </p>

            {/* Email Search */}
            <div className="mb-4">
              <Label htmlFor="email-search" className="text-sm">Search by email</Label>
              <Input
                id="email-search"
                type="email"
                placeholder="Search existing users..."
                value={emailSearchTerm}
                onChange={(e) => setEmailSearchTerm(e.target.value)}
                className="mt-2"
                data-testid="input-search-email"
              />
              
              {/* Email Search Results */}
              {emailSearchTerm.length > 2 && (
                <div className="mt-2 border border-border rounded-md max-h-32 overflow-y-auto">
                  {emailSearchLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                  ) : (emailSearchResults as any[]).length > 0 ? (
                    (emailSearchResults as any[]).map((user: any) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => addEmailInvite(user.email)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                        data-testid={`button-add-email-${user.email}`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {user.firstName?.[0]}{user.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                        <UserPlus className="w-4 h-4" />
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">No users found</div>
                  )}
                </div>
              )}
            </div>

            {/* Manual Email Input */}
            <div className="mb-4">
              <Label htmlFor="manual-email" className="text-sm">Or enter email manually</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="manual-email"
                  type="email"
                  placeholder="user@example.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmailInvite(manualEmail);
                    }
                  }}
                  data-testid="input-manual-email"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addEmailInvite(manualEmail)}
                  disabled={!manualEmail}
                  data-testid="button-add-manual-email"
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Selected Emails Display */}
            {selectedEmails.length > 0 && (
              <div>
                <Label className="text-sm mb-2 block">Email Invites ({selectedEmails.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedEmails.map((email) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="pl-2 pr-1 py-1"
                      data-testid={`badge-email-${email}`}
                    >
                      <Mail className="w-3 h-3 mr-1" />
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmailInvite(email)}
                        className="ml-1 hover:bg-muted rounded-full p-0.5"
                        data-testid={`button-remove-email-${email}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

            {selectedMemberIds.length === 0 && selectedEmails.length === 0 && (
              <p className="text-sm text-destructive mt-4">Please select at least one member or add an email invite</p>
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
              (selectedMemberIds.length === 0 && selectedEmails.length === 0)
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