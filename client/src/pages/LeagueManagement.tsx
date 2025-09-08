import { useState } from 'react';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { useSubscription } from '@/context/SubscriptionContext';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Trophy,
  Calendar,
  Star,
  Check,
  X,
  Plus,
  Edit3,
  AlertCircle,
  Settings,
  Clock,
  Upload,
  FileText,
  UserCheck2,
  AlertTriangle,
  Download,
  Merge
} from 'lucide-react';
import { insertTeamSchema, insertSeasonSchema } from '@shared/schema';

type LeagueMember = {
  id: string;
  userId: string;
  skillRating: number;
  status: string;
  assignedTeamId?: string;
  isCaptain?: boolean;
  position?: string;
  notes?: string;
  jerseyNumber?: number;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    email: string;
  };
};

type Season = {
  id: string;
  name: string;
  leagueId: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
};

// Utility function to format names as "Last Name, First Name"
function formatUserName(user: { firstName?: string; lastName?: string; displayName?: string }): string {
  if (user.lastName && user.firstName) {
    return `${user.lastName}, ${user.firstName}`;
  } else if (user.firstName) {
    return user.firstName;
  } else if (user.displayName) {
    return user.displayName;
  }
  return 'User';
}

type Team = {
  id: string;
  name: string;
  captainId: string;
  leagueId: string;
};

type Game = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  venue: string;
};

const createTeamSchema = insertTeamSchema.extend({
  captainId: insertTeamSchema.shape.captainId.optional(),
});

type CreateTeamForm = z.infer<typeof createTeamSchema>;

const createGameSchema = z.object({
  homeTeamId: z.string().min(1, 'Home team is required'),
  awayTeamId: z.string().min(1, 'Away team is required'),
  scheduledAt: z.string().min(1, 'Game date and time is required'),
  venue: z.string().optional(),
});

type CreateGameForm = z.infer<typeof createGameSchema>;

const editGameSchema = z.object({
  homeTeamId: z.string().min(1, 'Home team is required'),
  awayTeamId: z.string().min(1, 'Away team is required'),
  gameDate: z.string().min(1, 'Game date is required'),
  gameTime: z.string().min(1, 'Game time is required'),
  venue: z.string().optional(),
  lockerRoom: z.string().optional(),
});

type EditGameForm = z.infer<typeof editGameSchema>;

const editLeagueSchema = z.object({
  name: z.string().min(1, 'League name is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  season: z.string().optional(),
  isActive: z.boolean(),
});

type EditLeagueForm = z.infer<typeof editLeagueSchema>;

const createSeasonSchema = z.object({
  name: z.string().min(1, 'Season name is required'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CreateSeasonForm = z.infer<typeof createSeasonSchema>;

export default function LeagueManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAccess } = useSubscription();
  const [activeTab, setActiveTab] = useState<'players' | 'teams' | 'games'>('games');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LeagueMember | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [showScheduleGame, setShowScheduleGame] = useState(false);
  const [showEditGame, setShowEditGame] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const datePickerRef = React.useRef<HTMLDivElement>(null);
  const timePickerRef = React.useRef<HTMLDivElement>(null);
  
  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showMergeRequests, setShowMergeRequests] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Close date picker when clicking outside
  React.useEffect(() => {
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
  React.useEffect(() => {
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
  const [showEditLeague, setShowEditLeague] = useState(false);
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [playerEditForm, setPlayerEditForm] = useState({
    assignedTeamId: '',
    isCaptain: false,
    position: '',
    skillRating: 5,
    jerseyNumber: '',
    notes: ''
  });

  // Get league ID and edit mode from URL params
  const leagueId = new URLSearchParams(window.location.search).get('leagueId') || '';
  const editMode = new URLSearchParams(window.location.search).get('edit') === 'true';
  
  // Fetch user's leagues for selection
  const { data: userLeagues = [] } = useQuery({
    queryKey: ['/api/user/leagues'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/user/leagues');
      return response.json();
    },
    enabled: !leagueId,
  });

  // Fetch league data
  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch seasons for this league
  const { data: seasons = [], refetch: refetchSeasons } = useQuery<Season[]>({
    queryKey: ['/api/leagues', leagueId, 'seasons'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/seasons`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch league members
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'members'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/members`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch pending members
  const { data: pendingMembers = [], refetch: refetchPending } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'pending-members'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/pending-members`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch teams
  const { data: teams = [], refetch: refetchTeams } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'teams'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/teams`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch games
  const { data: games = [], refetch: refetchGames } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Form for creating teams
  const teamForm = useForm<CreateTeamForm>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: '',
      leagueId: leagueId,
    },
  });

  // Form for scheduling games
  const gameForm = useForm<CreateGameForm>({
    resolver: zodResolver(createGameSchema),
    defaultValues: {
      homeTeamId: '',
      awayTeamId: '',
      scheduledAt: '',
      venue: '',
    },
  });

  // Form for editing league
  const editLeagueForm = useForm<EditLeagueForm>({
    resolver: zodResolver(editLeagueSchema),
    defaultValues: {
      name: league?.name || '',
      description: league?.description || '',
      location: league?.location || '',
      season: league?.season || '',
      isActive: league?.isActive ?? true,
    },
  });

  // Form for creating seasons
  const seasonForm = useForm<CreateSeasonForm>({
    resolver: zodResolver(createSeasonSchema),
    defaultValues: {
      name: '',
      isActive: true,
    },
  });

  // Form for editing games
  const editGameForm = useForm<EditGameForm>({
    resolver: zodResolver(editGameSchema),
    defaultValues: {
      homeTeamId: '',
      awayTeamId: '',
      gameDate: '',
      gameTime: '',
      venue: '',
    },
  });

  // Update edit game form when selected game changes
  React.useEffect(() => {
    if (selectedGame) {
      const gameDate = new Date(selectedGame.scheduledAt);
      const formattedDate = gameDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const formattedTime = gameDate.toTimeString().slice(0, 5); // HH:MM
      editGameForm.reset({
        homeTeamId: selectedGame.homeTeamId,
        awayTeamId: selectedGame.awayTeamId,
        gameDate: formattedDate,
        gameTime: formattedTime,
        venue: selectedGame.venue || '',
        lockerRoom: selectedGame.lockerRoom || '',
      });
    }
  }, [selectedGame, editGameForm]);

  // Update form when league data loads
  React.useEffect(() => {
    if (league) {
      editLeagueForm.reset({
        name: league.name,
        description: league.description || '',
        location: league.location || '',
        season: league.season || '',
        isActive: league.isActive ?? true,
      });
    }
  }, [league, editLeagueForm]);

  // Set initial selected season to the first active season or first season
  React.useEffect(() => {
    if (seasons.length > 0 && !selectedSeasonId) {
      const activeSeason = seasons.find(s => s.isActive);
      setSelectedSeasonId(activeSeason?.id || seasons[0].id);
    }
  }, [seasons, selectedSeasonId]);

  // Mutations for member management
  const approveMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const response = await apiRequest('POST', `/api/league-memberships/${membershipId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Member approved successfully' });
      refetchMembers();
      refetchPending();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const response = await apiRequest('POST', `/api/league-memberships/${membershipId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Member rejected successfully' });
      refetchPending();
    },
  });

  const skillRatingMutation = useMutation({
    mutationFn: async ({ membershipId, skillRating }: { membershipId: string; skillRating: number }) => {
      const response = await apiRequest('PATCH', `/api/league-memberships/${membershipId}/skill-rating`, {
        skillRating,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Skill rating updated successfully' });
      refetchMembers();
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ memberId, updates }: { memberId: string; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}/members/${memberId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Player Updated',
        description: 'Player details have been updated successfully.',
      });
      refetchMembers();
      setSelectedPlayer(null);
    },
  });

  // Upload mutation for bulk player import
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('playerFile', file);

      const response = await fetch(`/api/leagues/${leagueId}/players/import`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      const successMessage = [
        `${data.successfulRecords} players imported successfully`,
        data.teamsCreated > 0 ? `${data.teamsCreated} teams created` : null,
        data.failedRecords > 0 ? `${data.failedRecords} failed` : null
      ].filter(Boolean).join(', ');
      
      toast({
        title: 'Import Successful',
        description: successMessage,
      });
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowBulkImport(false);
      
      // Refetch data to show any new suggestions
      refetchMembers();
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle file upload
  const handleFileUpload = () => {
    if (!importFile) return;
    uploadMutation.mutate(importFile);
  };

  const removeFromLeagueMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const response = await apiRequest('DELETE', `/api/league-memberships/${membershipId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Player Removed',
        description: 'Player has been removed from the league.',
      });
      refetchMembers();
      setSelectedPlayer(null);
    },
    onError: () => {
      toast({
        title: 'Remove Failed',
        description: 'Failed to remove player from league.',
        variant: 'destructive',
      });
    },
  });

  // Team creation mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: CreateTeamForm) => {
      const response = await apiRequest('POST', '/api/teams', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Team created successfully' });
      setShowCreateTeam(false);
      teamForm.reset();
      refetchTeams();
    },
  });

  // Game scheduling mutation
  const createGameMutation = useMutation({
    mutationFn: async (data: CreateGameForm) => {
      const gameData = {
        ...data,
        leagueId: leagueId,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
      };
      const response = await apiRequest('POST', '/api/games', gameData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Game scheduled successfully' });
      setShowScheduleGame(false);
      gameForm.reset();
      refetchGames();
    },
  });

  // Game update mutation
  const updateGameMutation = useMutation({
    mutationFn: async ({ gameId, data }: { gameId: string; data: EditGameForm }) => {
      // Combine date and time into a single datetime using local date components
      const [year, month, day] = data.gameDate.split('-');
      const [hours, minutes] = data.gameTime.split(':');
      const combinedDateTime = new Date(
        parseInt(year), 
        parseInt(month) - 1, 
        parseInt(day), 
        parseInt(hours), 
        parseInt(minutes)
      );
      
      const response = await apiRequest('PATCH', `/api/games/${gameId}`, {
        homeTeamId: data.homeTeamId,
        awayTeamId: data.awayTeamId,
        scheduledAt: combinedDateTime.toISOString(),
        venue: data.venue,
        lockerRoom: data.lockerRoom,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Game updated successfully' });
      setShowEditGame(false);
      setSelectedGame(null);
      refetchGames();
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update game details.',
        variant: 'destructive',
      });
    },
  });

  // League update mutation
  const updateLeagueMutation = useMutation({
    mutationFn: async (data: EditLeagueForm) => {
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'League updated successfully' });
      setShowEditLeague(false);
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update league details.',
        variant: 'destructive',
      });
    },
  });

  // League delete mutation
  const deleteLeagueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'League deleted successfully' });
      navigate('/league-list');
    },
    onError: () => {
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete league.',
        variant: 'destructive',
      });
    },
  });

  // Season create mutation
  const createSeasonMutation = useMutation({
    mutationFn: async (data: CreateSeasonForm) => {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/seasons`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Season created successfully' });
      setShowCreateSeason(false);
      seasonForm.reset();
      refetchSeasons();
    },
    onError: () => {
      toast({
        title: 'Creation Failed',
        description: 'Failed to create season.',
        variant: 'destructive',
      });
    },
  });

  if (!hasAccess('commissioner')) {
    return (
      <SubscriptionGate requiredTier="commissioner">
        <div className="min-h-screen flex flex-col items-center justify-center px-6">
          <Crown className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Commissioner Access Required</h2>
          <p className="text-muted-foreground text-center mb-6">
            You need Commissioner tier access to manage leagues.
          </p>
          <button 
            onClick={() => navigate('/subscription')}
            className="bg-warning text-black px-6 py-3 rounded-lg font-semibold"
          >
            Upgrade to Commissioner
          </button>
        </div>
      </SubscriptionGate>
    );
  }

  if (!leagueId) {
    return (
      <div className="min-h-screen flex flex-col pb-24" data-testid="league-selection-page">
        <div className="p-6 pt-12">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={() => navigate('/more')}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Crown className="w-6 h-6 text-warning" />
              Select League to Manage
            </h1>
          </div>
        </div>

        <div className="px-6 flex-1">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-4">Your Leagues</h3>
            {userLeagues.length === 0 ? (
              <div className="text-center py-8">
                <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-6">
                  You haven't created any leagues yet. Create your first league to start managing teams and scheduling games.
                </p>
                <button 
                  onClick={() => navigate('/create-league')}
                  className="bg-warning text-black px-6 py-3 rounded-lg font-semibold"
                  data-testid="button-create-first-league"
                >
                  Create Your First League
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {userLeagues.map((league: any) => (
                  <div 
                    key={league.id} 
                    className="p-4 bg-background rounded-lg border hover:border-primary cursor-pointer transition-colors"
                    onClick={() => navigate(`/league-management?leagueId=${league.id}`)}
                    data-testid={`league-option-${league.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{league.name}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{league.sport}</span>
                          {league.location && <span>• {league.location}</span>}
                          {league.season && <span>• {league.season}</span>}
                        </div>
                      </div>
                      <Crown className="w-5 h-5 text-warning" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (leagueLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <div className="text-2xl font-bold text-primary">Loading League...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="league-management-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => navigate('/league-list')}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Crown className="w-6 h-6 text-warning" />
              League Management
            </h1>
            {league && (
              <p className="text-muted-foreground text-sm" data-testid="text-league-name">
                {league.name}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowEditLeague(true)}
            className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-card"
            data-testid="button-edit-league"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Season Selector */}
        {seasons.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2">Season</label>
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="w-full p-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="select-season"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name} {season.isActive ? '(Active)' : '(Inactive)'}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowCreateSeason(true)}
              className="mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
              data-testid="button-create-season"
            >
              <Plus className="w-4 h-4 mr-2 inline" />
              New Season
            </button>
          </div>
        )}

        {/* Create First Season */}
        {seasons.length === 0 && (
          <div className="mb-4 p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">No seasons yet</h3>
                <p className="text-sm text-muted-foreground">Create your first season to start organizing games and teams.</p>
              </div>
              <button
                onClick={() => setShowCreateSeason(true)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
                data-testid="button-create-first-season"
              >
                <Plus className="w-4 h-4 mr-2 inline" />
                Create Season
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex bg-muted rounded-lg p-1">
          <button
            onClick={() => setActiveTab('players')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'players'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-players"
          >
            <Users className="w-4 h-4" />
            Players
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'teams'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-teams"
          >
            <Trophy className="w-4 h-4" />
            Teams
          </button>
          <button
            onClick={() => setActiveTab('games')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'games'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-games"
          >
            <Calendar className="w-4 h-4" />
            Games
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 flex-1">
        {/* Player Management Tab */}
        {activeTab === 'players' && (
          <div className="space-y-6">
            {/* Bulk Player Import Section */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-500" />
                  <h3 className="text-lg font-semibold">Bulk Player Import</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowMergeRequests(!showMergeRequests)}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted"
                    data-testid="button-view-merge-requests"
                  >
                    <Merge className="w-4 h-4" />
                    Merge Requests
                  </button>
                  <button
                    onClick={() => setShowBulkImport(!showBulkImport)}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
                    data-testid="button-bulk-import"
                  >
                    <Upload className="w-4 h-4" />
                    Import Players
                  </button>
                </div>
              </div>

              {showBulkImport && (
                <div className="border-t border-border pt-4 space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">How it works:</h4>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                      <li>• Upload a CSV or Excel file with player information</li>
                      <li>• System creates placeholder records and assigns players to teams</li>
                      <li>• Teams are automatically created if they don't exist in your league</li>
                      <li>• When players sign up, we'll suggest account merges based on name matching</li>
                      <li>• Review and approve merges to link real accounts with your roster data</li>
                    </ul>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="file-drop-zone"
                    >
                      <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      {importFile ? (
                        <div>
                          <p className="font-medium text-green-600">{importFile.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(importFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium mb-2">Click to select or drag & drop</p>
                          <p className="text-sm text-muted-foreground">
                            Supported formats: CSV, Excel (.xlsx, .xls)
                          </p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                        className="hidden"
                        data-testid="file-input"
                      />
                    </div>

                    {importFile && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleFileUpload}
                          disabled={uploadMutation.isPending}
                          className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-upload-file"
                        >
                          {uploadMutation.isPending ? 'Processing...' : 'Upload & Process'}
                        </button>
                        <button
                          onClick={() => {
                            setImportFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
                          data-testid="button-clear-file"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-warning/10 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
                      <div>
                        <h5 className="font-medium text-warning">Expected Format</h5>
                        <p className="text-sm text-muted-foreground mt-1">
                          Include columns: First Name, Last Name, Email (optional), Phone, Position, Jersey Number, Team Name
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showMergeRequests && (
                <div className="border-t border-border pt-4">
                  <div className="bg-muted p-4 rounded-lg text-center">
                    <UserCheck2 className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="font-medium">No merge requests yet</p>
                    <p className="text-sm text-muted-foreground">
                      Import player data first, then merge requests will appear here when users sign up
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Pending Approvals */}
            {pendingMembers.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <UserPlus className="w-5 h-5 text-warning" />
                  <h3 className="text-lg font-semibold">Pending Approval ({pendingMembers.length})</h3>
                </div>
                <div className="space-y-3">
                  {pendingMembers.map((member: LeagueMember) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex-1" data-testid={`pending-player-${member.user.id}`}>
                        <p className="font-medium">{formatUserName(member.user)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate(member.id)}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1 bg-green-500/50 text-white rounded-md text-sm font-medium disabled:opacity-50"
                          data-testid={`button-approve-${member.user.id}`}
                        >
                          <Check className="w-3 h-3" />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(member.id)}
                          disabled={rejectMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1 bg-red-500/50 text-white rounded-md text-sm font-medium disabled:opacity-50"
                          data-testid={`button-reject-${member.user.id}`}
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approved Members */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserCheck className="w-5 h-5 text-green-500/50" />
                <h3 className="text-lg font-semibold">League Members ({members.length})</h3>
              </div>
              {members.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No approved members yet.</p>
              ) : (
                <div className="space-y-3">
                  {members.map((member: LeagueMember) => (
                    <div 
                      key={member.id} 
                      className="flex items-center justify-between p-3 bg-background rounded-lg border hover:bg-card cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedPlayer(member);
                        setPlayerEditForm({
                          assignedTeamId: member.assignedTeamId || '',
                          isCaptain: member.isCaptain || false,
                          position: member.position || '',
                          skillRating: member.skillRating || 5,
                          jerseyNumber: member.jerseyNumber?.toString() || '',
                          notes: member.notes || ''
                        });
                      }}
                      data-testid={`member-${member.user.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{formatUserName(member.user)}</p>
                          {member.isCaptain && <span className="w-4 h-4 text-warning font-bold text-sm flex items-center justify-center">C</span>}
                          {member.jerseyNumber && (
                            <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                              #{member.jerseyNumber}
                            </span>
                          )}
                        </div>
                        {member.position && (
                          <p className="text-xs text-muted-foreground">{member.position}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-warning" />
                          <select
                            value={member.skillRating || 5}
                            onChange={(e) => {
                              e.stopPropagation();
                              skillRatingMutation.mutate({ 
                                membershipId: member.id, 
                                skillRating: parseInt(e.target.value) 
                              });
                            }}
                            className="bg-background border border-border rounded px-2 py-1 text-sm"
                            data-testid={`skill-rating-${member.user.id}`}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                              <option key={rating} value={rating}>{rating}</option>
                            ))}
                          </select>
                        </div>
                        <Edit3 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Management Tab */}
        {activeTab === 'teams' && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {selectedTeam && (
                    <button
                      onClick={() => setSelectedTeam(null)}
                      className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-background"
                      data-testid="button-back-to-teams"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <Trophy className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">
                    {selectedTeam ? `${selectedTeam.name} Players` : `Teams (${teams.length})`}
                  </h3>
                </div>
                {!selectedTeam && (
                  <button
                    onClick={() => setShowCreateTeam(!showCreateTeam)}
                    className="flex items-center gap-2 px-4 py-2 bg-warning text-black rounded-lg text-sm font-medium"
                    data-testid="button-create-team"
                  >
                    <Plus className="w-4 h-4" />
                    Create Team
                  </button>
                )}
              </div>

              {/* Create Team Form */}
              {showCreateTeam && (
                <div className="mb-6 p-4 bg-background rounded-lg border">
                  <form onSubmit={teamForm.handleSubmit((data) => createTeamMutation.mutate(data))} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Team Name</label>
                      <input
                        {...teamForm.register('name')}
                        className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter team name"
                        data-testid="input-team-name"
                      />
                      {teamForm.formState.errors.name && (
                        <p className="text-destructive text-sm mt-1">{teamForm.formState.errors.name.message}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={createTeamMutation.isPending}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                        data-testid="button-submit-team"
                      >
                        {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateTeam(false)}
                        className="px-4 py-2 bg-muted text-muted-foreground rounded-lg"
                        data-testid="button-cancel-team"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Teams List or Team Detail */}
              {!selectedTeam ? (
                // Teams List View
                (() => {
                  const freeAgents = members.filter((m: LeagueMember) => !m.assignedTeamId);
                  const allTeamsToShow = [
                    // Free Agents virtual team
                    {
                      id: 'free-agents',
                      name: 'Free Agents',
                      captainId: null,
                      leagueId: league.id,
                      isFreeAgents: true
                    },
                    ...teams
                  ];

                  return (
                    <div className="space-y-3">
                      {allTeamsToShow.map((team: any) => {
                        const teamMembers = team.isFreeAgents 
                          ? freeAgents 
                          : members.filter((m: LeagueMember) => m.assignedTeamId === team.id);
                        const captain = team.isFreeAgents 
                          ? null 
                          : members.find((m: LeagueMember) => m.userId === team.captainId);
                        
                        return (
                          <div 
                            key={team.id} 
                            className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                              team.isFreeAgents ? 'bg-muted/30 border-dashed' : 'bg-background'
                            }`}
                            onClick={() => setSelectedTeam(team)}
                            data-testid={`team-${team.id}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{team.name}</p>
                                {team.isFreeAgents && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                                    Unassigned
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                {!team.isFreeAgents && (
                                  <p>Captain: {captain?.user ? formatUserName(captain.user) : 'Not assigned'}</p>
                                )}
                                <p>{teamMembers.length} player{teamMembers.length !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {!team.isFreeAgents && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toast({ title: 'Team messaging feature coming soon!', description: `Start a group chat with ${team.name}` });
                                  }}
                                  className="px-3 py-2 bg-blue-500/50 text-white rounded-lg hover:bg-blue-600/50 text-sm font-medium flex items-center gap-2"
                                  data-testid={`button-message-team-${team.id}`}
                                >
                                  <Users className="w-4 h-4" />
                                  Message Team
                                </button>
                              )}
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                // Team Detail View - Show Players in Selected Team
                (() => {
                  const teamMembers = selectedTeam.isFreeAgents 
                    ? members.filter((m: LeagueMember) => !m.assignedTeamId)
                    : members.filter((m: LeagueMember) => m.assignedTeamId === selectedTeam.id);
                  
                  return teamMembers.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {selectedTeam.isFreeAgents 
                          ? "All players are currently assigned to teams" 
                          : "No players assigned to this team yet"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {selectedTeam.isFreeAgents 
                          ? "Players without team assignments will appear here" 
                          : "Assign players from the Players tab"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {teamMembers.map((member: LeagueMember) => (
                        <div 
                          key={member.id} 
                          className="flex items-center justify-between p-3 bg-background rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedPlayer(member);
                            setPlayerEditForm({
                              assignedTeamId: member.assignedTeamId || '',
                              isCaptain: member.userId === selectedTeam.captainId,
                              position: member.position || '',
                              skillRating: member.skillRating || 1,
                              jerseyNumber: member.jerseyNumber?.toString() || '',
                              notes: member.notes || ''
                            });
                          }}
                          data-testid={`team-player-${member.user.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{formatUserName(member.user)}</p>
                              {!selectedTeam.isFreeAgents && member.userId === selectedTeam.captainId && (
                                <Crown className="w-4 h-4 text-warning" title="Team Captain" />
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {member.position && <p>Position: {member.position}</p>}
                              {member.jerseyNumber && <p>Jersey: #{member.jerseyNumber}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="tier-badge bg-success text-accent-foreground text-xs px-2 py-1 rounded-full">
                              {member.status?.toUpperCase() || 'ACTIVE'}
                            </span>
                            {member.skillRating && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Skill: {member.skillRating}/10
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* Game Scheduling Tab */}
        {activeTab === 'games' && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Game Schedule</h3>
                </div>
                <button
                  onClick={() => setShowScheduleGame(!showScheduleGame)}
                  disabled={teams.length < 2}
                  className="flex items-center gap-2 px-4 py-2 bg-warning text-black rounded-lg text-sm font-medium disabled:opacity-50"
                  data-testid="button-schedule-game"
                >
                  <Plus className="w-4 h-4" />
                  Schedule Game
                </button>
              </div>

              {teams.length < 2 && (
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    You need at least 2 teams to schedule games. Create teams first.
                  </p>
                </div>
              )}

              {/* Schedule Game Form */}
              {showScheduleGame && teams.length >= 2 && (
                <div className="mb-6 p-4 bg-background rounded-lg border">
                  <form onSubmit={gameForm.handleSubmit((data) => createGameMutation.mutate(data))} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Home Team</label>
                        <select
                          {...gameForm.register('homeTeamId')}
                          className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          data-testid="select-home-team"
                        >
                          <option value="">Select home team</option>
                          {teams.map((team: Team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Away Team</label>
                        <select
                          {...gameForm.register('awayTeamId')}
                          className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          data-testid="select-away-team"
                        >
                          <option value="">Select away team</option>
                          {teams.map((team: Team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Game Date & Time</label>
                      <input
                        {...gameForm.register('scheduledAt')}
                        type="datetime-local"
                        className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid="input-game-time"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Venue (optional)</label>
                      <input
                        {...gameForm.register('venue')}
                        className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Game venue"
                        data-testid="input-venue"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={createGameMutation.isPending}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                        data-testid="button-submit-game"
                      >
                        {createGameMutation.isPending ? 'Scheduling...' : 'Schedule Game'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowScheduleGame(false)}
                        className="px-4 py-2 bg-muted text-muted-foreground rounded-lg"
                        data-testid="button-cancel-game"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Games List */}
              {games.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No games scheduled yet. Create your first game above.
                </p>
              ) : (
                <div className="space-y-3">
                  {games.map((game: any) => {
                    const homeTeam = teams.find((t: Team) => t.id === game.homeTeamId);
                    const awayTeam = teams.find((t: Team) => t.id === game.awayTeamId);
                    const gameDate = new Date(game.scheduledAt);
                    
                    return (
                      <div 
                        key={game.id} 
                        className="flex items-center justify-between p-4 bg-background rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setSelectedGame(game);
                          setShowEditGame(true);
                        }}
                        data-testid={`game-${game.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-2">
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-1">
                                {homeTeam?.logoUrl ? (
                                  <img 
                                    src={homeTeam.logoUrl} 
                                    alt={`${homeTeam.name} logo`}
                                    className="w-full h-full rounded object-cover"
                                    data-testid={`img-home-team-logo-${game.id}`}
                                  />
                                ) : (
                                  <Trophy className="w-5 h-5 text-primary-foreground" />
                                )}
                              </div>
                              <p className="font-medium text-center">{homeTeam?.name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">HOME</p>
                            </div>
                            <div className="text-muted-foreground font-bold">VS</div>
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-1">
                                {awayTeam?.logoUrl ? (
                                  <img 
                                    src={awayTeam.logoUrl} 
                                    alt={`${awayTeam.name} logo`}
                                    className="w-full h-full rounded object-cover"
                                    data-testid={`img-away-team-logo-${game.id}`}
                                  />
                                ) : (
                                  <Trophy className="w-5 h-5 text-primary-foreground" />
                                )}
                              </div>
                              <p className="font-medium text-center">{awayTeam?.name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">AWAY</p>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>📅 {gameDate.toLocaleDateString()} at {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            {game.venue && <p>📍 {game.venue}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs bg-blue-100/50 text-blue-800/50 px-2 py-1 rounded-full">
                            {game.status || 'SCHEDULED'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold">{formatUserName(selectedPlayer.user)}</h3>
                  <p className="text-sm text-muted-foreground">{selectedPlayer.user.email}</p>
                </div>
                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Team Assignment */}
                <div>
                  <label className="block text-sm font-medium mb-2">Assigned Team</label>
                  <select
                    value={playerEditForm.assignedTeamId}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, assignedTeamId: e.target.value }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">No team assigned</option>
                    {teams.map((team: Team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                {/* Captain Role */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={playerEditForm.isCaptain}
                      onChange={(e) => setPlayerEditForm(prev => ({ ...prev, isCaptain: e.target.checked }))}
                      className="rounded border-border"
                    />
                    <span className="text-sm font-medium">Team Captain</span>
                    <Crown className="w-4 h-4 text-warning" />
                  </label>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium mb-2">Position</label>
                  <input
                    type="text"
                    value={playerEditForm.position}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, position: e.target.value }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Forward, Defense, Goalie"
                  />
                </div>

                {/* Skill Rating */}
                <div>
                  <label className="block text-sm font-medium mb-2">Skill Rating (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={playerEditForm.skillRating}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, skillRating: parseInt(e.target.value) || 1 }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Jersey Number */}
                <div>
                  <label className="block text-sm font-medium mb-2">Jersey Number</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={playerEditForm.jerseyNumber}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, jerseyNumber: e.target.value }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter jersey number"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium mb-2">Notes</label>
                  <textarea
                    value={playerEditForm.notes}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Add notes about this player..."
                  />
                </div>
              </div>

              <div className="space-y-3 mt-6">
                {/* Action Buttons */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => {
                      // TODO: Implement messaging functionality
                      toast({ title: 'Messaging feature coming soon!' });
                    }}
                    className="px-4 py-2 bg-blue-500/50 text-white rounded-lg hover:bg-blue-600/50 text-sm font-medium"
                  >
                    Message Player
                  </button>
                  <button
                    onClick={() => {
                      const updates = {
                        assignedTeamId: playerEditForm.assignedTeamId || null,
                        isCaptain: playerEditForm.isCaptain,
                        position: playerEditForm.position,
                        skillRating: playerEditForm.skillRating,
                        jerseyNumber: playerEditForm.jerseyNumber ? parseInt(playerEditForm.jerseyNumber) : null,
                        notes: playerEditForm.notes
                      };
                      updatePlayerMutation.mutate({
                        memberId: selectedPlayer.id,
                        updates
                      });
                    }}
                    disabled={updatePlayerMutation.isPending}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                  >
                    {updatePlayerMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                {/* Remove Options */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      if (confirm('Remove this player from their assigned team?')) {
                        updatePlayerMutation.mutate({
                          memberId: selectedPlayer.id,
                          updates: { assignedTeamId: null, isCaptain: false }
                        });
                      }
                    }}
                    className="w-full px-4 py-2 bg-yellow-500/50 text-white rounded-lg hover:bg-yellow-600/50 text-sm font-medium"
                  >
                    Remove from Team
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove this player from the league entirely? This cannot be undone.')) {
                        removeFromLeagueMutation.mutate(selectedPlayer.id);
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-500/50 text-white rounded-lg hover:bg-red-600/50 text-sm font-medium"
                  >
                    Remove from League
                  </button>
                </div>

                {/* Close Button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => setSelectedPlayer(null)}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit League Modal */}
      {showEditLeague && league && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Edit League</h2>
                <button
                  onClick={() => setShowEditLeague(false)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-edit-league"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={editLeagueForm.handleSubmit((data) => {
                  updateLeagueMutation.mutate(data);
                })}
                className="space-y-4"
              >
                {/* League Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">League Name</label>
                  <input
                    {...editLeagueForm.register('name')}
                    type="text"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter league name"
                    data-testid="input-league-name"
                  />
                  {editLeagueForm.formState.errors.name && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editLeagueForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    {...editLeagueForm.register('description')}
                    rows={3}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Describe your league..."
                    data-testid="input-league-description"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium mb-2">Location</label>
                  <input
                    {...editLeagueForm.register('location')}
                    type="text"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="League location"
                    data-testid="input-league-location"
                  />
                </div>

                {/* Season */}
                <div>
                  <label className="block text-sm font-medium mb-2">Season</label>
                  <input
                    {...editLeagueForm.register('season')}
                    type="text"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Spring 2024"
                    data-testid="input-league-season"
                  />
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...editLeagueForm.register('isActive')}
                      type="checkbox"
                      className="rounded border-border focus:ring-primary"
                      data-testid="checkbox-league-active"
                    />
                    <span className="text-sm font-medium">League is active</span>
                  </label>
                </div>

                {/* Commissioner Transfer */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3 text-orange-600/50">⚠️ Transfer Commissioner</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Transfer ownership of this league to another user. You will lose all commissioner privileges for this league.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="Enter new commissioner's email"
                      className="flex-1 p-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      data-testid="input-new-commissioner-email"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const email = (document.querySelector('[data-testid="input-new-commissioner-email"]') as HTMLInputElement)?.value;
                        if (!email) {
                          toast({ title: 'Please enter an email address', variant: 'destructive' });
                          return;
                        }
                        if (confirm(`Are you sure you want to transfer commissioner privileges to ${email}? This action cannot be undone.`)) {
                          // TODO: Implement commissioner transfer
                          toast({ title: 'Commissioner transfer functionality coming soon!' });
                        }
                      }}
                      className="px-4 py-2 bg-orange-500/50 text-white rounded-lg hover:bg-orange-600/50 text-sm font-medium"
                      data-testid="button-transfer-commissioner"
                    >
                      Transfer
                    </button>
                  </div>
                </div>

                {/* Delete League Button */}
                <div className="border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete the league "${league?.name}"? This action cannot be undone and will remove all associated teams, games, and data.`)) {
                        deleteLeagueMutation.mutate();
                      }
                    }}
                    disabled={deleteLeagueMutation.isPending}
                    className="w-full px-4 py-2 bg-red-500/50 text-white rounded-lg hover:bg-red-600/50 text-sm font-medium disabled:opacity-50"
                    data-testid="button-delete-league"
                  >
                    {deleteLeagueMutation.isPending ? 'Deleting...' : 'Delete League'}
                  </button>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditLeague(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    data-testid="button-cancel-edit-league"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateLeagueMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                    data-testid="button-save-league-changes"
                  >
                    {updateLeagueMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Season Modal */}
      {showCreateSeason && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Create New Season</h2>
                <button
                  onClick={() => setShowCreateSeason(false)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-create-season"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={seasonForm.handleSubmit((data) => {
                  createSeasonMutation.mutate(data);
                })}
                className="space-y-4"
              >
                {/* Season Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">Season Name</label>
                  <input
                    {...seasonForm.register('name')}
                    type="text"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Spring 2024, Fall League 2023"
                    data-testid="input-season-name"
                  />
                  {seasonForm.formState.errors.name && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {seasonForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date (Optional)</label>
                  <input
                    {...seasonForm.register('startDate')}
                    type="date"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-season-start-date"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">End Date (Optional)</label>
                  <input
                    {...seasonForm.register('endDate')}
                    type="date"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-season-end-date"
                  />
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...seasonForm.register('isActive')}
                      type="checkbox"
                      className="rounded border-border focus:ring-primary"
                      data-testid="checkbox-season-active"
                    />
                    <span className="text-sm font-medium">Season is active</span>
                  </label>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateSeason(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    data-testid="button-cancel-create-season"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSeasonMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                    data-testid="button-create-season-submit"
                  >
                    {createSeasonMutation.isPending ? 'Creating...' : 'Create Season'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Game Modal */}
      {showEditGame && selectedGame && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Edit Game</h2>
                <button
                  onClick={() => {
                    setShowEditGame(false);
                    setSelectedGame(null);
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-edit-game"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={editGameForm.handleSubmit((data) => {
                  updateGameMutation.mutate({ gameId: selectedGame.id, data });
                })}
                className="space-y-4"
              >
                {/* Home Team */}
                <div>
                  <label className="block text-sm font-medium mb-2">Home Team</label>
                  <select
                    {...editGameForm.register('homeTeamId')}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="select-home-team"
                  >
                    <option value="">Select home team</option>
                    {teams.map((team: Team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                  {editGameForm.formState.errors.homeTeamId && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editGameForm.formState.errors.homeTeamId.message}
                    </p>
                  )}
                </div>

                {/* Away Team */}
                <div>
                  <label className="block text-sm font-medium mb-2">Away Team</label>
                  <select
                    {...editGameForm.register('awayTeamId')}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="select-away-team"
                  >
                    <option value="">Select away team</option>
                    {teams.map((team: Team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                  {editGameForm.formState.errors.awayTeamId && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editGameForm.formState.errors.awayTeamId.message}
                    </p>
                  )}
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">Game Date</label>
                  <div className="relative">
                    <Controller
                      name="gameDate"
                      control={editGameForm.control}
                      render={({ field }) => (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className="w-full p-3 pr-12 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-left"
                            data-testid="button-game-date"
                          >
                            {field.value ? (() => {
                              const [year, month, day] = field.value.split('-');
                              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                              return date.toLocaleDateString();
                            })() : 'Select date'}
                          </button>
                          <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                          {showDatePicker && (
                            <div 
                              ref={datePickerRef}
                              className="absolute z-50 mt-1 bg-white dark:bg-card border border-border rounded-lg shadow-lg min-w-[350px]"
                            >
                              <DayPicker
                                mode="single"
                                selected={field.value ? (() => {
                                  const [year, month, day] = field.value.split('-');
                                  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                })() : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    // Use local date components to avoid timezone issues
                                    const year = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day = String(date.getDate()).padStart(2, '0');
                                    const dateString = `${year}-${month}-${day}`;
                                    field.onChange(dateString);
                                    setShowDatePicker(false);
                                  }
                                }}
                                className="p-4"
                                classNames={{
                                  today: "rdp-cell_today bg-primary/20 text-black font-bold text-lg w-12 h-12",
                                  selected: "rdp-cell_selected bg-primary text-white font-bold text-lg w-12 h-12",
                                  root: "text-black text-lg",
                                  day: "text-black hover:bg-gray-100 text-lg w-12 h-12 flex items-center justify-center cursor-pointer",
                                  nav_button: "text-black hover:bg-gray-100 w-10 h-10 flex items-center justify-center",
                                  caption: "text-black font-medium text-xl mb-4",
                                  head_cell: "text-black font-medium text-base p-2",
                                  table: "w-full border-spacing-1",
                                  cell: "text-center p-1",
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    />
                  </div>
                  {editGameForm.formState.errors.gameDate && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editGameForm.formState.errors.gameDate.message}
                    </p>
                  )}
                </div>

                {/* Time */}
                <div>
                  <label className="block text-sm font-medium mb-2">Game Time</label>
                  <div className="relative">
                    <Controller
                      name="gameTime"
                      control={editGameForm.control}
                      render={({ field }) => (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowTimePicker(!showTimePicker)}
                            className="w-full p-3 pr-12 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-left"
                            data-testid="button-game-time"
                          >
                            {field.value ? (() => {
                              const [hours, minutes] = field.value.split(':');
                              const hour12 = parseInt(hours) === 0 ? 12 : parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
                              const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
                              return `${hour12}:${minutes} ${ampm}`;
                            })() : 'Select time'}
                          </button>
                          <Clock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                          {showTimePicker && (
                            <div 
                              ref={timePickerRef}
                              className="absolute z-50 mt-1 bg-white dark:bg-card border border-border rounded-lg shadow-lg min-w-[300px]"
                            >
                              <div className="p-6">
                                <div className="flex items-start justify-center gap-8">
                                  {/* Hours */}
                                  <div className="flex flex-col items-center">
                                    <div className="text-base font-semibold mb-3 text-foreground">Hour</div>
                                    <div className="h-40 w-16 overflow-y-auto border-2 border-border rounded-xl bg-background/50 scrollbar-thin">
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                                        <button
                                          key={hour}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = field.value || '12:00';
                                            const [, minutes] = currentTime.split(':');
                                            const currentHour24 = field.value ? parseInt(field.value.split(':')[0]) : 12;
                                            const isCurrentlyPM = currentHour24 >= 12;
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
                                            field.onChange(`${String(newHour24).padStart(2, '0')}:${minutes}`);
                                          }}
                                          className={`w-full h-12 flex items-center justify-center text-base font-medium hover:bg-primary/10 rounded-lg mx-1 my-1 transition-colors ${
                                            field.value && (() => {
                                              const currentHour24 = parseInt(field.value.split(':')[0]);
                                              const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                              return currentHour12 === hour;
                                            })() ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground'
                                          }`}
                                        >
                                          {hour}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center text-2xl font-bold text-muted-foreground mt-12">:</div>

                                  {/* Minutes */}
                                  <div className="flex flex-col items-center">
                                    <div className="text-base font-semibold mb-3 text-foreground">Minutes</div>
                                    <div className="h-40 w-16 overflow-y-auto border-2 border-border rounded-xl bg-background/50 scrollbar-thin">
                                      {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
                                        <button
                                          key={minute}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = field.value || '12:00';
                                            const [hours] = currentTime.split(':');
                                            field.onChange(`${hours}:${String(minute).padStart(2, '0')}`);
                                          }}
                                          className={`w-full h-12 flex items-center justify-center text-base font-medium hover:bg-primary/10 rounded-lg mx-1 my-1 transition-colors ${
                                            field.value && parseInt(field.value.split(':')[1]) === minute ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground'
                                          }`}
                                        >
                                          {String(minute).padStart(2, '0')}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* AM/PM */}
                                  <div className="flex flex-col items-center">
                                    <div className="text-base font-semibold mb-3 text-foreground">Period</div>
                                    <div className="flex flex-col gap-3">
                                      {['AM', 'PM'].map((period) => (
                                        <button
                                          key={period}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = field.value || '12:00';
                                            const [hours, minutes] = currentTime.split(':');
                                            const currentHour24 = parseInt(hours);
                                            const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                            
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
                                            
                                            field.onChange(`${String(newHour24).padStart(2, '0')}:${minutes}`);
                                          }}
                                          className={`w-16 h-12 flex items-center justify-center text-base font-semibold hover:bg-primary/10 rounded-lg transition-colors ${
                                            field.value && (() => {
                                              const currentHour24 = parseInt(field.value.split(':')[0]);
                                              const isCurrentlyPM = currentHour24 >= 12;
                                              return (period === 'PM' && isCurrentlyPM) || (period === 'AM' && !isCurrentlyPM);
                                            })() ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground border border-border'
                                          }`}
                                        >
                                          {period}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex justify-center mt-6 pt-4 border-t border-border">
                                  <button
                                    type="button"
                                    onClick={() => setShowTimePicker(false)}
                                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors"
                                  >
                                    Done
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    />
                    {editGameForm.formState.errors.gameTime && (
                      <p className="text-red-500/50 text-sm mt-1">
                        {editGameForm.formState.errors.gameTime.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Rink */}
                <div>
                  <label className="block text-sm font-medium mb-2">Rink (Optional)</label>
                  <input
                    {...editGameForm.register('venue')}
                    type="text"
                    placeholder="Enter rink name"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-game-venue"
                  />
                </div>

                {/* Locker Room */}
                <div>
                  <label className="block text-sm font-medium mb-2">Locker Room (Optional)</label>
                  <input
                    {...editGameForm.register('lockerRoom')}
                    type="text"
                    placeholder="Enter locker room assignment"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-game-locker-room"
                  />
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditGame(false);
                      setSelectedGame(null);
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    data-testid="button-cancel-edit-game"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateGameMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                    data-testid="button-save-game-changes"
                  >
                    {updateGameMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}