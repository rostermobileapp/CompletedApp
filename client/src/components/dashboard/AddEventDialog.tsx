import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { User, League } from '@shared/schema';

interface UserTeam {
  id: string;
  name: string;
  captainId?: string | null;
  leagueId?: string | null;
  league?: { name: string } | null;
}

// Calendar color palette shared with the Scrimmage Schedule screen so events
// styled here match the swatches in CreateScrimmage.
const EVENT_COLORS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#14b8a6', label: 'Teal' },
];
const DEFAULT_EVENT_COLOR = EVENT_COLORS[4].value; // Blue

const personalReminderSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, 'Date and time are required'),
  color: z.string().optional(),
});

const teamGameSchema = z.object({
  teamId: z.string().min(1, 'Team is required'),
  opponentName: z.string().min(1, 'Opponent name is required'),
  scheduledAt: z.string().min(1, 'Date and time are required'),
  venue: z.string().optional(),
  notes: z.string().optional(),
  color: z.string().optional(),
});

const generalEventSchema = z.object({
  teamId: z.string().min(1, 'Team is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, 'Date and time are required'),
  endTime: z.string().optional(),
  location: z.string().optional(),
  color: z.string().optional(),
});

const scrimmageEventSchema = z.object({
  teamId: z.string().min(1, 'Team is required'),
  title: z.string().min(1, 'Title is required'),
  scheduledAt: z.string().min(1, 'Date and time are required'),
  endTime: z.string().optional(),
  location: z.string().optional(),
  isInternalScrimmage: z.boolean().default(true),
  opponentName: z.string().optional(),
  notes: z.string().optional(),
  color: z.string().optional(),
});

interface CalendarColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  testIdPrefix: string;
}

/**
 * Inline calendar color picker shared by all four event-creation forms in the
 * AddEventDialog. Mirrors the swatch UI used on the Scrimmage Schedule screen.
 */
function CalendarColorPicker({ value, onChange, testIdPrefix }: CalendarColorPickerProps) {
  return (
    <div data-testid={`${testIdPrefix}-color-picker`}>
      <label className="text-sm font-medium leading-none">Calendar Color</label>
      <p className="text-xs text-muted-foreground mt-1 mb-2">
        Choose a color to identify this event on the calendar
      </p>
      <div className="flex gap-2 flex-wrap">
        {EVENT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            title={color.label}
            onClick={() => onChange(color.value)}
            className="w-8 h-8 rounded-full border-2 transition-all"
            style={{
              backgroundColor: color.value,
              borderColor: value === color.value ? 'white' : 'transparent',
              boxShadow: value === color.value ? `0 0 0 2px ${color.value}` : 'none',
            }}
            data-testid={`${testIdPrefix}-color-swatch-${color.label.toLowerCase()}`}
            aria-label={color.label}
            aria-pressed={value === color.value}
          />
        ))}
      </div>
    </div>
  );
}

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shared add-event dialog flow used by both the new desktop home
 * (HomeDesktop) and any other surface that wants the same picker. Renders the
 * "Add Event" picker plus the four event-type form dialogs (reminder, team
 * game, general event, scrimmage). All data hooks here are tiny and reuse
 * cache keys already populated by the surrounding desktop home, so adding
 * this component does not introduce any new network requests on the desktop
 * code path.
 */
export function AddEventDialog({ open, onOpenChange }: AddEventDialogProps) {
  const { toast } = useToast();
  const [eventType, setEventType] = useState<
    'reminder' | 'game' | 'generalEvent' | 'scrimmage' | null
  >(null);

  // Only fetch the data the picker/forms need once the user has actually
  // opened (or is mid-flow inside) the dialog. This keeps the desktop home's
  // initial network panel limited to the queries owned by the cards.
  const queriesEnabled = open || eventType !== null;

  const { data: userProfile } = useQuery<User>({
    queryKey: ['/api/user'],
    enabled: queriesEnabled,
  });
  const { data: userTeams } = useQuery<UserTeam[]>({
    queryKey: ['/api/user/teams'],
    staleTime: 60_000,
    enabled: queriesEnabled,
  });
  const { data: userLeagues } = useQuery<League[]>({
    queryKey: ['/api/user/leagues'],
    staleTime: 60_000,
    enabled: queriesEnabled,
  });

  const userId = userProfile?.id;
  const isCaptain =
    Array.isArray(userTeams) && userId
      ? userTeams.some((t) => t.captainId === userId)
      : false;
  const isCommissioner =
    Array.isArray(userLeagues) && userId
      ? userLeagues.some((l) => l.commissionerId === userId)
      : false;
  const canScheduleGames = !!userId && (isCaptain || isCommissioner);

  const reminderForm = useForm<z.infer<typeof personalReminderSchema>>({
    resolver: zodResolver(personalReminderSchema),
    defaultValues: { title: '', description: '', scheduledAt: '', color: DEFAULT_EVENT_COLOR },
  });

  const gameForm = useForm<z.infer<typeof teamGameSchema>>({
    resolver: zodResolver(teamGameSchema),
    defaultValues: {
      teamId: '',
      opponentName: '',
      scheduledAt: '',
      venue: '',
      notes: '',
      color: DEFAULT_EVENT_COLOR,
    },
  });

  const generalEventForm = useForm<z.infer<typeof generalEventSchema>>({
    resolver: zodResolver(generalEventSchema),
    defaultValues: {
      teamId: '',
      title: '',
      description: '',
      scheduledAt: '',
      endTime: '',
      location: '',
      color: DEFAULT_EVENT_COLOR,
    },
  });

  const scrimmageEventForm = useForm<z.infer<typeof scrimmageEventSchema>>({
    resolver: zodResolver(scrimmageEventSchema),
    defaultValues: {
      teamId: '',
      title: '',
      scheduledAt: '',
      endTime: '',
      location: '',
      isInternalScrimmage: true,
      opponentName: '',
      notes: '',
      color: DEFAULT_EVENT_COLOR,
    },
  });

  const createReminderMutation = useMutation({
    mutationFn: async (data: z.infer<typeof personalReminderSchema>) => {
      await apiRequest('POST', '/api/personal-reminders', {
        ...data,
        scheduledAt: data.scheduledAt,
        color: data.color || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/personal-reminders'] });
      toast({
        title: 'Reminder Created',
        description: 'Your personal reminder has been added to your calendar.',
      });
      setEventType(null);
      reminderForm.reset();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create reminder. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const createGameMutation = useMutation({
    mutationFn: async (data: z.infer<typeof teamGameSchema>) => {
      await apiRequest('POST', '/api/games', {
        homeTeamId: data.teamId,
        awayTeamId: null,
        opponentName: data.opponentName,
        scheduledAt: data.scheduledAt,
        venue: data.venue || null,
        notes: data.notes || null,
        leagueId: null,
        color: data.color || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({
        title: 'Game Created',
        description: 'Your game has been added to the schedule.',
      });
      setEventType(null);
      gameForm.reset();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create game. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const createGeneralEventMutation = useMutation({
    mutationFn: async (data: z.infer<typeof generalEventSchema>) => {
      await apiRequest('POST', '/api/team-events', {
        teamId: data.teamId,
        eventType: 'general',
        title: data.title,
        description: data.description || null,
        scheduledAt: data.scheduledAt,
        endTime: data.endTime || null,
        location: data.location || null,
        color: data.color || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
      toast({
        title: 'Event Created',
        description: 'Your team event has been added to the calendar.',
      });
      setEventType(null);
      generalEventForm.reset();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create event. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const createScrimmageEventMutation = useMutation({
    mutationFn: async (data: z.infer<typeof scrimmageEventSchema>) => {
      await apiRequest('POST', '/api/team-events', {
        teamId: data.teamId,
        eventType: 'scrimmage',
        title: data.title,
        scheduledAt: data.scheduledAt,
        endTime: data.endTime || null,
        location: data.location || null,
        isInternalScrimmage: data.isInternalScrimmage,
        opponentName: data.isInternalScrimmage ? null : data.opponentName,
        notes: data.notes || null,
        color: data.color || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
      toast({
        title: 'Scrimmage Created',
        description: 'Your scrimmage has been added to the calendar.',
      });
      setEventType(null);
      scrimmageEventForm.reset();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create scrimmage. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <>
      {/* Add Event picker */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-[425px] bg-[#212121] text-white"
          data-testid="dialog-add-event"
        >
          <DialogHeader>
            <DialogTitle className="text-white" data-testid="text-add-event-title">
              Add Event
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button
              onClick={() => {
                setEventType('reminder');
                onOpenChange(false);
              }}
              className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl text-center px-3"
              data-testid="button-select-reminder"
            >
              Personal<br />Reminder
            </Button>
            {canScheduleGames && (
              <Button
                onClick={() => {
                  setEventType('game');
                  onOpenChange(false);
                }}
                className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl"
                data-testid="button-select-game"
              >
                Team Game
              </Button>
            )}
            {canScheduleGames && (
              <Button
                onClick={() => {
                  setEventType('generalEvent');
                  onOpenChange(false);
                }}
                className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl"
                data-testid="button-select-general-event"
              >
                General Event
              </Button>
            )}
            {canScheduleGames && (
              <Button
                onClick={() => {
                  setEventType('scrimmage');
                  onOpenChange(false);
                }}
                className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl"
                data-testid="button-select-scrimmage"
              >
                Scrimmage
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Personal Reminder Form */}
      <Dialog open={eventType === 'reminder'} onOpenChange={(o) => !o && setEventType(null)}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto"
          data-testid="dialog-create-reminder"
        >
          <DialogHeader>
            <DialogTitle data-testid="text-create-reminder-title">
              Create Personal Reminder
            </DialogTitle>
          </DialogHeader>
          <Form {...reminderForm}>
            <form
              onSubmit={reminderForm.handleSubmit((data) => createReminderMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={reminderForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Reminder title"
                        {...field}
                        data-testid="input-reminder-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add more details..."
                        {...field}
                        data-testid="input-reminder-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date & Time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-reminder-datetime"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <CalendarColorPicker
                      value={field.value || DEFAULT_EVENT_COLOR}
                      onChange={field.onChange}
                      testIdPrefix="reminder"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-reminder"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createReminderMutation.isPending}
                  data-testid="button-submit-reminder"
                >
                  {createReminderMutation.isPending ? 'Creating...' : 'Create Reminder'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Team Game Form */}
      <Dialog open={eventType === 'game'} onOpenChange={(o) => !o && setEventType(null)}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto"
          data-testid="dialog-create-game"
        >
          <DialogHeader>
            <DialogTitle data-testid="text-create-game-title">Create Team Game</DialogTitle>
          </DialogHeader>
          <Form {...gameForm}>
            <form
              onSubmit={gameForm.handleSubmit((data) => createGameMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={gameForm.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-game-team">
                          <SelectValue placeholder="Select your team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(userTeams) &&
                          userTeams.map((team) => (
                            <SelectItem
                              key={team.id}
                              value={team.id}
                              data-testid={`option-team-${team.id}`}
                            >
                              {team.leagueId && team.league
                                ? `${team.league.name}: ${team.name}`
                                : team.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="opponentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opponent Team</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Opponent team name"
                        {...field}
                        data-testid="input-game-opponent"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date & Time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-game-datetime"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="venue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rink (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Game location"
                        {...field}
                        data-testid="input-game-venue"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional information..."
                        {...field}
                        data-testid="input-game-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <CalendarColorPicker
                      value={field.value || DEFAULT_EVENT_COLOR}
                      onChange={field.onChange}
                      testIdPrefix="game"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-game"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createGameMutation.isPending}
                  data-testid="button-submit-game"
                >
                  {createGameMutation.isPending ? 'Creating...' : 'Create Game'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* General Event Form */}
      <Dialog open={eventType === 'generalEvent'} onOpenChange={(o) => !o && setEventType(null)}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto"
          data-testid="dialog-create-general-event"
        >
          <DialogHeader>
            <DialogTitle data-testid="text-create-general-event-title">
              Create Team Event
            </DialogTitle>
          </DialogHeader>
          <Form {...generalEventForm}>
            <form
              onSubmit={generalEventForm.handleSubmit((data) =>
                createGeneralEventMutation.mutate(data),
              )}
              className="space-y-4"
            >
              <FormField
                control={generalEventForm.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-general-event-team">
                          <SelectValue placeholder="Select your team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(userTeams) &&
                          userTeams.map((team) => (
                            <SelectItem
                              key={team.id}
                              value={team.id}
                              data-testid={`option-general-event-team-${team.id}`}
                            >
                              {team.leagueId && team.league
                                ? `${team.league.name}: ${team.name}`
                                : team.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Team Pizza Party, Team Meeting"
                        {...field}
                        data-testid="input-general-event-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add event details..."
                        {...field}
                        data-testid="input-general-event-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date & Time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-general-event-datetime"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-general-event-endtime"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Event location"
                        {...field}
                        data-testid="input-general-event-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <CalendarColorPicker
                      value={field.value || DEFAULT_EVENT_COLOR}
                      onChange={field.onChange}
                      testIdPrefix="general-event"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-general-event"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createGeneralEventMutation.isPending}
                  data-testid="button-submit-general-event"
                >
                  {createGeneralEventMutation.isPending ? 'Creating...' : 'Create Event'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Scrimmage Form */}
      <Dialog open={eventType === 'scrimmage'} onOpenChange={(o) => !o && setEventType(null)}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto"
          data-testid="dialog-create-scrimmage"
        >
          <DialogHeader>
            <DialogTitle data-testid="text-create-scrimmage-title">Create Scrimmage</DialogTitle>
          </DialogHeader>
          <Form {...scrimmageEventForm}>
            <form
              onSubmit={scrimmageEventForm.handleSubmit((data) =>
                createScrimmageEventMutation.mutate(data),
              )}
              className="space-y-4"
            >
              <FormField
                control={scrimmageEventForm.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-scrimmage-team">
                          <SelectValue placeholder="Select your team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(userTeams) &&
                          userTeams.map((team) => (
                            <SelectItem
                              key={team.id}
                              value={team.id}
                              data-testid={`option-scrimmage-team-${team.id}`}
                            >
                              {team.leagueId && team.league
                                ? `${team.league.name}: ${team.name}`
                                : team.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Scrimmage title"
                        {...field}
                        data-testid="input-scrimmage-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date & Time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-scrimmage-datetime"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-scrimmage-endtime"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Scrimmage location"
                        {...field}
                        data-testid="input-scrimmage-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="isInternalScrimmage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scrimmage Type</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === 'internal')}
                      value={field.value ? 'internal' : 'external'}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-scrimmage-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="internal">Internal (your team only)</SelectItem>
                        <SelectItem value="external">External (vs. opponent)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!scrimmageEventForm.watch('isInternalScrimmage') && (
                <FormField
                  control={scrimmageEventForm.control}
                  name="opponentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opponent Team</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Opponent team name"
                          {...field}
                          data-testid="input-scrimmage-opponent"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={scrimmageEventForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional information..."
                        {...field}
                        data-testid="input-scrimmage-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <CalendarColorPicker
                      value={field.value || DEFAULT_EVENT_COLOR}
                      onChange={field.onChange}
                      testIdPrefix="scrimmage"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-scrimmage"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createScrimmageEventMutation.isPending}
                  data-testid="button-submit-scrimmage"
                >
                  {createScrimmageEventMutation.isPending ? 'Creating...' : 'Create Scrimmage'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
