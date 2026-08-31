import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getAuthHeaders, getImageUrl } from '@/lib/queryClient';
import { splitScrimmageDateTime } from '@/lib/scrimmageDateTime';
import { useToast } from '@/hooks/use-toast';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Calendar, Clock, Crown, MapPin, Users, Mail, X, UserPlus, BookMarked, ChevronDown, ChevronUp, Check, ShieldHalf, PersonStanding, AlertCircle } from 'lucide-react';
import { SCRIMMAGE_COVER_OPTIONS } from '@/lib/scrimmageCoverOptions';
import { RinkPickerField } from '@/components/RinkPickerField';
import type { RinkSelection } from '@/components/RinkPickerField';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useLocation, useRoute } from 'wouter';
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
import { format } from 'date-fns';
import { FixedBottomButton } from '@/components/FixedBottomButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Create form schema - includes UI fields that map to database fields
const createScrimmageSchema = createScrimmageRequestSchema.extend({
  selectedMemberIds: z.array(z.string()).optional().default([]), // Optional when no league available
  selectedEmails: z.array(z.string()).optional().default([]), // Email invites
  coHostIds: z.array(z.string()).optional().default([]), // Co-hosts who can help manage the scrimmage
  date: z.string().min(1, 'Date is required'),
  time: z.string().optional().default(''),
  venue: z.string().min(1, 'Venue is required'), // UI field that maps to location
  maxParticipants: z.number().min(2, 'Must have at least 2 participants'), // UI field that maps to maxPlayers
  costPerPlayer: z.string().optional(), // Optional cost field
  // Recurring event fields
  isRecurring: z.boolean().default(false),
  recurrenceType: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  recurrenceDays: z.array(z.number()).optional(), // Array of day numbers (0=Sunday, 1=Monday, etc.)
  recurrenceEndType: z.enum(['never', 'date', 'count']).optional(), // Either never end, end by date, or count
  recurrenceEndDate: z.string().optional(),
  recurrenceCount: z.number().optional(),
  // Invitation scheduling for recurring scrimmages
  enableInviteScheduling: z.boolean().default(true),
  sendInviteNow: z.boolean().default(true), // Send invitation immediately when scrimmage is created
  inviteDaysBefore: z.number().min(1).max(14).default(5), // Days before each occurrence to send invites
  inviteTimeOfDay: z.string().default('09:00'), // Time to send invites (HH:MM format)
  // Reminder settings
  enableReminders: z.boolean().default(true),
  reminderHoursBefore: z.array(z.number()).default([24]), // Default to 24 hours before
}).omit({
  dateTime: true, // We'll construct this from date + time
  location: true, // We'll map venue to location  
  maxPlayers: true, // We'll map maxParticipants to maxPlayers
});

type CreateScrimmageForm = z.infer<typeof createScrimmageSchema>;

export default function CreateScrimmage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/edit-scrimmage/:id');
  const scrimmageId = params?.id;
  const isEditMode = !!scrimmageId;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canAccessPremiumFeatures } = usePermissions();
  const { user } = useAuth();
  const [goalieSearchTerm, setGoalieSearchTerm] = useState("");
  const [skaterSearchTerm, setSkaterSearchTerm] = useState("");
  const [goaliePickerOpen, setGoaliePickerOpen] = useState(false);
  const [skaterPickerOpen, setSkaterPickerOpen] = useState(false);
  // 'approval' = organiser manually approves each request (default)
  // 'first_come' = requests are auto-approved on creation while capacity remains
  const [joinMode, setJoinMode] = useState<'approval' | 'first_come' | 'first_pay'>('approval');
  const [loadedInviteGroupIds, setLoadedInviteGroupIds] = useState<string[]>([]);
  // Tracks which selectedMemberIds originated from the invite group snapshot vs manual selection.
  // Only manually-selected users are persisted as inviteUserIds on the scrimmage so that
  // the recurring invite job can treat the live group as the authoritative source.
  const [groupLoadedUserIds, setGroupLoadedUserIds] = useState<Set<string>>(new Set());
  const [groupMembersById, setGroupMembersById] = useState<Record<string, { userIds: string[]; emails: string[] }>>({});
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedCoHostIds, setSelectedCoHostIds] = useState<string[]>([]);
  const [selectedCoHostUsers, setSelectedCoHostUsers] = useState<{id: string; firstName: string|null; lastName: string|null; email: string|null; profileImageUrl: string|null; isAtRink: boolean}[]>([]);
  const [coHostEmails, setCoHostEmails] = useState<string[]>([]); // email-only invites (no account)
  const [coHostSearchTerm, setCoHostSearchTerm] = useState("");
  const [showCoHostDropdown, setShowCoHostDropdown] = useState(false);
  const [coHostSearchResults, setCoHostSearchResults] = useState<{id: string; firstName: string|null; lastName: string|null; email: string|null; profileImageUrl: string|null; isAtRink: boolean}[]>([]);
  const [coHostSearchLoading, setCoHostSearchLoading] = useState(false);
  const coHostDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedRinkFacilityId, setSelectedRinkFacilityId] = useState<string | null>(null);
  const coHostSearchRef = useRef<HTMLDivElement>(null);
  const [formInitialized, setFormInitialized] = useState(false);
  
  // Email invite states
  const [emailSearchTerm, setEmailSearchTerm] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Invite group states
  const [selectedInviteGroupId, setSelectedInviteGroupId] = useState<string>("");
  
  // Color picker state
  const SCRIMMAGE_COLORS = [
    { value: '#ef4444', label: 'Red' },
    { value: '#f97316', label: 'Orange' },
    { value: '#eab308', label: 'Yellow' },
    { value: '#22c55e', label: 'Green' },
    { value: '#3b82f6', label: 'Blue' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#14b8a6', label: 'Teal' },
  ];
  const [selectedColor, setSelectedColor] = useState<string>(SCRIMMAGE_COLORS[4].value); // Default: Blue

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showVenmoOverride, setShowVenmoOverride] = useState(false);
  const [showCashAppOverride, setShowCashAppOverride] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  
  // Time picker state
  const [showTimePicker, setShowTimePicker] = useState(false);
  const timePickerRef = useRef<HTMLDivElement>(null);

  // Fetch existing scrimmage data for edit mode
  const { data: existingScrimmage, isLoading: scrimmageLoading } = useQuery({
    queryKey: ['/api/scrimmages', scrimmageId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/scrimmages/${scrimmageId}`);
      return response.json();
    },
    enabled: isEditMode,
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
        timeTbd: true,
      selectedMemberIds: [],
      venue: '', // UI field that maps to location
      maxParticipants: 20, // UI field that maps to maxPlayers
      costPerPlayer: '', // Optional cost field
      venmoLinkOverride: '',
      cashappLinkOverride: '',
      // Recurring event defaults
      isRecurring: false,
      recurrenceType: 'none',
      recurrenceDays: [],
      recurrenceEndType: 'never',
      recurrenceEndDate: '',
      recurrenceCount: 1,
      // Invitation scheduling defaults (for recurring scrimmages)
      enableInviteScheduling: true,
      sendInviteNow: true, // Send invitation immediately when scrimmage is created
      inviteDaysBefore: 5, // Send invites 5 days before each occurrence
      inviteTimeOfDay: '09:00', // Send at 9 AM
      // Reminder defaults
      enableReminders: true,
      reminderHoursBefore: [24], // Default to 24 hours before
      coverPhoto: null,
    },
  });

  // Fetch user's leagues to get league members
  const { data: userLeagues = [], isLoading: leaguesLoading } = useQuery({
    queryKey: ['/api/user/leagues'],
  });

  // Which league's roster to browse in the invite picker.
  // Prefer: (1) URL ?leagueId param, (2) Dashboard's localStorage selection, (3) first league.
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(() => {
    // Check URL search params first
    const params = new URLSearchParams(window.location.search);
    const urlLeagueId = params.get('leagueId');
    if (urlLeagueId) return urlLeagueId;
    // Fall back to what the Dashboard had selected
    const dashType = localStorage.getItem('dashboardSelectedType');
    const dashId = localStorage.getItem('dashboardSelectedId');
    if (dashType === 'league' && dashId) return dashId;
    return null;
  });

  // If nothing was in URL/localStorage, fall back to first league once loaded.
  useEffect(() => {
    if (selectedLeagueId === null && (userLeagues as any[]).length > 0) {
      setSelectedLeagueId((userLeagues as any[])[0].id);
    }
  }, [userLeagues, selectedLeagueId]);

  // Derive the full league object reactively from the selected ID.
  const selectedLeague = (userLeagues as any[]).find((l: any) => l.id === selectedLeagueId)
    ?? (userLeagues as any[])[0]
    ?? null;

  // Get the league's facility if it exists
  const leagueFacility = selectedLeague?.facility;
  const { data: leagueMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague?.id}/members-for-scrimmage`],
    enabled: !!selectedLeague?.id,
  });

  // Use the same canonical saved-group query/cache as the Invite Groups page.
  // A separate league-filtered key could retain an empty result even after
  // groups were created and the canonical list was invalidated.
  const { data: allInviteGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['/api/invite-groups'],
    enabled: !!user,
  });
  const inviteGroups = (allInviteGroups as any[]).filter(
    (group: any) =>
      !selectedLeague?.id ||
      !group.leagueId ||
      group.leagueId === selectedLeague.id,
  );

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

  // Separate goalie / skater lists with independent search
  const filteredGoalies = (leagueMembers as any[]).filter((member: any) =>
    member.isGoalie === true &&
    `${member.user.firstName} ${member.user.lastName}`.toLowerCase().includes(goalieSearchTerm.toLowerCase())
  );
  const filteredSkaters = (leagueMembers as any[]).filter((member: any) =>
    member.isSkater === true &&
    `${member.user.firstName} ${member.user.lastName}`.toLowerCase().includes(skaterSearchTerm.toLowerCase())
  );


  // Set default venue to league facility when it loads (only for create mode)
  useEffect(() => {
    if (!isEditMode && leagueFacility && !form.watch('venue')) {
      form.setValue('venue', leagueFacility.name);
    }
  }, [leagueFacility, form, isEditMode]);

  // Pre-populate form when editing an existing scrimmage
  useEffect(() => {
    if (isEditMode && existingScrimmage && !formInitialized) {
      setSelectedLeagueId(existingScrimmage.leagueId);
      const { date: dateStr, time: storedTime } = splitScrimmageDateTime(existingScrimmage.dateTime);
      const timeStr = existingScrimmage.timeTbd ? '' : storedTime;
      const savedInviteUserIds = Array.from(new Set<string>(existingScrimmage.inviteUserIds || []));
      
      // Parse recurrence end date directly from string
      const recurrenceEndDateStr = existingScrimmage.recurrenceEndDate || '';
      const recurrenceEndDatePart = recurrenceEndDateStr ? recurrenceEndDateStr.split('T')[0] : '';
      
      form.reset({
        title: existingScrimmage.title || '',
        notes: existingScrimmage.notes || '',
        skillLevel: existingScrimmage.skillLevel || '',
        date: dateStr,
        time: timeStr,
         timeTbd: !!existingScrimmage.timeTbd,
        venue: existingScrimmage.location || '',
        maxParticipants: existingScrimmage.maxPlayers || 20,
        costPerPlayer: existingScrimmage.costPerPlayer || '',
        venmoLinkOverride: existingScrimmage.venmoLinkOverride || '',
        cashappLinkOverride: existingScrimmage.cashappLinkOverride || '',
        isRecurring: existingScrimmage.isRecurring || false,
        recurrenceType: existingScrimmage.recurrenceType || 'none',
        recurrenceDays: existingScrimmage.recurrenceDays || [],
        recurrenceEndType: existingScrimmage.recurrenceEndDate ? 'date' : existingScrimmage.recurrenceCount ? 'count' : 'never',
        recurrenceEndDate: recurrenceEndDatePart,
        recurrenceCount: existingScrimmage.recurrenceCount || 1,
        enableInviteScheduling: !!existingScrimmage.inviteDaysBefore,
        sendInviteNow: false, // Don't send invites again on edit
        inviteDaysBefore: existingScrimmage.inviteDaysBefore || 5,
        inviteTimeOfDay: existingScrimmage.inviteTimeOfDay || '09:00',
        enableReminders: !!existingScrimmage.reminderHoursBefore,
        reminderHoursBefore: existingScrimmage.reminderHoursBefore || [24],
        selectedMemberIds: savedInviteUserIds,
        selectedEmails: [],
        coHostIds: [],
      });
      setSelectedMemberIds(savedInviteUserIds);
      if (existingScrimmage.color) {
        setSelectedColor(existingScrimmage.color);
      }
      if (existingScrimmage.coverPhoto) {
        form.setValue('coverPhoto', existingScrimmage.coverPhoto);
      }
      if (existingScrimmage.venmoLinkOverride) setShowVenmoOverride(true);
      if (existingScrimmage.cashappLinkOverride) setShowCashAppOverride(true);
      if (existingScrimmage.joinMode === 'first_come' || existingScrimmage.joinMode === 'approval' || existingScrimmage.joinMode === 'first_pay') {
        setJoinMode(existingScrimmage.joinMode);
      }
      setLoadedInviteGroupIds(Array.from(new Set([
        ...(existingScrimmage.inviteGroupIds || []),
        ...(existingScrimmage.inviteGroupId ? [existingScrimmage.inviteGroupId] : []),
      ])));
      setFormInitialized(true);
    }
  }, [isEditMode, existingScrimmage, form, formInitialized]);

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  // Close time picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
        setShowTimePicker(false);
      }
    };

    if (showTimePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimePicker]);

  // Close co-host dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (coHostSearchRef.current && !coHostSearchRef.current.contains(event.target as Node)) {
        setShowCoHostDropdown(false);
      }
    };

    if (showCoHostDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCoHostDropdown]);

  // Debounced co-host search
  useEffect(() => {
    if (coHostDebounceRef.current) clearTimeout(coHostDebounceRef.current);
    if (!coHostSearchTerm || coHostSearchTerm.trim().length < 2) {
      setCoHostSearchResults([]);
      setCoHostSearchLoading(false);
      return;
    }
    setCoHostSearchLoading(true);
    coHostDebounceRef.current = setTimeout(async () => {
      try {
        const facilityId = selectedRinkFacilityId || leagueFacility?.id;
        const params = new URLSearchParams({ q: coHostSearchTerm.trim() });
        if (facilityId) params.set('facilityId', facilityId);
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/users/search-all?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setCoHostSearchResults(data);
        }
      } catch {
        // ignore
      } finally {
        setCoHostSearchLoading(false);
      }
    }, 350);
    return () => { if (coHostDebounceRef.current) clearTimeout(coHostDebounceRef.current); };
  }, [coHostSearchTerm, selectedRinkFacilityId, leagueFacility?.id]);

  const createScrimmageRequest = useMutation({
    mutationFn: async (data: CreateScrimmageForm) => {
      // Guard against no leagues (only for create mode)
      if (!isEditMode && !selectedLeague?.id) {
        throw new Error('No league available. Please join a league first.');
      }
      
      // Map form fields to database schema
      // Send datetime strings directly without timezone conversion
      // The datetime is in the league's timezone and should be stored as-is
      const scrimmageData = {
        title: data.title,
        notes: data.notes,
        skillLevel: data.skillLevel,
        location: data.venue, // Map venue to location
        maxPlayers: data.maxParticipants, // Map maxParticipants to maxPlayers
        dateTime: `${data.date}T${data.time || '00:00'}`, // Date-only anchor when the time is TBD
        timeTbd: !!data.timeTbd || !data.time,
        costPerPlayer: data.costPerPlayer ? data.costPerPlayer : null, // Optional cost
        // Per-scrimmage payment link overrides (validated + normalized server-side)
        venmoLinkOverride: data.venmoLinkOverride ?? null,
        cashappLinkOverride: data.cashappLinkOverride ?? null,
        // Recurring event data
        isRecurring: data.isRecurring,
        recurrenceType: data.isRecurring ? data.recurrenceType : 'none',
        recurrenceDays: data.isRecurring && data.recurrenceType === 'weekly' ? data.recurrenceDays : null,
        recurrenceEndDate: data.isRecurring && data.recurrenceEndType === 'date' && data.recurrenceEndDate 
          ? data.recurrenceEndDate // Send as string without UTC conversion
          : null,
        recurrenceCount: data.isRecurring && data.recurrenceEndType === 'count' ? data.recurrenceCount : null,
        // Invitation scheduling for recurring scrimmages
        inviteDaysBefore: data.isRecurring && data.enableInviteScheduling ? data.inviteDaysBefore : null,
        inviteTimeOfDay: data.isRecurring && data.enableInviteScheduling ? data.inviteTimeOfDay : null,
        // Reminder settings
        reminderHoursBefore: data.enableReminders ? data.reminderHoursBefore : null,
        // Send invite immediately when scrimmage is created (only for new scrimmages)
        // In edit mode this is an explicit choice to deliver already-saved
        // invitations after setting an occurrence's time.
        sendInviteNow: data.sendInviteNow && !(!!data.timeTbd || !data.time),
        // Calendar color
        color: selectedColor || null,
        // Cover photo
        coverPhoto: data.coverPhoto || null,
        // Join mode: how players are admitted
        joinMode,
        inviteGroupIds: loadedInviteGroupIds,
        // Keep the first selected group in the legacy field for older clients/jobs.
        inviteGroupId: loadedInviteGroupIds[0] || null,
      };

      if (isEditMode && scrimmageId) {
        // Update existing scrimmage
        const response = await apiRequest('PATCH', `/api/scrimmages/${scrimmageId}`, scrimmageData);
        return response.json();
      } else {
        // Create new scrimmage
        // Filter out the creator from selectedMemberIds (they don't need to invite themselves)
        const userId = (user as any)?.id;
        const filteredMemberIds = userId 
          ? data.selectedMemberIds.filter(id => id !== userId)
          : data.selectedMemberIds;

        // When an invite group is linked, only store manually-selected IDs (not the group snapshot)
        // as inviteUserIds. The recurring job re-fetches live group membership at send-time and
        // unions it with these manual IDs — so only users added outside the group are persisted.
        const manuallySelectedIds = loadedInviteGroupIds.length > 0
          ? filteredMemberIds.filter(id => !groupLoadedUserIds.has(id))
          : filteredMemberIds;

        const response = await apiRequest('POST', '/api/scrimmages', {
          ...scrimmageData,
          leagueId: selectedLeague.id, // Required by server for new scrimmages
          selectedMemberIds: filteredMemberIds, // Include for targeted announcements/invitations
          selectedEmails: data.selectedEmails || [], // Include email invites
          coHostIds: selectedCoHostIds, // Include co-hosts who can help manage
          coHostEmails, // Email-invited co-hosts (may not have accounts yet)
          inviteUserIds: manuallySelectedIds, // Only manually-selected (non-group) users persisted
        });
        return response.json();
      }
    },
    onSuccess: (scrimmage) => {
      toast({
        title: scrimmage.inviteDeliveryFailed
          ? 'Scrimmage Updated — Invitations Need Retry'
          : isEditMode ? 'Scrimmage Updated' : 'Scrimmage Request Created',
        description: scrimmage.inviteDeliveryFailed
          ? `"${scrimmage.title}" has the new time, but its saved invitations could not be sent. You can retry from the scrimmage.`
          : isEditMode
          ? `"${scrimmage.title}" has been updated successfully.`
          : scrimmage.timeTbd
            ? `"${scrimmage.title}" has been saved as Time TBD. Selected players can RSVP now and will receive the exact time when it is set.`
            : `"${scrimmage.title}" has been created. Selected members will be notified.`,
        variant: scrimmage.inviteDeliveryFailed ? 'destructive' : 'default',
      });
      // The details page reads the scrimmage from the approved-players
      // response, not from the standalone `/api/scrimmages/:id` query. Update
      // both cached shapes before navigating so the new time is visible
      // immediately, even while the background refetch is still in flight.
      queryClient.setQueryData(
        [`/api/scrimmages/${scrimmageId}/approved-players`],
        (current: any) => current
          ? { ...current, scrimmage: { ...current.scrimmage, ...scrimmage } }
          : current,
      );
      queryClient.setQueryData(
        ['/api/scrimmages', scrimmageId],
        scrimmage,
      );
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', scrimmageId] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-invites'] });
      setPageTransitionDirection('down');
      navigate(`/scrimmage/${scrimmage.id}`);
    },
    onError: (error: any) => {
      toast({
        title: isEditMode ? 'Failed to Update Scrimmage' : 'Failed to Create Scrimmage',
        description: error.message || `An error occurred while ${isEditMode ? 'updating' : 'creating'} the scrimmage`,
        variant: 'destructive',
      });
    },
  });

  const onInvalid = (errors: Record<string, any>) => {
    const fieldLabels: Record<string, string> = {
      title: 'Title',
      date: 'Date',
      time: 'Time',
      venue: 'Venue',
      maxParticipants: 'Max Participants',
      costPerPlayer: 'Cost Per Player',
      selectedMemberIds: 'Players to invite',
      venmoLinkOverride: 'Venmo payment destination',
      cashappLinkOverride: 'Cash App payment destination',
    };
    const firstError = Object.keys(errors)[0];
    setSubmitError(
      firstError
        ? `${fieldLabels[firstError] || 'Required information'}: ${errors[firstError]?.message || 'Please complete this field.'}`
        : 'Please complete the required fields before creating the scrimmage.',
    );
  };

  const onSubmit = (data: CreateScrimmageForm) => {
    setSubmitError(null);
    if (!isEditMode && !selectedLeague?.id) {
      setSubmitError('League: Please select a league before creating the scrimmage.');
      return;
    }
    if (joinMode === 'first_pay' && (!data.costPerPlayer || Number(data.costPerPlayer) <= 0)) {
      form.setError('costPerPlayer', { message: 'A cost per player is required for First to Pay, First to Play' });
      setSubmitError('Cost Per Player: A positive amount is required for First to Pay, First to Play.');
      return;
    }
    // Additional validation for member selection when league is available (only for create mode)
    if (!isEditMode && selectedLeague && selectedMemberIds.length === 0 && selectedEmails.length === 0) {
      form.setError('selectedMemberIds', {
        type: 'required',
        message: 'Please select at least one member or add an email invite'
      });
      setSubmitError('Players to invite: Please select at least one member or add an email invite.');
      return;
    }
    
    const formData = { 
      ...data, 
      selectedMemberIds: selectedLeague ? selectedMemberIds : [],
      selectedEmails: selectedLeague ? selectedEmails : [],
      coHostIds: selectedCoHostIds,
      coHostEmails,
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

  const selectAllGoalies = () => {
    const ids = filteredGoalies.map((m: any) => m.user.id);
    const combined = Array.from(new Set([...selectedMemberIds, ...ids]));
    setSelectedMemberIds(combined);
    form.setValue('selectedMemberIds', combined);
    form.trigger('selectedMemberIds');
  };
  const deselectAllGoalies = () => {
    const idSet = new Set(filteredGoalies.map((m: any) => m.user.id));
    const remaining = selectedMemberIds.filter(id => !idSet.has(id));
    setSelectedMemberIds(remaining);
    form.setValue('selectedMemberIds', remaining);
    form.trigger('selectedMemberIds');
  };
  const selectAllSkaters = () => {
    const ids = filteredSkaters.map((m: any) => m.user.id);
    const combined = Array.from(new Set([...selectedMemberIds, ...ids]));
    setSelectedMemberIds(combined);
    form.setValue('selectedMemberIds', combined);
    form.trigger('selectedMemberIds');
  };
  const deselectAllSkaters = () => {
    const idSet = new Set(filteredSkaters.map((m: any) => m.user.id));
    const remaining = selectedMemberIds.filter(id => !idSet.has(id));
    setSelectedMemberIds(remaining);
    form.setValue('selectedMemberIds', remaining);
    form.trigger('selectedMemberIds');
  };
  const deselectAllMembers = () => {
    setSelectedMemberIds([]);
    form.setValue('selectedMemberIds', []);
    form.trigger('selectedMemberIds');
  };

  // Co-host selection handler
  const toggleCoHostSelection = (memberId: string) => {
    const newSelection = selectedCoHostIds.includes(memberId) 
      ? selectedCoHostIds.filter(id => id !== memberId)
      : [...selectedCoHostIds, memberId];
    
    setSelectedCoHostIds(newSelection);
    form.setValue('coHostIds', newSelection);
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

  // Load invite group — also records the group ID so recurring scrimmages re-use it live
  const loadInviteGroup = async (groupId: string) => {
    if (!groupId || loadedInviteGroupIds.includes(groupId)) {
      setSelectedInviteGroupId('');
      return;
    }
    
    try {
      const response = await apiRequest('GET', `/api/invite-groups/${groupId}`);
      const groupData = await response.json();
      
      if (groupData.members) {
        const userIds: string[] = [];
        const emails: string[] = [];
        
        groupData.members.forEach((member: any) => {
          if (member.userId) {
            userIds.push(member.userId);
          } else if (member.placeholderPlayerId) {
            userIds.push(`placeholder:${member.placeholderPlayerId}`);
          } else if (member.email) {
            emails.push(member.email);
          }
        });
        
        const mergedUserIds = Array.from(new Set([...selectedMemberIds, ...userIds]));
        const mergedEmails = Array.from(new Set([...selectedEmails, ...emails]));
        setSelectedMemberIds(mergedUserIds);
        setSelectedEmails(mergedEmails);
        // Sync to React Hook Form so submission payload and validation are consistent
        form.setValue('selectedMemberIds', mergedUserIds);
        form.setValue('selectedEmails', mergedEmails);
        form.trigger('selectedMemberIds');
        setGroupLoadedUserIds((current) => new Set([...Array.from(current), ...userIds]));
        setGroupMembersById((current) => ({ ...current, [groupId]: { userIds, emails } }));
        setLoadedInviteGroupIds((current) => [...current, groupId]);
        setSelectedInviteGroupId('');
        
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

  const unlinkInviteGroup = (groupId: string) => {
    const remainingGroupIds = loadedInviteGroupIds.filter((id) => id !== groupId);
    const remainingGroupMembers = remainingGroupIds
      .map((id) => groupMembersById[id])
      .filter(Boolean);
    const remainingUserIds = new Set(remainingGroupMembers.flatMap((group) => group.userIds));
    const remainingEmails = new Set(remainingGroupMembers.flatMap((group) => group.emails));
    const removedGroup = groupMembersById[groupId];

    const nextMemberIds = removedGroup
      ? selectedMemberIds.filter((id) => !removedGroup.userIds.includes(id) || remainingUserIds.has(id))
      : selectedMemberIds;
    const nextEmails = removedGroup
      ? selectedEmails.filter((email) => !removedGroup.emails.includes(email) || remainingEmails.has(email))
      : selectedEmails;

    setLoadedInviteGroupIds(remainingGroupIds);
    setGroupLoadedUserIds(remainingUserIds);
    setGroupMembersById((current) => {
      const next = { ...current };
      delete next[groupId];
      return next;
    });
    setSelectedMemberIds(nextMemberIds);
    setSelectedEmails(nextEmails);
    form.setValue('selectedMemberIds', nextMemberIds);
    form.setValue('selectedEmails', nextEmails);
  };

  // 🚨 SUBSCRIPTION GATE REMOVED - FULL ACCESS FOR EVERYONE! 🚨
  // All users now have free access to scrimmage creation

  return (
    <div className="min-h-screen flex flex-col pb-[100px]" data-testid="create-scrimmage-page">
      {/* Header */}
      <div className="p-6 pl-[8px] pr-[8px] mt-[0px] mb-[0px] pt-[8px] pb-[0px]">
        <div className="flex items-center gap-4 mb-1\.5">
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {isEditMode ? 'Edit Scrimmage' : 'Schedule Scrimmage'}
          </h1>
          <Calendar className="w-6 h-6 text-primary" />
        </div>
      </div>
      {/* Form */}
      <form id="create-scrimmage-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="px-6 space-y-1\.5">
        {/* Scrimmage Details */}
        <div className="rounded-xl hairline elev-rest p-6 pt-[4px] pb-[4px] pl-[4px] pr-[4px] bg-[#e2e2e2] dark:bg-[#212121] text-[#212121] dark:text-[#ffffff]">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Scrimmage Details
          </h3>
          
          <div className="space-y-1">
            {/* League selector — shown at the top when the user belongs to multiple leagues */}
            {!isEditMode && (userLeagues as any[]).length > 1 && (
              <div>
                <Label htmlFor="scrimmage-league">League</Label>
                <Select
                  value={selectedLeagueId ?? ''}
                  onValueChange={(value) => {
                    setSelectedLeagueId(value);
                    // Clear invite selections so stale members from the previous league
                    // don't remain checked.
                    setSelectedMemberIds([]);
                    setSelectedInviteGroupId('');
                    setLoadedInviteGroupIds([]);
                    setGroupLoadedUserIds(new Set());
                    setGroupMembersById({});
                  }}
                >
                  <SelectTrigger id="scrimmage-league" data-testid="select-scrimmage-league">
                    <SelectValue placeholder="Select league…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(userLeagues as any[]).map((league: any) => (
                      <SelectItem key={league.id} value={league.id}>
                        {league.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            {/* Calendar Color Picker */}
            <div>
              <Label>Calendar Color</Label>
              <p className="text-xs text-muted-foreground mb-1">Choose a color to identify this scrimmage on the calendar</p>
              <div className="flex gap-2 flex-wrap">
                {SCRIMMAGE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    title={color.label}
                    onClick={() => setSelectedColor(color.value)}
                    className="w-8 h-8 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: color.value,
                      borderColor: selectedColor === color.value ? 'white' : 'transparent',
                      boxShadow: selectedColor === color.value ? `0 0 0 2px ${color.value}` : 'none',
                    }}
                    data-testid={`color-swatch-${color.label.toLowerCase()}`}
                  />
                ))}
              </div>
            </div>

            {/* Cover Photo Picker */}
            <div>
              <Label>Cover Photo (Optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">Choose a photo to display at the top of this scrimmage</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {SCRIMMAGE_COVER_OPTIONS.map((option) => {
                  const isSelected = form.watch('coverPhoto') === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => form.setValue('coverPhoto', isSelected ? null : option.id)}
                      className="relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all"
                      style={{
                        width: 120,
                        aspectRatio: '16/9',
                        borderColor: isSelected ? 'hsl(var(--primary))' : 'transparent',
                        boxShadow: isSelected ? '0 0 0 2px hsl(var(--primary))' : 'none',
                      }}
                      title={option.label}
                    >
                      <img src={option.src} alt={option.label} className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="bg-primary rounded-full p-1">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date</Label>
                <div className="relative" ref={datePickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="w-full h-10 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-left flex items-center justify-between"
                    data-testid="button-date"
                  >
                    <span className={form.watch('date') ? 'text-foreground' : 'text-muted-foreground'}>
                      {form.watch('date') ? (() => {
                        const [year, month, day] = form.watch('date').split('-');
                        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                      })() : 'Select date'}
                    </span>
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {showDatePicker && (
                    <div className="absolute z-[9999] mt-1 bg-white dark:bg-zinc-800 border border-border rounded-lg shadow-lg">
                      <DayPicker
                        mode="single"
                        selected={form.watch('date') ? (() => {
                          const [year, month, day] = form.watch('date').split('-');
                          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                        })() : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const dateString = `${year}-${month}-${day}`;
                            form.setValue('date', dateString);
                            setShowDatePicker(false);
                          }
                        }}
                        disabled={{ before: new Date() }}
                        className="p-2"
                        classNames={{
                          today: "rdp-cell_today bg-primary/20 text-black dark:text-white font-semibold text-sm w-8 h-8",
                          selected: "rdp-cell_selected bg-primary text-white font-semibold text-sm w-8 h-8",
                          root: "text-black dark:text-white text-sm",
                          day: "text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 text-sm w-8 h-8 flex items-center justify-center cursor-pointer rounded",
                          nav_button: "text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 w-7 h-7 flex items-center justify-center rounded",
                          caption: "text-black dark:text-white font-medium text-sm mb-1",
                          head_cell: "text-black dark:text-white font-medium text-xs p-1",
                          table: "w-full border-collapse",
                          cell: "text-center p-0.5",
                        } as any}
                      />
                    </div>
                  )}
                </div>
                {form.formState.errors.date && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="time">Time</Label>
                <div className="relative" ref={timePickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowTimePicker(!showTimePicker)}
                    className="w-full h-10 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-left flex items-center justify-between"
                    data-testid="button-time"
                  >
                    <span className={form.watch('time') ? 'text-foreground' : 'text-muted-foreground'}>
                      {form.watch('time') ? (() => {
                        const [hours, minutes] = form.watch('time').split(':');
                        const hour12 = parseInt(hours) === 0 ? 12 : parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
                        const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
                        return `${hour12}:${minutes} ${ampm}`;
                      })() : 'Select time'}
                    </span>
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {showTimePicker && (
                    <div className="absolute right-0 z-[9999] mt-1 bg-white dark:bg-zinc-800 border border-border rounded-lg shadow-lg min-w-[280px] max-w-[calc(100vw-1rem)]">
                      <div className="p-4">
                        <div className="flex items-start justify-center gap-3">
                          <div className="flex flex-col items-center">
                            <div className="text-sm font-semibold mb-1 text-foreground">Hour</div>
                            <div className="h-32 w-12 overflow-y-auto hairline elev-rest rounded-lg bg-card">
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => {
                                const currentTime = form.watch('time') || '12:00';
                                const currentHour24 = parseInt(currentTime.split(':')[0]);
                                const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                const isSelected = currentHour12 === hour;
                                
                                return (
                                  <button
                                    key={hour}
                                    type="button"
                                    onClick={() => {
                                      const currentTimeVal = form.watch('time') || '12:00';
                                      const [, minutes] = currentTimeVal.split(':');
                                      const currHour24 = parseInt(currentTimeVal.split(':')[0]);
                                      const isCurrentlyPM = currHour24 >= 12;
                                      let newHour24;
                                      if (isCurrentlyPM && hour !== 12) {
                                        newHour24 = hour + 12;
                                      } else if (!isCurrentlyPM && hour === 12) {
                                        newHour24 = 0;
                                      } else if (isCurrentlyPM && hour === 12) {
                                        newHour24 = 12;
                                      } else {
                                        newHour24 = hour;
                                      }
                                      form.setValue('time', `${String(newHour24).padStart(2, '0')}:${minutes}`);
                                       form.setValue('timeTbd', false);
                                    }}
                                    className={`w-full h-8 flex items-center justify-center text-sm font-medium hover:bg-primary/10 transition-colors ${
                                      isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground'
                                    }`}
                                  >
                                    {hour}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex items-center text-xl font-bold text-muted-foreground mt-1">:</div>
                          <div className="flex flex-col items-center">
                            <div className="text-sm font-semibold mb-1 text-foreground">Min</div>
                            <div className="h-32 w-12 overflow-y-auto hairline elev-rest rounded-lg bg-card">
                              {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => {
                                const currentTime = form.watch('time') || '12:00';
                                const currentMinute = parseInt(currentTime.split(':')[1]);
                                const isSelected = currentMinute === minute;
                                
                                return (
                                  <button
                                    key={minute}
                                    type="button"
                                    onClick={() => {
                                      const currentTimeVal = form.watch('time') || '12:00';
                                      const [hours] = currentTimeVal.split(':');
                                      form.setValue('time', `${hours}:${String(minute).padStart(2, '0')}`);
                                       form.setValue('timeTbd', false);
                                    }}
                                    className={`w-full h-8 flex items-center justify-center text-sm font-medium hover:bg-primary/10 transition-colors ${
                                      isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground'
                                    }`}
                                  >
                                    {String(minute).padStart(2, '0')}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="text-sm font-semibold mb-1 text-foreground">Period</div>
                            <div className="flex flex-col gap-2">
                              {['AM', 'PM'].map((period) => {
                                const currentTime = form.watch('time') || '12:00';
                                const currentHour24 = parseInt(currentTime.split(':')[0]);
                                const isCurrentlyPM = currentHour24 >= 12;
                                const isSelected = (period === 'PM' && isCurrentlyPM) || (period === 'AM' && !isCurrentlyPM);
                                
                                return (
                                  <button
                                    key={period}
                                    type="button"
                                    onClick={() => {
                                      const currentTimeVal = form.watch('time') || '12:00';
                                      const [hours, minutes] = currentTimeVal.split(':');
                                      const currHour24 = parseInt(hours);
                                      const currentHour12 = currHour24 === 0 ? 12 : currHour24 > 12 ? currHour24 - 12 : currHour24;
                                      let newHour24;
                                      if (period === 'AM' && currentHour12 === 12) {
                                        newHour24 = 0;
                                      } else if (period === 'AM') {
                                        newHour24 = currentHour12;
                                      } else if (period === 'PM' && currentHour12 === 12) {
                                        newHour24 = 12;
                                      } else {
                                        newHour24 = currentHour12 + 12;
                                      }
                                      form.setValue('time', `${String(newHour24).padStart(2, '0')}:${minutes}`);
                                       form.setValue('timeTbd', false);
                                    }}
                                    className={`w-12 h-8 flex items-center justify-center text-sm font-semibold hover:bg-primary/10 rounded transition-colors ${
                                      isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground border border-border'
                                    }`}
                                  >
                                    {period}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTimePicker(false)}
                          className="w-full mt-1 py-1 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {form.formState.errors.time && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.time.message}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id="time-tbd"
                    checked={!!form.watch('timeTbd')}
                    onCheckedChange={(checked) => {
                      form.setValue('timeTbd', !!checked);
                      if (checked) {
                        form.setValue('time', '');
                        setShowTimePicker(false);
                      }
                    }}
                    data-testid="checkbox-time-tbd"
                  />
                  <Label htmlFor="time-tbd" className="cursor-pointer text-sm font-normal">
                    Time TBD — I’ll set this occurrence’s time later
                  </Label>
                </div>
                {!!form.watch('timeTbd') && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Invitations and reminders will stay queued until you select a time.
                  </p>
                )}
              </div>
            </div>

            {/* Recurring Event Settings */}
            <div className="space-y-1 p-4 bg-muted/30 rounded-lg hairline elev-rest pt-[4px] pb-[4px]">
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
                <div className="space-y-1 pt-1">
                  {/* Recurrence Type */}
                  <div>
                    <Label>Repeat</Label>
                    <RadioGroup
                      value={form.watch('recurrenceType')}
                      onValueChange={(value: any) => form.setValue('recurrenceType', value)}
                      className="flex gap-4 mt-1"
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
                      <div className="flex flex-wrap gap-2 mt-1">
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
                      className="space-y-1 mt-1"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="never" id="endNever" data-testid="radio-end-never" />
                        <Label htmlFor="endNever" className="font-normal cursor-pointer">Never</Label>
                        <span className="text-xs text-muted-foreground">(repeats indefinitely)</span>
                      </div>
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

            {/* Send Invite Now Option */}
            {(!isEditMode || existingScrimmage?.hasDeferredInvites) && (form.watch('timeTbd') ? (
              <div className="space-y-1 p-4 bg-amber-500/10 rounded-lg border border-amber-500/30 pt-[4px] pb-[4px]">
                <Label className="text-base">Invitations saved for later</Label>
                <p className="text-sm text-muted-foreground">
                  Your invitees will not be notified until this specific scrimmage has a time.
                </p>
              </div>
            ) : (
              <div className="space-y-1 p-4 bg-green-500/10 rounded-lg border border-green-500/30 pt-[4px] pb-[4px]">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="sendInviteNow" className="text-base">
                      {isEditMode ? 'Send saved invitations now' : 'Send Invite Now'}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {isEditMode
                        ? 'Deliver this occurrence’s pending invitations after you save.'
                        : 'Immediately notify selected members when this scrimmage is created'}
                    </p>
                  </div>
                  <Switch
                    id="sendInviteNow"
                    checked={form.watch('sendInviteNow')}
                    onCheckedChange={(checked) => form.setValue('sendInviteNow', checked)}
                    data-testid="switch-send-invite-now"
                  />
                </div>
              </div>
            ))}

            {/* Invitation Scheduling for Recurring Scrimmages */}
            {form.watch('isRecurring') && (
              <div className="space-y-1 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableInviteScheduling" className="text-base">Schedule Future Invitations</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically send invitations before each recurring occurrence
                    </p>
                  </div>
                  <Switch
                    id="enableInviteScheduling"
                    checked={form.watch('enableInviteScheduling')}
                    onCheckedChange={(checked) => form.setValue('enableInviteScheduling', checked)}
                    data-testid="switch-enable-invite-scheduling"
                  />
                </div>

                {form.watch('enableInviteScheduling') && (
                  <div className="space-y-1 pt-1">
                    <div className="bg-muted/50 rounded-md p-3">
                      <p className="text-sm text-foreground font-medium mb-1">How it works:</p>
                      <p className="text-xs text-muted-foreground">
                        For each recurring scrimmage, a separate invitation will be sent to all league members at your scheduled time. 
                        For example, if you have a Friday scrimmage and set invites to go out 5 days before at 9:00 AM, 
                        invites will be sent every Sunday morning.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="inviteDaysBefore" className="text-sm font-medium">Send invites</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id="inviteDaysBefore"
                            type="number"
                            {...form.register('inviteDaysBefore', { valueAsNumber: true })}
                            className="w-20"
                            min={1}
                            max={14}
                            data-testid="input-invite-days-before"
                          />
                          <span className="text-sm text-muted-foreground">days before each scrimmage</span>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="inviteTimeOfDay" className="text-sm font-medium">At time</Label>
                        <Input
                          id="inviteTimeOfDay"
                          type="time"
                          {...form.register('inviteTimeOfDay')}
                          className="mt-1"
                          data-testid="input-invite-time"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reminder Settings */}
            <div className="space-y-1 p-4 bg-muted/30 rounded-lg hairline elev-rest pt-[4px] pb-[4px]">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enableReminders" className="text-base">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">Remind approved players and follow up once with invitees who have not responded</p>
                </div>
                <Switch
                  id="enableReminders"
                  checked={form.watch('enableReminders')}
                  onCheckedChange={(checked) => form.setValue('enableReminders', checked)}
                  data-testid="switch-enable-reminders"
                />
              </div>

              {form.watch('enableReminders') && (
                <div className="pt-1">
                  <p className="text-sm text-muted-foreground">
                    Approved-player reminders use your schedule. Unanswered invitees receive one additional push 24 hours before the scrimmage.
                  </p>
                </div>
              )}
            </div>

            {/* Approval Method — intentionally adjacent to push settings */}
            <div className="bg-card rounded-xl hairline elev-rest p-4 mt-3">
              <Label className="text-sm font-semibold block mb-3">Approval Method</Label>
              <RadioGroup
                value={joinMode}
                onValueChange={(value) => setJoinMode(value as 'approval' | 'first_come' | 'first_pay')}
                className="space-y-2"
                data-testid="radio-group-join-mode"
              >
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                  <RadioGroupItem value="first_come" id="join-first-come" />
                  <span><span className="block font-medium">First to RSVP</span><span className="text-xs text-muted-foreground">Players claim open spots immediately.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                  <RadioGroupItem value="approval" id="join-approval" />
                  <span><span className="block font-medium">Manual Approval</span><span className="text-xs text-muted-foreground">You approve each player before they join.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                  <RadioGroupItem value="first_pay" id="join-first-pay" />
                  <span><span className="block font-medium">First to Pay, First to Play</span><span className="text-xs text-muted-foreground">Payment must be recorded before a player receives a spot.</span></span>
                </label>
              </RadioGroup>
            </div>
          </div>
        </div>

        {/* Rink Information */}
        <div className="rounded-xl hairline elev-rest p-6 bg-[#e2e2e2] dark:bg-[#212121] text-[#212121] dark:text-[#ffffff] pt-[4px] pb-[4px] pl-[4px] pr-[4px] mt-[8px] mb-[8px]">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Rink Information
          </h3>
          
          <div className="space-y-1">
            <div>
              <Label htmlFor="venue">Rink</Label>
              <RinkPickerField
                onSelect={(rink) => {
                  form.setValue('venue', rink ? rink.name : '');
                  setSelectedRinkFacilityId(rink ? rink.facilityId : null);
                }}
                initialSelection={
                  leagueFacility
                    ? { facilityId: leagueFacility.id, name: leagueFacility.name, address: leagueFacility.address || '' }
                    : undefined
                }
              />
              {form.formState.errors.venue && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.venue.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="maxParticipants">Max Participants</Label>
              <Input
                id="maxParticipants"
                type="number"
                min={2}
                max={50}
                step={1}
                {...form.register('maxParticipants', { valueAsNumber: true })}
                data-testid="input-max-participants"
              />
              {form.formState.errors.maxParticipants && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.maxParticipants.message}</p>
              )}
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
                {joinMode === 'first_pay'
                  ? 'Players receive a payment request before their spot is approved. Cash payment is also accepted.'
                  : "If there's a cost, you can create a payment request after approval"}
              </p>
              {form.formState.errors.costPerPlayer && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.costPerPlayer.message}</p>
              )}
            </div>

            <div className="pt-1">
              <p className="text-sm text-muted-foreground mb-1\.5 font-bold">
                By default, players will pay you using the Venmo and Cash App handles
                on your profile. These payment destinations are optional for cash
                payments. Use the overrides to send payments for this scrimmage
                somewhere else (for example, a team treasurer).
              </p>

              <div className="space-y-1\.5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Checkbox
                      id="toggleVenmo"
                      checked={showVenmoOverride}
                      onCheckedChange={(checked) => {
                        setShowVenmoOverride(!!checked);
                        if (!checked) form.setValue('venmoLinkOverride', '');
                      }}
                      data-testid="checkbox-venmo-override"
                    />
                    <Label htmlFor="toggleVenmo" className="cursor-pointer">Override Venmo link</Label>
                  </div>
                  {showVenmoOverride && (
                    <>
                      <Input
                        id="venmoLinkOverride"
                        {...form.register('venmoLinkOverride')}
                        type="text"
                        placeholder="@treasurer or https://venmo.com/treasurer"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-testid="input-venmo-link-override"
                      />
                      {form.formState.errors.venmoLinkOverride && (
                        <p className="text-sm text-destructive mt-1" data-testid="error-venmo-link-override">
                          {form.formState.errors.venmoLinkOverride.message as string}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Checkbox
                      id="toggleCashApp"
                      checked={showCashAppOverride}
                      onCheckedChange={(checked) => {
                        setShowCashAppOverride(!!checked);
                        if (!checked) form.setValue('cashappLinkOverride', '');
                      }}
                      data-testid="checkbox-cashapp-override"
                    />
                    <Label htmlFor="toggleCashApp" className="cursor-pointer">Override Cash App link</Label>
                  </div>
                  {showCashAppOverride && (
                    <>
                      <Input
                        id="cashappLinkOverride"
                        {...form.register('cashappLinkOverride')}
                        type="text"
                        placeholder="$treasurer or https://cash.app/$treasurer"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-testid="input-cashapp-link-override"
                      />
                      {form.formState.errors.cashappLinkOverride && (
                        <p className="text-sm text-destructive mt-1" data-testid="error-cashapp-link-override">
                          {form.formState.errors.cashappLinkOverride.message as string}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Co-Host Selection - Global user search */}
        <div className="rounded-xl hairline elev-rest p-6 bg-[#e2e2e2] dark:bg-[#212121] pt-[4px] pb-[4px] pl-[8px] pr-[8px] mt-[8px] mb-[8px]">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Add Co-Hosts (Optional)
          </h3>
          <p className="text-sm text-muted-foreground mb-1">
            Co-hosts can help manage this scrimmage — approve players, send reminders, and collect payments
          </p>

          {/* Selected co-host badges */}
          {(selectedCoHostIds.length > 0 || coHostEmails.length > 0) && (
            <div className="mb-1 flex flex-wrap gap-2">
              {selectedCoHostUsers.map(u => (
                <Badge key={u.id} variant="secondary" className="flex items-center gap-1 pr-1">
                  <Crown className="w-3 h-3" />
                  {u.firstName} {u.lastName}
                  {u.isAtRink && (
                    <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded px-1">At rink</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCoHostIds(ids => ids.filter(id => id !== u.id));
                      setSelectedCoHostUsers(users => users.filter(x => x.id !== u.id));
                      form.setValue('coHostIds', selectedCoHostIds.filter(id => id !== u.id));
                    }}
                    className="ml-1 hover:bg-muted rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {coHostEmails.map(email => (
                <Badge key={email} variant="secondary" className="flex items-center gap-1 pr-1">
                  <Mail className="w-3 h-3" />
                  {email}
                  <button
                    type="button"
                    onClick={() => setCoHostEmails(emails => emails.filter(e => e !== email))}
                    className="ml-1 hover:bg-muted rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Search input with dropdown */}
          <div className="relative" ref={coHostSearchRef}>
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={coHostSearchTerm}
              onChange={(e) => {
                setCoHostSearchTerm(e.target.value);
                setShowCoHostDropdown(true);
              }}
              onFocus={() => setShowCoHostDropdown(true)}
              data-testid="input-cohost-search"
            />

            {showCoHostDropdown && coHostSearchTerm.trim().length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                {coHostSearchLoading ? (
                  <div className="p-3 text-center text-muted-foreground text-sm">Searching…</div>
                ) : (() => {
                  const available = coHostSearchResults.filter(
                    u => !selectedCoHostIds.includes(u.id)
                  );
                  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coHostSearchTerm.trim());
                  const emailAlreadySelected = coHostEmails.includes(coHostSearchTerm.trim());
                  const emailHasAccount = coHostSearchResults.some(u => u.email?.toLowerCase() === coHostSearchTerm.trim().toLowerCase());

                  return (
                    <>
                      {available.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedCoHostIds(ids => [...ids, u.id]);
                            setSelectedCoHostUsers(users => [...users, u]);
                            form.setValue('coHostIds', [...selectedCoHostIds, u.id]);
                            setCoHostSearchTerm('');
                            setShowCoHostDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                          data-testid={`cohost-option-${u.id}`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.profileImageUrl || undefined} />
                            <AvatarFallback className="text-xs">
                              {u.firstName?.[0]}{u.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{u.firstName} {u.lastName}</span>
                            {u.email && <span className="block text-xs text-muted-foreground truncate">{u.email}</span>}
                          </div>
                          {u.isAtRink && (
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5 shrink-0">At this rink</span>
                          )}
                        </button>
                      ))}
                      {isValidEmail && !emailHasAccount && !emailAlreadySelected && (
                        <button
                          type="button"
                          onClick={() => {
                            setCoHostEmails(emails => [...emails, coHostSearchTerm.trim()]);
                            setCoHostSearchTerm('');
                            setShowCoHostDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left border-t border-border"
                        >
                          <Mail className="w-5 h-5 text-muted-foreground shrink-0" />
                          <div>
                            <span className="font-medium">Invite</span> <span className="text-muted-foreground">{coHostSearchTerm.trim()}</span>
                            <span className="block text-xs text-muted-foreground">They'll get a welcome email to join Rosters</span>
                          </div>
                        </button>
                      )}
                      {available.length === 0 && (!isValidEmail || emailHasAccount || emailAlreadySelected) && (
                        <div className="p-3 text-center text-muted-foreground text-sm">No users found</div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Member Selection - Only show if user has leagues */}
        {selectedLeague ? (
          <div className="rounded-xl hairline elev-rest p-6 bg-[#e2e2e2] dark:bg-[#212121] pt-[4px] pb-[4px] mt-[8px] mb-[8px] pl-[8px] pr-[8px]">
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Invite Members
            </h3>

          {/* Invite Group Selector - Always shown at top */}
          <div className="mb-1\.5 p-4 bg-muted/30 rounded-lg hairline elev-rest">
            <Label htmlFor="invite-group" className="text-base font-semibold mb-1 block">
              Add Saved Invite Groups
            </Label>
            {(inviteGroups as any[]).length > 0 ? (
              <div className="space-y-1">
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
                        <SelectItem key={group.id} value={group.id} disabled={loadedInviteGroupIds.includes(group.id)}>
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
                {loadedInviteGroupIds.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Future recurring invites use live membership from every linked group.
                    </p>
                    <div className="flex flex-wrap gap-2" data-testid="selected-invite-groups">
                      {loadedInviteGroupIds.map((groupId) => {
                        const group = (inviteGroups as any[]).find((item: any) => item.id === groupId);
                        return (
                          <Badge key={groupId} variant="secondary" className="gap-1 py-1 pl-2 pr-1">
                            <span>{group?.name || 'Saved group'}</span>
                            <button
                              type="button"
                              className="rounded-full p-0.5 hover:bg-background/70"
                              onClick={() => unlinkInviteGroup(groupId)}
                              aria-label={`Remove ${group?.name || 'invite group'}`}
                              data-testid={`button-unlink-group-${groupId}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
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

          {/* Total selected count + clear all */}
          <div className="mb-1\.5 flex items-center justify-between">
            <p className="text-sm text-muted-foreground" data-testid="text-selected-count">
              {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={deselectAllMembers} disabled={selectedMemberIds.length === 0} data-testid="button-deselect-all">
              Clear All
            </Button>
          </div>

          {/* Goalies picker button */}
          {(() => {
            const selectedGoalieCount = filteredGoalies.filter((m: any) => selectedMemberIds.includes(m.user.id)).length;
            return (
              <div className="mb-3">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 active:bg-muted transition-colors text-left"
                  onClick={() => setGoaliePickerOpen(true)}
                  data-testid="button-open-goalie-picker"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShieldHalf className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Select your Goalies</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {membersLoading
                        ? 'Loading…'
                        : selectedGoalieCount > 0
                          ? `${selectedGoalieCount} goalie${selectedGoalieCount !== 1 ? 's' : ''} selected`
                          : `${filteredGoalies.length} available`}
                    </p>
                  </div>
                  {selectedGoalieCount > 0 && (
                    <Badge className="shrink-0">{selectedGoalieCount}</Badge>
                  )}
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>

                {/* Goalie picker dialog */}
                <Dialog open={goaliePickerOpen} onOpenChange={(open) => { setGoaliePickerOpen(open); if (!open) setGoalieSearchTerm(""); }}>
                  <DialogContent className="flex flex-col w-full max-w-lg p-0 gap-0 h-[85vh] max-h-[85vh]" data-testid="dialog-goalie-picker">
                    <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
                      <DialogTitle className="flex items-center gap-2">
                        <ShieldHalf className="w-5 h-5 text-primary" />
                        Select Goalies
                      </DialogTitle>
                    </DialogHeader>

                    {/* Search + actions — fixed, never scrolls */}
                    <div className="px-4 pt-3 pb-2 border-b border-border shrink-0 space-y-2">
                      <Input
                        placeholder="Search goalies…"
                        value={goalieSearchTerm}
                        onChange={(e) => setGoalieSearchTerm(e.target.value)}
                        data-testid="input-search-goalies"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {filteredGoalies.filter((m: any) => selectedMemberIds.includes(m.user.id)).length} of {filteredGoalies.length} selected
                        </p>
                        <div className="flex gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={selectAllGoalies} disabled={filteredGoalies.length === 0} data-testid="button-select-all-goalies">Select All</Button>
                          <Button type="button" variant="outline" size="sm" onClick={deselectAllGoalies} disabled={!filteredGoalies.some((m: any) => selectedMemberIds.includes(m.user.id))} data-testid="button-deselect-goalies">Deselect</Button>
                        </div>
                      </div>
                    </div>

                    {/* Scrollable list — fills remaining space */}
                    <div className="flex-1 overflow-y-auto px-4 py-2">
                      {membersLoading ? (
                        <div className="space-y-1 pt-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                              <div className="w-8 h-8 bg-muted rounded-full" />
                              <div className="h-4 bg-muted rounded w-1/2" />
                            </div>
                          ))}
                        </div>
                      ) : filteredGoalies.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          {goalieSearchTerm ? 'No goalies found' : 'No goalies in this league'}
                        </div>
                      ) : (
                        <div className="space-y-1 pb-2">
                          {filteredGoalies.map((member: any) => (
                            <div
                              key={member.user.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 active:bg-muted cursor-pointer"
                              onClick={() => toggleMemberSelection(member.user.id)}
                              data-testid={`goalie-item-${member.user.id}`}
                            >
                              <Checkbox
                                checked={selectedMemberIds.includes(member.user.id)}
                                onCheckedChange={() => toggleMemberSelection(member.user.id)}
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`checkbox-goalie-${member.user.id}`}
                              />
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={member.user.profileImageUrl || undefined} />
                                <AvatarFallback className="text-xs">{member.user.firstName?.[0]}{member.user.lastName?.[0]}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm" data-testid={`text-goalie-name-${member.user.id}`}>
                                {member.user.firstName} {member.user.lastName}
                                {member.user.id === (user as any)?.id && <span className="text-muted-foreground text-xs ml-1">(Myself)</span>}
                                {member.isPlaceholder && <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 leading-tight text-muted-foreground">Placeholder</Badge>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Done button — fixed at bottom */}
                    <div className="px-4 py-3 border-t border-border shrink-0">
                      <Button type="button" className="w-full" onClick={() => { setGoaliePickerOpen(false); setGoalieSearchTerm(""); }} data-testid="button-done-goalies">
                        Done
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            );
          })()}

          {/* Skaters picker button */}
          {(() => {
            const selectedSkaterCount = filteredSkaters.filter((m: any) => selectedMemberIds.includes(m.user.id)).length;
            return (
              <div className="mb-3">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 active:bg-muted transition-colors text-left"
                  onClick={() => setSkaterPickerOpen(true)}
                  data-testid="button-open-skater-picker"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <PersonStanding className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Select your Skaters</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {membersLoading
                        ? 'Loading…'
                        : selectedSkaterCount > 0
                          ? `${selectedSkaterCount} skater${selectedSkaterCount !== 1 ? 's' : ''} selected`
                          : `${filteredSkaters.length} available`}
                    </p>
                  </div>
                  {selectedSkaterCount > 0 && (
                    <Badge className="shrink-0">{selectedSkaterCount}</Badge>
                  )}
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>

                {/* Skater picker dialog */}
                <Dialog open={skaterPickerOpen} onOpenChange={(open) => { setSkaterPickerOpen(open); if (!open) setSkaterSearchTerm(""); }}>
                  <DialogContent className="flex flex-col w-full max-w-lg p-0 gap-0 h-[85vh] max-h-[85vh]" data-testid="dialog-skater-picker">
                    <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
                      <DialogTitle className="flex items-center gap-2">
                        <PersonStanding className="w-5 h-5 text-primary" />
                        Select Skaters
                      </DialogTitle>
                    </DialogHeader>

                    {/* Search + actions — fixed, never scrolls */}
                    <div className="px-4 pt-3 pb-2 border-b border-border shrink-0 space-y-2">
                      <Input
                        placeholder="Search skaters…"
                        value={skaterSearchTerm}
                        onChange={(e) => setSkaterSearchTerm(e.target.value)}
                        data-testid="input-search-skaters"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {filteredSkaters.filter((m: any) => selectedMemberIds.includes(m.user.id)).length} of {filteredSkaters.length} selected
                        </p>
                        <div className="flex gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={selectAllSkaters} disabled={filteredSkaters.length === 0} data-testid="button-select-all-skaters">Select All</Button>
                          <Button type="button" variant="outline" size="sm" onClick={deselectAllSkaters} disabled={!filteredSkaters.some((m: any) => selectedMemberIds.includes(m.user.id))} data-testid="button-deselect-skaters">Deselect</Button>
                        </div>
                      </div>
                    </div>

                    {/* Scrollable list — fills remaining space */}
                    <div className="flex-1 overflow-y-auto px-4 py-2">
                      {membersLoading ? (
                        <div className="space-y-1 pt-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                              <div className="w-8 h-8 bg-muted rounded-full" />
                              <div className="h-4 bg-muted rounded w-1/2" />
                            </div>
                          ))}
                        </div>
                      ) : filteredSkaters.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          {skaterSearchTerm ? 'No skaters found' : 'No skaters in this league'}
                        </div>
                      ) : (
                        <div className="space-y-1 pb-2">
                          {filteredSkaters.map((member: any) => (
                            <div
                              key={member.user.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 active:bg-muted cursor-pointer"
                              onClick={() => toggleMemberSelection(member.user.id)}
                              data-testid={`skater-item-${member.user.id}`}
                            >
                              <Checkbox
                                checked={selectedMemberIds.includes(member.user.id)}
                                onCheckedChange={() => toggleMemberSelection(member.user.id)}
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`checkbox-skater-${member.user.id}`}
                              />
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={member.user.profileImageUrl || undefined} />
                                <AvatarFallback className="text-xs">{member.user.firstName?.[0]}{member.user.lastName?.[0]}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm" data-testid={`text-skater-name-${member.user.id}`}>
                                {member.user.firstName} {member.user.lastName}
                                {member.user.id === (user as any)?.id && <span className="text-muted-foreground text-xs ml-1">(Myself)</span>}
                                {member.isPlaceholder && <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 leading-tight text-muted-foreground">Placeholder</Badge>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Done button — fixed at bottom */}
                    <div className="px-4 py-3 border-t border-border shrink-0">
                      <Button type="button" className="w-full" onClick={() => { setSkaterPickerOpen(false); setSkaterSearchTerm(""); }} data-testid="button-done-skaters">
                        Done
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            );
          })()}

          {/* Email Invites Section */}
          <div className="mt-1\.5 border-t border-border pt-1\.5">
            <Label className="text-base mb-1\.5 block">
              <Mail className="inline-block w-4 h-4 mr-2" />
              Invite by Email
            </Label>
            <p className="text-sm text-muted-foreground mb-1">
              Invite users who aren't in the league yet
            </p>

            {/* Email Search */}
            <div className="mb-1">
              <Label htmlFor="email-search" className="text-sm">Search by email</Label>
              <Input
                id="email-search"
                type="email"
                placeholder="Search existing users..."
                value={emailSearchTerm}
                onChange={(e) => setEmailSearchTerm(e.target.value)}
                className="mt-1"
                data-testid="input-search-email"
              />
              
              {/* Email Search Results */}
              {emailSearchTerm.length > 2 && (
                <div className="mt-1 border border-border rounded-md max-h-32 overflow-y-auto">
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
            <div className="mb-1">
              <Label htmlFor="manual-email" className="text-sm">Or enter email manually</Label>
              <div className="flex gap-2 mt-1">
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
                <Label className="text-sm mb-1 block">Email Invites ({selectedEmails.length})</Label>
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
              <p className="text-sm text-destructive mt-1">Please select at least one member or add an email invite</p>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl hairline elev-rest p-6">
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <Users className="w-5 h-5" />
              League Required
            </h3>
            <div className="text-center py-1 text-muted-foreground">
              <p className="mb-1">You need to join a league before you can schedule scrimmages.</p>
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

      </form>
      <FixedBottomButton>
        {submitError && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            data-testid="alert-create-scrimmage-validation"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}
        <Button
          type="submit"
          form="create-scrimmage-form"
          size="lg"
          className="w-full"
          disabled={
            createScrimmageRequest.isPending || 
            scrimmageLoading
          }
          data-testid="button-create-scrimmage"
        >
          {createScrimmageRequest.isPending 
            ? (isEditMode ? 'Updating...' : 'Creating...') 
            : isEditMode
              ? 'Update Scrimmage'
              : !selectedLeague?.id 
                ? 'Join a League First' 
                : 'Create Scrimmage'
          }
        </Button>
      </FixedBottomButton>
    </div>
  );
}