import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ArrowLeft, Users, Trophy, Target, AlertCircle, Clock, Plus, Minus } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  teamName?: string;
}

interface Game {
  id: string;
  scheduledAt: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeScore: number | null;
  awayScore: number | null;
  isScrimmage: boolean;
}

interface PlayerStats {
  id?: string;
  userId: string;
  leagueId: string;
  seasonId: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  penaltyMinutes: number;
  mode?: 'increment' | 'set'; // Distinguish between incremental vs absolute updates
}

export default function StatsManagement() {
  const { user } = useAuth();
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [playerGameStats, setPlayerGameStats] = useState<Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }>>({});
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Refs for scroll synchronization
  const gameTableHeaderRef = useRef<HTMLDivElement>(null);
  const gameTableBodyRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();

  // Get user's commissioner leagues
  const { data: commissionerLeagues = [] } = useQuery({
    queryKey: ['/api/leagues/commissioner'],
    enabled: !!user,
  });

  // Get seasons for selected league
  const { data: seasons = [] } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague}/seasons`],
    enabled: !!selectedLeague,
  });

  // Get players for selected league
  const { data: players = [] } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague}/players`],
    enabled: !!selectedLeague,
  });

  // Get games for selected league
  const { data: games = [] } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague}/games`],
    enabled: !!selectedLeague,
  });

  // Get game participants for selected game
  const { data: gameParticipants = [] } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague}/games/${selectedGame}/participants`],
    enabled: !!selectedGame,
  });

  // Initialize player stats when game participants change
  useEffect(() => {
    if (Array.isArray(gameParticipants) && gameParticipants.length > 0) {
      const initialStats: Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }> = {};
      
      gameParticipants.forEach((participant: any) => {
        initialStats[participant.userId] = {
          goals: '0',
          assists: '0', 
          penaltyMinutes: '0',
          gamesPlayed: '1'
        };
      });
      
      setPlayerGameStats(initialStats);
    }
  }, [gameParticipants]);

  // Scroll synchronization
  useEffect(() => {
    const syncScrolls = () => {
      const gameHeader = gameTableHeaderRef.current;
      const gameBody = gameTableBodyRef.current;

      const handleGameScroll = () => {
        if (gameHeader && gameBody) {
          gameHeader.scrollLeft = gameBody.scrollLeft;
        }
      };

      if (gameBody) {
        gameBody.addEventListener('scroll', handleGameScroll);
        console.log('Setting up player table scroll sync');
        return () => {
          gameBody.removeEventListener('scroll', handleGameScroll);
        };
      }
    };

    syncScrolls();
  }, [gameParticipants]);

  // Stats update mutation
  const updateStatsMutation = useMutation({
    mutationFn: async ({ statsData, mode, seasonId }: { statsData: PlayerStats[], mode: 'increment' | 'set', seasonId: string }) => {
      return apiRequest('POST', `/api/leagues/${selectedLeague}/stats/bulk`, {
        updates: statsData,
        mode,
        seasonId
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Player statistics updated successfully.',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${selectedLeague}/stats`] });
      // Reset form
      setPlayerGameStats({});
    },
    onError: (error: any) => {
      console.error('Error saving stats:', error);
      let errorMessage = 'Failed to update statistics.';
      
      // Handle different error types
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  const handleGameStatsUpdate = () => {
    if (!selectedGame || !selectedLeague || !selectedSeason) {
      toast({
        title: 'Error',
        description: 'Please select a league, season, and game.',
        variant: 'destructive',
      });
      return;
    }

    // Include all participants - each should get at least Games Played incremented
    const statsUpdates: PlayerStats[] = Object.entries(playerGameStats)
      .map(([userId, stats]) => ({
        userId,
        leagueId: selectedLeague,
        seasonId: selectedSeason,
        goals: parseInt(stats.goals) || 0,
        assists: parseInt(stats.assists) || 0,
        penaltyMinutes: parseInt(stats.penaltyMinutes) || 0,
        gamesPlayed: parseInt(stats.gamesPlayed) || 1, // Ensure every participant gets GP+1
      }));

    if (statsUpdates.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter statistics for at least one player.',
        variant: 'destructive',
      });
      return;
    }

    updateStatsMutation.mutate({ 
      statsData: statsUpdates, 
      mode: 'increment', 
      seasonId: selectedSeason 
    });
  };

  const updatePlayerGameStat = (userId: string, field: string, value: string) => {
    setPlayerGameStats(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value
      }
    }));
  };

  // Increment/Decrement functions
  const incrementStat = (userId: string, field: string) => {
    const currentStats = playerGameStats[userId] || { goals: '0', assists: '0', penaltyMinutes: '0', gamesPlayed: '0' };
    const currentValue = parseInt(currentStats[field as keyof typeof currentStats] || '0') || 0;
    const newValue = Math.max(0, currentValue + 1).toString();
    updatePlayerGameStat(userId, field, newValue);
  };

  const decrementStat = (userId: string, field: string) => {
    const currentStats = playerGameStats[userId] || { goals: '0', assists: '0', penaltyMinutes: '0', gamesPlayed: '0' };
    const currentValue = parseInt(currentStats[field as keyof typeof currentStats] || '0') || 0;
    const newValue = Math.max(0, currentValue - 1).toString();
    updatePlayerGameStat(userId, field, newValue);
  };

  // Sorting functions
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortOrder === 'desc' ? '↓' : '↑';
  };

  // Sort players for table display
  const getSortedPlayers = (playersList: Player[]) => {
    return [...playersList].sort((a, b) => {
      let aVal: any, bVal: any;
      
      if (sortField === 'name') {
        aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
        bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
      } else if (sortField === 'goals') {
        aVal = parseInt(playerGameStats[a.id]?.goals || '0') || 0;
        bVal = parseInt(playerGameStats[b.id]?.goals || '0') || 0;
      } else if (sortField === 'assists') {
        aVal = parseInt(playerGameStats[a.id]?.assists || '0') || 0;
        bVal = parseInt(playerGameStats[b.id]?.assists || '0') || 0;
      } else if (sortField === 'penaltyMinutes') {
        aVal = parseInt(playerGameStats[a.id]?.penaltyMinutes || '0') || 0;
        bVal = parseInt(playerGameStats[b.id]?.penaltyMinutes || '0') || 0;
      } else if (sortField === 'gamesPlayed') {
        aVal = parseInt(playerGameStats[a.id]?.gamesPlayed || '0') || 0;
        bVal = parseInt(playerGameStats[b.id]?.gamesPlayed || '0') || 0;
      }

      if (sortOrder === 'desc') {
        return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
      } else {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }
    });
  };

  // Filtered games for current season
  const filteredGames = useMemo(() => {
    if (!selectedSeason || !Array.isArray(games)) return [];
    return games.filter((game: Game) => {
      // Find season for this game
      const gameSeason = Array.isArray(seasons) ? seasons.find((s: any) => {
        const gameDate = new Date(game.scheduledAt);
        const seasonStart = new Date(s.startDate);
        const seasonEnd = new Date(s.endDate);
        return gameDate >= seasonStart && gameDate <= seasonEnd;
      }) : null;
      return gameSeason?.id === selectedSeason;
    });
  }, [games, seasons, selectedSeason]);

  return (
    <SubscriptionGate requiredTier="commissioner">
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/commissioner">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Commissioner Dashboard
                </Button>
              </Link>
            </div>
          </div>

          {/* League and Season Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                League & Season Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>League</Label>
                  <Select value={selectedLeague} onValueChange={setSelectedLeague} data-testid="select-league">
                    <SelectTrigger>
                      <SelectValue placeholder="Select a league" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(commissionerLeagues) && commissionerLeagues.map((league: any) => (
                        <SelectItem key={league.id} value={league.id}>
                          {league.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Season</Label>
                  <Select value={selectedSeason} onValueChange={setSelectedSeason} data-testid="select-season">
                    <SelectTrigger>
                      <SelectValue placeholder="Select a season" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(seasons) && seasons.map((season: any) => (
                        <SelectItem key={season.id} value={season.id}>
                          {season.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Management Tabs */}
          {selectedLeague && selectedSeason && (
            <Tabs defaultValue="by-game" className="space-y-4">
              <TabsList className="grid w-full grid-cols-1">
                <TabsTrigger value="by-game" className="flex items-center gap-2" data-testid="tab-by-game">
                  <Users className="w-4 h-4" />
                  By Game
                </TabsTrigger>
              </TabsList>

              {/* By Game Tab */}
              <TabsContent value="by-game" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Select Game
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Game</Label>
                      <Select value={selectedGame} onValueChange={setSelectedGame} data-testid="select-game">
                        <SelectTrigger>
                          <SelectValue placeholder="Select a game" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.isArray(filteredGames) && filteredGames.map((game: Game) => (
                            <SelectItem key={game.id} value={game.id}>
                              {game.homeTeam.name} vs {game.awayTeam.name} - {format(new Date(game.scheduledAt), 'MMM d, yyyy h:mm a')}
                              {game.isScrimmage && ' (Scrimmage)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedGame && Array.isArray(gameParticipants) && gameParticipants.length > 0 && (
                      <div className="space-y-4">
                        <div className="text-sm text-muted-foreground" data-testid="text-participants-count">
                          {gameParticipants.length} players found for this game
                        </div>
                        
                        {/* Fixed Header */}
                        <div ref={gameTableHeaderRef} className="border rounded-t-lg bg-background overflow-x-auto pointer-events-none">
                          <Table style={{minWidth: '600px'}}>
                            <TableHeader>
                              <TableRow>
                                <TableHead 
                                  className="cursor-pointer select-none w-32 bg-background"
                                  onClick={() => handleSort('name')}
                                  data-testid="header-name"
                                >
                                  Player {getSortIcon('name')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center w-16 bg-background"
                                  onClick={() => handleSort('gamesPlayed')}
                                  data-testid="header-games-played"
                                >
                                  GP {getSortIcon('gamesPlayed')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center w-16 bg-background"
                                  onClick={() => handleSort('goals')}
                                  data-testid="header-goals"
                                >
                                  G {getSortIcon('goals')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center w-16 bg-background"
                                  onClick={() => handleSort('assists')}
                                  data-testid="header-assists"
                                >
                                  A {getSortIcon('assists')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center w-16 bg-background"
                                  onClick={() => handleSort('penaltyMinutes')}
                                  data-testid="header-penalty-minutes"
                                >
                                  PIM {getSortIcon('penaltyMinutes')}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                          </Table>
                        </div>
                        
                        {/* Scrollable Table Body */}
                        <div ref={gameTableBodyRef} className="max-h-96 overflow-auto border-l border-r border-b rounded-b-lg">
                          <Table data-testid="table-game-stats" style={{minWidth: '600px'}}>
                            <TableBody>
                              {getSortedPlayers(gameParticipants).map((participant: any, index: number) => (
                                <TableRow key={participant.userId} data-testid={`row-participant-${participant.userId}`}>
                                  <TableCell className="font-medium w-32 pl-[2px] pr-[2px] pt-[5px] pb-[5px]" data-testid={`cell-name-${participant.userId}`}>
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
                                        {index + 1}
                                      </div>
                                      <div>
                                        <div className="font-medium">{participant.firstName} {participant.lastName}</div>
                                        {participant.teamName && (
                                          <div className="text-sm text-muted-foreground">{participant.teamName}</div>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center w-16 pl-[2px] pr-[2px] pt-[5px] pb-[5px] text-[14px]" data-testid={`cell-gamesplayed-${participant.userId}`}>
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white border-red-500"
                                        onClick={() => decrementStat(participant.userId, 'gamesPlayed')}
                                        data-testid={`button-minus-games-${participant.userId}`}
                                      >
                                        <Minus className="w-3 h-3" />
                                      </Button>
                                      <div 
                                        className="w-10 h-6 bg-muted rounded border flex items-center justify-center text-sm font-medium"
                                        data-testid={`display-games-${participant.userId}`}
                                      >
                                        {parseInt(playerGameStats[participant.userId]?.gamesPlayed || '0') || 0}
                                      </div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-green-500 hover:bg-green-600 text-white border-green-500"
                                        onClick={() => incrementStat(participant.userId, 'gamesPlayed')}
                                        data-testid={`button-plus-games-${participant.userId}`}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center w-16 pl-[2px] pr-[2px] pt-[5px] pb-[5px]" data-testid={`cell-goals-${participant.userId}`}>
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white border-red-500"
                                        onClick={() => decrementStat(participant.userId, 'goals')}
                                        data-testid={`button-minus-goals-${participant.userId}`}
                                      >
                                        <Minus className="w-3 h-3" />
                                      </Button>
                                      <div 
                                        className="w-10 h-6 bg-muted rounded border flex items-center justify-center text-sm font-medium"
                                        data-testid={`display-goals-${participant.userId}`}
                                      >
                                        {parseInt(playerGameStats[participant.userId]?.goals || '0') || 0}
                                      </div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-green-500 hover:bg-green-600 text-white border-green-500"
                                        onClick={() => incrementStat(participant.userId, 'goals')}
                                        data-testid={`button-plus-goals-${participant.userId}`}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center w-16 pl-[2px] pr-[2px] pt-[5px] pb-[5px]" data-testid={`cell-assists-${participant.userId}`}>
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white border-red-500"
                                        onClick={() => decrementStat(participant.userId, 'assists')}
                                        data-testid={`button-minus-assists-${participant.userId}`}
                                      >
                                        <Minus className="w-3 h-3" />
                                      </Button>
                                      <div 
                                        className="w-10 h-6 bg-muted rounded border flex items-center justify-center text-sm font-medium"
                                        data-testid={`display-assists-${participant.userId}`}
                                      >
                                        {parseInt(playerGameStats[participant.userId]?.assists || '0') || 0}
                                      </div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-green-500 hover:bg-green-600 text-white border-green-500"
                                        onClick={() => incrementStat(participant.userId, 'assists')}
                                        data-testid={`button-plus-assists-${participant.userId}`}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center w-16 pl-[2px] pr-[2px] pt-[5px] pb-[5px]" data-testid={`cell-penalty-${participant.userId}`}>
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white border-red-500"
                                        onClick={() => decrementStat(participant.userId, 'penaltyMinutes')}
                                        data-testid={`button-minus-penalty-${participant.userId}`}
                                      >
                                        <Minus className="w-3 h-3" />
                                      </Button>
                                      <div 
                                        className="w-10 h-6 bg-muted rounded border flex items-center justify-center text-sm font-medium"
                                        data-testid={`display-penalty-${participant.userId}`}
                                      >
                                        {parseInt(playerGameStats[participant.userId]?.penaltyMinutes || '0') || 0}
                                      </div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-6 h-6 p-0 bg-green-500 hover:bg-green-600 text-white border-green-500"
                                        onClick={() => incrementStat(participant.userId, 'penaltyMinutes')}
                                        data-testid={`button-plus-penalty-${participant.userId}`}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        
                        <Button 
                          onClick={handleGameStatsUpdate} 
                          disabled={updateStatsMutation.isPending}
                          className="w-full"
                          data-testid="button-update-game-stats"
                        >
                          {updateStatsMutation.isPending ? 'Updating...' : 'Update Game Stats'}
                        </Button>
                      </div>
                    )}

                    {selectedGame && Array.isArray(gameParticipants) && gameParticipants.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground" data-testid="text-no-participants">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                        <p>No participants found for this game.</p>
                        <p className="text-sm">Players need to be assigned to teams in this game.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </SubscriptionGate>
  );
}