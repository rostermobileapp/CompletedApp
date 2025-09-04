import { useState } from 'react';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { useSubscription } from '@/context/SubscriptionContext';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import {
  ArrowLeft,
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
  Settings
} from 'lucide-react';
import { insertTeamSchema } from '@shared/schema';

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

const editLeagueSchema = z.object({
  name: z.string().min(1, 'League name is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  season: z.string().optional(),
  isActive: z.boolean(),
});

type EditLeagueForm = z.infer<typeof editLeagueSchema>;

export default function LeagueManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAccess } = useSubscription();
  const [activeTab, setActiveTab] = useState<'players' | 'teams' | 'games'>('games');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LeagueMember | null>(null);
  const [showScheduleGame, setShowScheduleGame] = useState(false);
  const [showEditLeague, setShowEditLeague] = useState(false);
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
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update player details.',
        variant: 'destructive',
      });
    },
  });

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
                        <p className="text-sm text-muted-foreground">{member.user.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate(member.id)}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded-md text-sm font-medium disabled:opacity-50"
                          data-testid={`button-approve-${member.user.id}`}
                        >
                          <Check className="w-3 h-3" />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(member.id)}
                          disabled={rejectMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded-md text-sm font-medium disabled:opacity-50"
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
                <UserCheck className="w-5 h-5 text-green-500" />
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
                          {member.isCaptain && <Crown className="w-4 h-4 text-warning" />}
                          {member.jerseyNumber && (
                            <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                              #{member.jerseyNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{member.user.email}</p>
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
                  <Trophy className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Teams ({teams.length})</h3>
                </div>
                <button
                  onClick={() => setShowCreateTeam(!showCreateTeam)}
                  className="flex items-center gap-2 px-4 py-2 bg-warning text-black rounded-lg text-sm font-medium"
                  data-testid="button-create-team"
                >
                  <Plus className="w-4 h-4" />
                  Create Team
                </button>
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

              {/* Teams List */}
              {teams.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No teams created yet.</p>
              ) : (
                <div className="space-y-3">
                  {teams.map((team: Team) => (
                    <div key={team.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex-1" data-testid={`team-${team.id}`}>
                        <p className="font-medium">{team.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Captain: {members.find((m: LeagueMember) => m.userId === team.captainId)?.user ? formatUserName(members.find((m: LeagueMember) => m.userId === team.captainId)!.user) : 'Not assigned'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            // TODO: Implement team group messaging functionality
                            toast({ title: 'Team messaging feature coming soon!', description: `Start a group chat with ${team.name}` });
                          }}
                          className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2"
                          data-testid={`button-message-team-${team.id}`}
                        >
                          <Users className="w-4 h-4" />
                          Message Team
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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

              <p className="text-muted-foreground text-center py-8">
                Scheduled games will appear here and sync with the calendar.
              </p>
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
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
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
                    className="w-full px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm font-medium"
                  >
                    Remove from Team
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove this player from the league entirely? This cannot be undone.')) {
                        removeFromLeagueMutation.mutate(selectedPlayer.id);
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium"
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
                    <p className="text-red-500 text-sm mt-1">
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
    </div>
  );
}