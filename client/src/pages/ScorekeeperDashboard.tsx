import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Users
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

  const { data: commissionerLeagues = [] } = useQuery<any[]>({
    queryKey: ['/api/leagues/commissioner'],
    enabled: !!user,
  });

  const { data: leaguePermissions } = useQuery<{ leagueSpecialPermissions?: string[] }>({
    queryKey: [`/api/leagues/${selectedLeague}/users/${user?.id}/permissions`],
    enabled: !!selectedLeague && !!user?.id,
  });

  const gamesQueryKey = `/api/scorekeeper/games?leagueId=${selectedLeague}`;
  const { data: games = [], isLoading: gamesLoading, error: gamesError } = useQuery<Game[]>({
    queryKey: [gamesQueryKey],
    enabled: !!selectedLeague,
  });

  const goalsQueryKey = `/api/games/${selectedGame?.id}/goals`;
  const { data: gameGoals = [], refetch: refetchGoals, isLoading: goalsLoading } = useQuery<GameGoal[]>({
    queryKey: [goalsQueryKey],
    enabled: !!selectedGame?.id,
  });

  const penaltiesQueryKey = `/api/games/${selectedGame?.id}/penalties`;
  const { data: gamePenalties = [], refetch: refetchPenalties, isLoading: penaltiesLoading } = useQuery<GamePenalty[]>({
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
  
  const rostersReady = homeTeamMembers.length > 0 && awayTeamMembers.length > 0;
  const rostersLoading = homeTeamLoading || awayTeamLoading;
  const rostersError = homeTeamError || awayTeamError;

  const createGoalMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string; scorerId: string; primaryAssistId?: string; secondaryAssistId?: string; period?: number }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/goals`, data);
    },
    onSuccess: () => {
      refetchGoals();
      toast({ title: 'Goal added successfully' });
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
      toast({ title: 'Penalty added successfully' });
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
  };

  const GoalEntry = ({ 
    team, 
    goals, 
    players 
  }: { 
    team: 'home' | 'away'; 
    goals: GameGoal[]; 
    players: TeamMember[];
  }) => {
    const [newGoal, setNewGoal] = useState({
      scorerId: '',
      primaryAssistId: '',
      secondaryAssistId: '',
      period: 1
    });

    const teamId = team === 'home' ? selectedGame?.homeTeam?.id : selectedGame?.awayTeam?.id;
    const teamName = team === 'home' ? selectedGame?.homeTeam?.name : selectedGame?.awayTeam?.name;

    const addGoal = () => {
      if (!newGoal.scorerId || !selectedGame || !teamId) {
        toast({ title: 'Please select a scorer', variant: 'destructive' });
        return;
      }

      createGoalMutation.mutate({
        gameId: selectedGame.id,
        teamId,
        scorerId: newGoal.scorerId,
        primaryAssistId: newGoal.primaryAssistId || undefined,
        secondaryAssistId: newGoal.secondaryAssistId || undefined,
        period: newGoal.period
      });

      setNewGoal({ scorerId: '', primaryAssistId: '', secondaryAssistId: '', period: 1 });
    };

    return (
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-center">{teamName}</CardTitle>
          <div className="text-center text-5xl font-bold text-primary" data-testid={`score-${team}`}>
            {goals.length}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Select value={newGoal.scorerId} onValueChange={(v) => setNewGoal({ ...newGoal, scorerId: v })}>
                <SelectTrigger data-testid={`select-scorer-${team}`}>
                  <SelectValue placeholder="Select Scorer *" />
                </SelectTrigger>
                <SelectContent>
                  {players.map(p => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.user.firstName} {p.user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={newGoal.primaryAssistId || "none"} onValueChange={(v) => setNewGoal({ ...newGoal, primaryAssistId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid={`select-primary-assist-${team}`}>
                  <SelectValue placeholder="Primary Assist (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {players.filter(p => p.userId !== newGoal.scorerId).map(p => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.user.firstName} {p.user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={newGoal.secondaryAssistId || "none"} onValueChange={(v) => setNewGoal({ ...newGoal, secondaryAssistId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid={`select-secondary-assist-${team}`}>
                  <SelectValue placeholder="Secondary Assist (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {players.filter(p => p.userId !== newGoal.scorerId && p.userId !== newGoal.primaryAssistId).map(p => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.user.firstName} {p.user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button 
                onClick={addGoal} 
                className="w-full" 
                disabled={createGoalMutation.isPending || players.length === 0}
                data-testid={`add-goal-${team}`}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Goal
              </Button>
            </div>

            <Separator />

            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {goals.map((goal, idx) => (
                  <div 
                    key={goal.id} 
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    data-testid={`goal-entry-${team}-${idx}`}
                  >
                    <div>
                      <div className="font-medium">
                        Goal #{idx + 1}: {goal.scorer.firstName} {goal.scorer.lastName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {goal.primaryAssist && `A1: ${goal.primaryAssist.firstName} ${goal.primaryAssist.lastName}`}
                        {goal.primaryAssist && goal.secondaryAssist && ', '}
                        {goal.secondaryAssist && `A2: ${goal.secondaryAssist.firstName} ${goal.secondaryAssist.lastName}`}
                        {!goal.primaryAssist && !goal.secondaryAssist && 'Unassisted'}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => deleteGoalMutation.mutate(goal.id)}
                      disabled={deleteGoalMutation.isPending}
                      data-testid={`delete-goal-${team}-${idx}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {goals.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No goals yet
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    );
  };

  const PenaltyEntry = ({
    team,
    penalties,
    players
  }: {
    team: 'home' | 'away';
    penalties: GamePenalty[];
    players: TeamMember[];
  }) => {
    const [newPenalty, setNewPenalty] = useState({
      playerId: '',
      minutes: 2,
      penaltyType: '',
      period: 1
    });

    const teamId = team === 'home' ? selectedGame?.homeTeam?.id : selectedGame?.awayTeam?.id;
    const teamName = team === 'home' ? selectedGame?.homeTeam?.name : selectedGame?.awayTeam?.name;

    const addPenalty = () => {
      if (!newPenalty.playerId || !selectedGame || !teamId) {
        toast({ title: 'Please select a player', variant: 'destructive' });
        return;
      }

      createPenaltyMutation.mutate({
        gameId: selectedGame.id,
        teamId,
        playerId: newPenalty.playerId,
        minutes: newPenalty.minutes,
        penaltyType: newPenalty.penaltyType || undefined,
        period: newPenalty.period
      });

      setNewPenalty({ playerId: '', minutes: 2, penaltyType: '', period: 1 });
    };

    const totalPIM = penalties.reduce((sum, p) => sum + (p.minutes || 0), 0);

    return (
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-center">{teamName} Penalties</CardTitle>
          <CardDescription className="text-center">
            Total PIM: <span className="font-bold">{totalPIM}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Select value={newPenalty.playerId} onValueChange={(v) => setNewPenalty({ ...newPenalty, playerId: v })}>
                <SelectTrigger data-testid={`select-penalty-player-${team}`}>
                  <SelectValue placeholder="Select Player *" />
                </SelectTrigger>
                <SelectContent>
                  {players.map(p => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.user.firstName} {p.user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={newPenalty.minutes.toString()} onValueChange={(v) => setNewPenalty({ ...newPenalty, minutes: parseInt(v) })}>
                <SelectTrigger data-testid={`select-penalty-minutes-${team}`}>
                  <SelectValue placeholder="Minutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 Minutes</SelectItem>
                  <SelectItem value="4">4 Minutes</SelectItem>
                  <SelectItem value="5">5 Minutes</SelectItem>
                  <SelectItem value="10">10 Minutes</SelectItem>
                </SelectContent>
              </Select>

              <Button 
                onClick={addPenalty} 
                variant="secondary"
                className="w-full" 
                disabled={createPenaltyMutation.isPending || players.length === 0}
                data-testid={`add-penalty-${team}`}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Add Penalty
              </Button>
            </div>

            <Separator />

            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {penalties.map((penalty, idx) => (
                  <div 
                    key={penalty.id} 
                    className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800"
                    data-testid={`penalty-entry-${team}-${idx}`}
                  >
                    <div>
                      <div className="font-medium">
                        {penalty.player.firstName} {penalty.player.lastName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {penalty.minutes} minutes {penalty.penaltyType && `- ${penalty.penaltyType}`}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => deletePenaltyMutation.mutate(penalty.id)}
                      disabled={deletePenaltyMutation.isPending}
                      data-testid={`delete-penalty-${team}-${idx}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {penalties.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No penalties
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
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

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/stats-management">
          <Button variant="ghost" size="icon" data-testid="back-button">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Scorekeeper Dashboard</h1>
          <p className="text-muted-foreground">Track live game scoring and manage stats</p>
        </div>
      </div>

      <div className="mb-6">
        <Select value={selectedLeague} onValueChange={setSelectedLeague}>
          <SelectTrigger className="w-full md:w-[400px]" data-testid="select-league">
            <SelectValue placeholder="Select a league to manage" />
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
          <TabsList className="mb-4">
            <TabsTrigger value="schedule" data-testid="tab-schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="scoring" disabled={!selectedGame} data-testid="tab-scoring">
              <Target className="mr-2 h-4 w-4" />
              Live Scoring
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Upcoming Games
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {gamesLoading ? (
                    <div className="text-center py-4">Loading games...</div>
                  ) : upcomingGames.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      No upcoming games scheduled
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Away Team</TableHead>
                          <TableHead>Home Team</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {upcomingGames.map((game) => (
                          <TableRow key={game.id} data-testid={`game-row-${game.id}`}>
                            <TableCell>
                              {format(new Date(game.scheduledAt), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                            <TableCell>{game.awayTeam?.name}</TableCell>
                            <TableCell>{game.homeTeam?.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {game.status || 'Scheduled'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button 
                                size="sm" 
                                onClick={() => selectGame(game)}
                                data-testid={`start-scoring-${game.id}`}
                              >
                                <Target className="mr-2 h-4 w-4" />
                                Score Game
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Completed Games
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {completedGames.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      No completed games yet
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Away Team</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Home Team</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completedGames.map((game) => (
                          <TableRow key={game.id}>
                            <TableCell>
                              {format(new Date(game.scheduledAt), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>{game.awayTeam?.name}</TableCell>
                            <TableCell className="font-bold">
                              {game.awayScore ?? 0} - {game.homeScore ?? 0}
                            </TableCell>
                            <TableCell>{game.homeTeam?.name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="scoring">
            {selectedGame && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>
                          {selectedGame.awayTeam?.name} @ {selectedGame.homeTeam?.name}
                        </CardTitle>
                        <CardDescription>
                          {format(new Date(selectedGame.scheduledAt), 'EEEE, MMMM d, yyyy h:mm a')}
                        </CardDescription>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl font-bold" data-testid="live-score">
                          {awayScore} - {homeScore}
                        </div>
                        <Badge>Live</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {rostersLoading && (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">Loading team rosters...</p>
                    </CardContent>
                  </Card>
                )}

                {rostersError && (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                      <p className="text-destructive">Failed to load team rosters. Please try again.</p>
                    </CardContent>
                  </Card>
                )}

                {!rostersLoading && !rostersError && (
                  <>
                    <div className="grid md:grid-cols-2 gap-6">
                      <GoalEntry 
                        team="away" 
                        goals={awayGoals} 
                        players={awayTeamMembers} 
                      />
                      <GoalEntry 
                        team="home" 
                        goals={homeGoals} 
                        players={homeTeamMembers} 
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <PenaltyEntry 
                        team="away" 
                        penalties={awayPenalties} 
                        players={awayTeamMembers} 
                      />
                      <PenaltyEntry 
                        team="home" 
                        penalties={homePenalties} 
                        players={homeTeamMembers} 
                      />
                    </div>
                  </>
                )}

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex gap-4 justify-center">
                      <Button 
                        variant="outline" 
                        onClick={() => setSelectedGame(null)}
                        data-testid="cancel-scoring"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={() => {
                          if (window.confirm(`Finalize game?\n\n${selectedGame.awayTeam?.name}: ${awayScore}\n${selectedGame.homeTeam?.name}: ${homeScore}\n\nThis will update all player stats and team standings.`)) {
                            finalizeGameMutation.mutate(selectedGame.id);
                          }
                        }}
                        disabled={finalizeGameMutation.isPending || rostersLoading}
                        data-testid="finalize-game"
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Finalize Game
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {!selectedLeague && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Select a League</h3>
            <p className="text-muted-foreground">
              Choose a league from the dropdown above to start managing game scores.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
