import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Check, 
  Trophy, 
  Clock, 
  Target,
  AlertTriangle,
  Calendar,
  Users,
  X,
  Zap
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';

interface Game {
  id: string;
  scheduledAt: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  leagueId: string | null;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

interface TeamMember {
  userId: string;
  user: Player;
}

interface GameGoal {
  id: string;
  gameId: string;
  teamId: string;
  scorerId: string;
  primaryAssistId: string | null;
  secondaryAssistId: string | null;
  goalNumber: number;
  period: number;
  timestamp: string | null;
  isSubmitted: boolean;
  scorer: Player;
  primaryAssist?: Player | null;
  secondaryAssist?: Player | null;
  team: { id: string; name: string };
}

interface GamePenalty {
  id: string;
  gameId: string;
  teamId: string;
  playerId: string;
  penaltyNumber: number;
  minutes: number;
  penaltyType: string | null;
  period: number;
  timestamp: string | null;
  isSubmitted: boolean;
  player: Player;
  team: { id: string; name: string };
}

export default function ScorekeeperDashboard() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const urlLeagueId = urlParams.get('league');
  
  const [selectedLeague, setSelectedLeague] = useState<string>(urlLeagueId || '');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [activeTab, setActiveTab] = useState('schedule');
  const [showPenalties, setShowPenalties] = useState(false);

  const { data: commissionerLeagues = [] } = useQuery<any[]>({
    queryKey: ['/api/leagues/commissioner'],
    enabled: !!user,
  });

  const { data: leaguePermissions } = useQuery<{ leagueSpecialPermissions?: string[] }>({
    queryKey: [`/api/leagues/${selectedLeague}/users/${user?.id}/permissions`],
    enabled: !!selectedLeague && !!user?.id,
  });

  const gamesQueryKey = `/api/scorekeeper/games?leagueId=${selectedLeague}`;
  const { data: games = [], isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: [gamesQueryKey],
    enabled: !!selectedLeague,
  });

  const goalsQueryKey = `/api/games/${selectedGame?.id}/goals`;
  const { data: gameGoals = [], refetch: refetchGoals } = useQuery<GameGoal[]>({
    queryKey: [goalsQueryKey],
    enabled: !!selectedGame?.id,
  });

  const penaltiesQueryKey = `/api/games/${selectedGame?.id}/penalties`;
  const { data: gamePenalties = [], refetch: refetchPenalties } = useQuery<GamePenalty[]>({
    queryKey: [penaltiesQueryKey],
    enabled: !!selectedGame?.id,
  });

  const homeTeamQueryKey = `/api/teams/${selectedGame?.homeTeam?.id}/members`;
  const { data: homeTeamMembers = [], isLoading: homeTeamLoading, error: homeTeamError } = useQuery<TeamMember[]>({
    queryKey: [homeTeamQueryKey],
    enabled: !!selectedGame?.homeTeam?.id,
  });

  const awayTeamQueryKey = `/api/teams/${selectedGame?.awayTeam?.id}/members`;
  const { data: awayTeamMembers = [], isLoading: awayTeamLoading, error: awayTeamError } = useQuery<TeamMember[]>({
    queryKey: [awayTeamQueryKey],
    enabled: !!selectedGame?.awayTeam?.id,
  });

  const isCommissioner = commissionerLeagues.some((league: any) => league.id === selectedLeague);
  const userPermissions = (user as any)?.specialPermissions || [];
  const hasGlobalStatManager = userPermissions.includes('stat_manager');
  const hasLeagueStatManager = leaguePermissions?.leagueSpecialPermissions?.includes('stat_manager') || false;
  const hasAccess = isCommissioner || hasGlobalStatManager || hasLeagueStatManager;
  
  const rostersLoading = homeTeamLoading || awayTeamLoading;
  const rostersError = homeTeamError || awayTeamError;

  const createGoalMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string; scorerId: string; primaryAssistId?: string; secondaryAssistId?: string; period?: number }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/goals`, data);
    },
    onSuccess: () => {
      refetchGoals();
      toast({ title: 'Goal added' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add goal', description: error.message, variant: 'destructive' });
    }
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      return apiRequest('DELETE', `/api/games/${selectedGame?.id}/goals/${goalId}`);
    },
    onSuccess: () => {
      refetchGoals();
      toast({ title: 'Goal removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove goal', description: error.message, variant: 'destructive' });
    }
  });

  const createPenaltyMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string; playerId: string; minutes?: number; penaltyType?: string; period?: number }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/penalties`, data);
    },
    onSuccess: () => {
      refetchPenalties();
      toast({ title: 'Penalty added' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add penalty', description: error.message, variant: 'destructive' });
    }
  });

  const deletePenaltyMutation = useMutation({
    mutationFn: async (penaltyId: string) => {
      return apiRequest('DELETE', `/api/games/${selectedGame?.id}/penalties/${penaltyId}`);
    },
    onSuccess: () => {
      refetchPenalties();
      toast({ title: 'Penalty removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove penalty', description: error.message, variant: 'destructive' });
    }
  });

  const finalizeGameMutation = useMutation({
    mutationFn: async (gameId: string) => {
      return apiRequest('POST', `/api/games/${gameId}/finalize`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [gamesQueryKey] });
      toast({ title: 'Game finalized', description: 'Stats have been updated' });
      setSelectedGame(null);
      setActiveTab('schedule');
    },
    onError: (error: any) => {
      toast({ title: 'Failed to finalize game', description: error.message, variant: 'destructive' });
    }
  });

  const updateScoresMutation = useMutation({
    mutationFn: async (data: { gameId: string; homeScore: number; awayScore: number }) => {
      return apiRequest('PATCH', `/api/games/${data.gameId}/scores`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [gamesQueryKey] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update scores', description: error.message, variant: 'destructive' });
    }
  });

  const homeGoals = gameGoals.filter(g => g.teamId === selectedGame?.homeTeam?.id);
  const awayGoals = gameGoals.filter(g => g.teamId === selectedGame?.awayTeam?.id);
  const homePenalties = gamePenalties.filter(p => p.teamId === selectedGame?.homeTeam?.id);
  const awayPenalties = gamePenalties.filter(p => p.teamId === selectedGame?.awayTeam?.id);

  const homeScore = homeGoals.length;
  const awayScore = awayGoals.length;

  useEffect(() => {
    if (selectedGame && (homeScore !== selectedGame.homeScore || awayScore !== selectedGame.awayScore)) {
      updateScoresMutation.mutate({
        gameId: selectedGame.id,
        homeScore,
        awayScore
      });
    }
  }, [homeScore, awayScore, selectedGame?.id]);

  const upcomingGames = games.filter(g => g.status !== 'completed').sort((a, b) => 
    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
  
  const completedGames = games.filter(g => g.status === 'completed').sort((a, b) =>
    new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  const selectGame = (game: Game) => {
    setSelectedGame(game);
    setActiveTab('scoring');
    setShowPenalties(false);
  };

  // Compact Team Scoring Panel
  const TeamScoringPanel = ({ 
    team, 
    teamName,
    teamId,
    goals, 
    penalties,
    players 
  }: { 
    team: 'home' | 'away';
    teamName: string;
    teamId: string;
    goals: GameGoal[];
    penalties: GamePenalty[];
    players: TeamMember[];
  }) => {
    const [scorerId, setScorerId] = useState('');
    const [assistId, setAssistId] = useState('');
    const [secondaryAssistId, setSecondaryAssistId] = useState('');
    const [penaltyPlayerId, setPenaltyPlayerId] = useState('');
    const [penaltyMinutes, setPenaltyMinutes] = useState(2);
    const [goalModalOpen, setGoalModalOpen] = useState(false);

    const addGoal = () => {
      if (!scorerId || !selectedGame || !teamId) {
        toast({ title: 'Select a scorer', variant: 'destructive' });
        return;
      }
      createGoalMutation.mutate({
        gameId: selectedGame.id,
        teamId,
        scorerId,
        primaryAssistId: assistId || undefined,
        secondaryAssistId: secondaryAssistId || undefined
      });
      setScorerId('');
      setAssistId('');
      setSecondaryAssistId('');
      setGoalModalOpen(false);
    };

    const addPenalty = () => {
      if (!penaltyPlayerId || !selectedGame || !teamId) {
        toast({ title: 'Select a player', variant: 'destructive' });
        return;
      }
      createPenaltyMutation.mutate({
        gameId: selectedGame.id,
        teamId,
        playerId: penaltyPlayerId,
        minutes: penaltyMinutes
      });
      setPenaltyPlayerId('');
      setPenaltyMinutes(2);
    };

    const textColor = 'text-blue-500';

    return (
      <div className="flex-1 border rounded-lg p-3 bg-[#212121] border-border">
        {/* Team Header with Score */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg truncate">{team === 'home' ? 'HOME' : 'AWAY'}: {teamName}</h3>
          <div className={`text-5xl font-bold ${textColor}`} data-testid={`score-${team}`}>
            {goals.length}
          </div>
        </div>
        {!showPenalties ? (
          <>
            {/* Goal Button */}
            <div className="mb-2">
              <Button 
                onClick={() => setGoalModalOpen(true)}
                className="w-full h-10 bg-blue-500 hover:bg-blue-600 text-white font-bold"
                data-testid={`goal-button-${team}`}
              >
                <Zap className="mr-2 h-5 w-5" />
                GOAL
              </Button>
            </div>

            {/* Goal Modal */}
            <Dialog open={goalModalOpen} onOpenChange={setGoalModalOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Record Goal - {team === 'home' ? 'HOME' : 'AWAY'}: {teamName}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Scorer *</label>
                    <Select value={scorerId} onValueChange={setScorerId}>
                      <SelectTrigger data-testid={`modal-select-scorer-${team}`}>
                        <SelectValue placeholder="Select scorer" />
                      </SelectTrigger>
                      <SelectContent>
                        {players.map(p => (
                          <SelectItem key={p.userId} value={p.userId}>
                            {p.user.firstName} {p.user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">1st Assist (Optional)</label>
                    <Select value={assistId || "none"} onValueChange={(v) => setAssistId(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid={`modal-select-assist-${team}`}>
                        <SelectValue placeholder="Select 1st assist" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Assist</SelectItem>
                        {players.filter(p => p.userId !== scorerId).map(p => (
                          <SelectItem key={p.userId} value={p.userId}>
                            {p.user.firstName} {p.user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">2nd Assist (Optional)</label>
                    <Select value={secondaryAssistId || "none"} onValueChange={(v) => setSecondaryAssistId(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid={`modal-select-secondary-assist-${team}`}>
                        <SelectValue placeholder="Select 2nd assist" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No 2nd Assist</SelectItem>
                        {players.filter(p => p.userId !== scorerId && p.userId !== assistId).map(p => (
                          <SelectItem key={p.userId} value={p.userId}>
                            {p.user.firstName} {p.user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setGoalModalOpen(false);
                      setScorerId('');
                      setAssistId('');
                      setSecondaryAssistId('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={addGoal}
                    disabled={createGoalMutation.isPending || !scorerId}
                    className="bg-blue-500 hover:bg-blue-600"
                    data-testid={`confirm-goal-${team}`}
                  >
                    Confirm Goal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Goals List */}
            <div className="space-y-1 max-h-[calc(100vh-380px)] overflow-y-auto">
              {goals.map((goal, idx) => (
                <div 
                  key={goal.id} 
                  className="flex items-center justify-between py-1 px-2 bg-background/50 rounded text-sm"
                  data-testid={`goal-entry-${team}-${idx}`}
                >
                  <span className="truncate">
                    <span className="font-medium">{goal.scorer.firstName} {goal.scorer.lastName}</span>
                    {goal.primaryAssist && (
                      <span className="text-muted-foreground ml-1">
                        ({goal.primaryAssist.firstName.charAt(0)}. {goal.primaryAssist.lastName}
                        {goal.secondaryAssist && `, ${goal.secondaryAssist.firstName.charAt(0)}. ${goal.secondaryAssist.lastName}`})
                      </span>
                    )}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deleteGoalMutation.mutate(goal.id)}
                    disabled={deleteGoalMutation.isPending}
                    data-testid={`delete-goal-${team}-${idx}`}
                  >
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              {goals.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-2">No goals</div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Penalty Entry Row */}
            <div className="flex gap-2 mb-2">
              <Select value={penaltyPlayerId} onValueChange={setPenaltyPlayerId}>
                <SelectTrigger className="flex-1 h-9 text-sm" data-testid={`select-penalty-player-${team}`}>
                  <SelectValue placeholder="Player" />
                </SelectTrigger>
                <SelectContent>
                  {players.map(p => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.user.firstName} {p.user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={penaltyMinutes.toString()} onValueChange={(v) => setPenaltyMinutes(parseInt(v))}>
                <SelectTrigger className="w-20 h-9 text-sm" data-testid={`select-penalty-minutes-${team}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 min</SelectItem>
                  <SelectItem value="4">4 min</SelectItem>
                  <SelectItem value="5">5 min</SelectItem>
                  <SelectItem value="10">10 min</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={addPenalty} 
                size="sm"
                className="h-9 px-3"
                disabled={createPenaltyMutation.isPending || !penaltyPlayerId}
                data-testid={`add-penalty-${team}`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Penalties List */}
            <div className="space-y-1 max-h-[calc(100vh-380px)] overflow-y-auto">
              {penalties.map((penalty, idx) => (
                <div 
                  key={penalty.id} 
                  className="flex items-center justify-between py-1 px-2 bg-background/50 rounded text-sm"
                  data-testid={`penalty-entry-${team}-${idx}`}
                >
                  <span className="truncate">
                    <span className="font-medium">{penalty.player.firstName} {penalty.player.lastName}</span>
                    <span className="text-muted-foreground ml-1">({penalty.minutes} min)</span>
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deletePenaltyMutation.mutate(penalty.id)}
                    disabled={deletePenaltyMutation.isPending}
                    data-testid={`delete-penalty-${team}-${idx}`}
                  >
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              {penalties.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-2">No penalties</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p>Please log in to access the scorekeeper dashboard.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedLeague && !hasAccess && !gamesLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/stats-management">
            <Button variant="ghost" size="icon" data-testid="back-button">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Scorekeeper Dashboard</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You must be a commissioner or have stat_manager permission to access the scorekeeper dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Live Scoring Mode - Compact Full-Screen Layout
  if (selectedGame && activeTab === 'scoring') {
    return (
      <div className="h-screen flex flex-col p-3 overflow-hidden">
        {/* Compact Header Bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              onClick={() => { setSelectedGame(null); setActiveTab('schedule'); }}
              data-testid="back-to-schedule"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="font-bold text-lg">
                {selectedGame.awayTeam?.name} @ {selectedGame.homeTeam?.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(selectedGame.scheduledAt), 'MMM d, h:mm a')}
              </div>
            </div>
          </div>
          
          {/* Central Score Display */}
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-blue-500">{awayScore}</span>
            <span className="text-2xl text-muted-foreground">-</span>
            <span className="text-3xl font-bold text-blue-500">{homeScore}</span>
            <Badge variant="destructive" className="ml-2">LIVE</Badge>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button 
              variant={showPenalties ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPenalties(!showPenalties)}
              data-testid="toggle-penalties"
            >
              {showPenalties ? 'Goals' : 'Penalties'}
            </Button>
            <Button 
              size="sm"
              onClick={() => {
                if (window.confirm(`Finalize game?\n\n${selectedGame.awayTeam?.name}: ${awayScore}\n${selectedGame.homeTeam?.name}: ${homeScore}\n\nThis will update all player stats.`)) {
                  finalizeGameMutation.mutate(selectedGame.id);
                }
              }}
              disabled={finalizeGameMutation.isPending || rostersLoading}
              data-testid="finalize-game"
            >
              <Check className="mr-1 h-4 w-4" />
              Finalize
            </Button>
          </div>
        </div>

        {/* Loading/Error States */}
        {rostersLoading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Loading rosters...</p>
          </div>
        )}

        {rostersError && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-destructive">Failed to load rosters</p>
            </div>
          </div>
        )}

        {/* Main Scoring Area - Two Columns */}
        {!rostersLoading && !rostersError && (
          <div className="flex-1 flex gap-4 min-h-0">
            <TeamScoringPanel 
              team="away"
              teamName={selectedGame.awayTeam?.name || 'Away'}
              teamId={selectedGame.awayTeam?.id || ''}
              goals={awayGoals}
              penalties={awayPenalties}
              players={awayTeamMembers}
            />
            <TeamScoringPanel 
              team="home"
              teamName={selectedGame.homeTeam?.name || 'Home'}
              teamId={selectedGame.homeTeam?.id || ''}
              goals={homeGoals}
              penalties={homePenalties}
              players={homeTeamMembers}
            />
          </div>
        )}
      </div>
    );
  }

  // Schedule View (default)
  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="back-button">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Scorekeeper Dashboard</h1>
        </div>
      </div>

      <div className="mb-4">
        <Select value={selectedLeague} onValueChange={setSelectedLeague}>
          <SelectTrigger className="w-full md:w-[300px]" data-testid="select-league">
            <SelectValue placeholder="Select a league" />
          </SelectTrigger>
          <SelectContent>
            {commissionerLeagues.map((league: any) => (
              <SelectItem key={league.id} value={league.id}>
                {league.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedLeague && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="schedule" data-testid="tab-schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-4 w-4" />
                    Upcoming Games
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {gamesLoading ? (
                    <div className="text-center py-4">Loading...</div>
                  ) : upcomingGames.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No upcoming games
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {upcomingGames.map((game) => (
                        <div 
                          key={game.id} 
                          className="flex items-center justify-between p-2 bg-muted rounded-lg"
                          data-testid={`game-row-${game.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {game.awayTeam?.name} @ {game.homeTeam?.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(game.scheduledAt), 'MMM d, h:mm a')}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => selectGame(game)}
                            className="ml-2"
                            data-testid={`start-scoring-${game.id}`}
                          >
                            <Target className="mr-1 h-3 w-3" />
                            Score
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trophy className="h-4 w-4" />
                    Completed Games
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {completedGames.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No completed games
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {completedGames.map((game) => (
                        <div 
                          key={game.id} 
                          className="flex items-center justify-between p-2 bg-muted rounded-lg"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {game.awayTeam?.name} @ {game.homeTeam?.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(game.scheduledAt), 'MMM d')}
                            </div>
                          </div>
                          <div className="font-bold text-sm ml-2">
                            {game.awayScore ?? 0} - {game.homeScore ?? 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {!selectedLeague && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Select a League</h3>
            <p className="text-sm text-muted-foreground">
              Choose a league to start managing game scores.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
