import { useState } from 'react';
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
  Plus
} from 'lucide-react';
import { insertTeamSchema } from '@shared/schema';

type LeagueMember = {
  id: string;
  userId: string;
  skillRating: number;
  status: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
};

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

export default function LeagueManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAccess } = useSubscription();
  const [activeTab, setActiveTab] = useState<'players' | 'teams' | 'games'>('players');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showScheduleGame, setShowScheduleGame] = useState(false);

  // Get league ID from URL params
  const leagueId = new URLSearchParams(window.location.search).get('leagueId') || '';
  
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
            onClick={() => navigate('/more')}
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
                        <p className="font-medium">{member.user.displayName}</p>
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
                    <div key={member.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex-1" data-testid={`member-${member.user.id}`}>
                        <p className="font-medium">{member.user.displayName}</p>
                        <p className="text-sm text-muted-foreground">{member.user.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-warning" />
                          <select
                            value={member.skillRating || 5}
                            onChange={(e) => 
                              skillRatingMutation.mutate({ 
                                membershipId: member.id, 
                                skillRating: parseInt(e.target.value) 
                              })
                            }
                            className="bg-background border border-border rounded px-2 py-1 text-sm"
                            data-testid={`skill-rating-${member.user.id}`}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                              <option key={rating} value={rating}>{rating}</option>
                            ))}
                          </select>
                        </div>
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
                          Captain: {members.find((m: LeagueMember) => m.userId === team.captainId)?.user.displayName || 'Not assigned'}
                        </p>
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
    </div>
  );
}