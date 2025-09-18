import { useState, useEffect } from 'react';
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
import { ArrowLeft, Users, User, Trophy, Target, AlertCircle, Clock } from 'lucide-react';
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
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [playerGameStats, setPlayerGameStats] = useState<Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }>>({});
  const [individualStats, setIndividualStats] = useState({ goals: '', assists: '', penaltyMinutes: '', gamesPlayed: '' });
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
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

  // Get games for selected league and season
  const { data: games = [] } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague}/games${selectedSeason ? `?seasonId=${selectedSeason}` : ''}`],
    enabled: !!selectedLeague && !!selectedSeason,
  });

  // Get players for selected league
  const { data: players = [] } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague}/players`],
    enabled: !!selectedLeague,
  });

  // Get game participants for selected game
  const { data: gameParticipants = [] } = useQuery({
    queryKey: [`/api/games/${selectedGame}/participants`],
    enabled: !!selectedGame,
  });

  // Initialize player stats when game participants are loaded
  useEffect(() => {
    if (Array.isArray(gameParticipants) && gameParticipants.length > 0) {
      const initialStats: Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }> = {};
      gameParticipants.forEach((player: Player) => {
        initialStats[player.id] = {
          goals: '',
          assists: '',
          penaltyMinutes: '',
          gamesPlayed: '1' // Default to 1 game played
        };
      });
      setPlayerGameStats(initialStats);
    } else {
      setPlayerGameStats({});
    }
  }, [gameParticipants]);

  // Get current player stats for individual editing
  const { data: currentPlayerStats } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague}/stats/players/${selectedPlayer}${selectedSeason ? `?seasonId=${selectedSeason}` : ''}`],
    enabled: !!selectedLeague && !!selectedPlayer && !!selectedSeason,
  });

  // Initialize individual stats when player changes
  useEffect(() => {
    if (currentPlayerStats) {
      const stats = currentPlayerStats as any;
      setIndividualStats({
        goals: String(stats.goals || 0),
        assists: String(stats.assists || 0),
        penaltyMinutes: String(stats.penaltyMinutes || 0),
        gamesPlayed: String(stats.gamesPlayed || 0),
      });
    }
  }, [currentPlayerStats]);

  // Update stats mutation
  const updateStatsMutation = useMutation({
    mutationFn: async ({ statsData, mode, seasonId }: { statsData: PlayerStats[]; mode: 'increment' | 'set'; seasonId: string }) => {
      const bulkPayload = {
        updates: statsData.map(stat => ({
          userId: stat.userId,
          stats: {
            goals: stat.goals,
            assists: stat.assists,
            penaltyMinutes: stat.penaltyMinutes,
            gamesPlayed: stat.gamesPlayed,
          }
        })),
        mode
      };
      const url = seasonId ? `/api/leagues/${selectedLeague}/stats/bulk?seasonId=${seasonId}` : `/api/leagues/${selectedLeague}/stats/bulk`;
      await apiRequest('POST', url, bulkPayload);
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Player statistics updated successfully.',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${selectedLeague}/stats`] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${selectedLeague}/stats/players`] });
      // Reset forms
      setPlayerGameStats({});
      setIndividualStats({ goals: '', assists: '', penaltyMinutes: '', gamesPlayed: '' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update statistics.',
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

  const handlePlayerStatsUpdate = () => {
    if (!selectedPlayer || !selectedLeague || !selectedSeason) {
      toast({
        title: 'Error',
        description: 'Please select a league, season, and player.',
        variant: 'destructive',
      });
      return;
    }

    const statsUpdate: PlayerStats[] = [{
      userId: selectedPlayer,
      leagueId: selectedLeague,
      seasonId: selectedSeason,
      goals: parseInt(individualStats.goals) || 0,
      assists: parseInt(individualStats.assists) || 0,
      penaltyMinutes: parseInt(individualStats.penaltyMinutes) || 0,
      gamesPlayed: parseInt(individualStats.gamesPlayed) || 0,
    }];

    updateStatsMutation.mutate({ 
      statsData: statsUpdate, 
      mode: 'set', 
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
      } else if (sortField === 'points') {
        const aGoals = parseInt(playerGameStats[a.id]?.goals || '0') || 0;
        const aAssists = parseInt(playerGameStats[a.id]?.assists || '0') || 0;
        const bGoals = parseInt(playerGameStats[b.id]?.goals || '0') || 0;
        const bAssists = parseInt(playerGameStats[b.id]?.assists || '0') || 0;
        aVal = aGoals + aAssists;
        bVal = bGoals + bAssists;
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

  return (
    <SubscriptionGate requiredTier="commissioner">
      <div className="min-h-screen bg-background pb-20">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Link href="/stats">
                <Button variant="ghost" size="sm" data-testid="button-back-stats">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h1 className="text-xl font-bold" data-testid="text-page-title">Manage Stats</h1>
            </div>
            <Trophy className="w-6 h-6 text-primary" />
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* League and Season Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
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
                      {Array.isArray(commissionerLeagues) && (commissionerLeagues as any[])
                        .filter((league: any) => league?.id) // Filter out leagues without ID
                        .map((league: any) => (
                        <SelectItem key={league.id} value={league.id}>
                          {league.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Season</Label>
                  <Select value={selectedSeason} onValueChange={setSelectedSeason} disabled={!selectedLeague} data-testid="select-season">
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
            <Tabs defaultValue="by-game" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="by-game" className="flex items-center gap-2" data-testid="tab-by-game">
                  <Users className="w-4 h-4" />
                  By Game
                </TabsTrigger>
                <TabsTrigger value="by-player" className="flex items-center gap-2" data-testid="tab-by-player">
                  <User className="w-4 h-4" />
                  By Player
                </TabsTrigger>
              </TabsList>

              {/* By Game Tab */}
              <TabsContent value="by-game" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Update Stats by Game
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
                          {Array.isArray(games) && games.map((game: Game) => (
                            <SelectItem key={game.id} value={game.id}>
                              <div className="flex items-center gap-2">
                                {game.isScrimmage && <Clock className="w-3 h-3" />}
                                {game.homeTeam.name} vs {game.awayTeam.name} - {format(new Date(game.scheduledAt), 'MMM d, yyyy')}
                                {game.homeScore !== null && game.awayScore !== null && 
                                  ` (${game.homeScore}-${game.awayScore})`
                                }
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedGame && Array.isArray(gameParticipants) && gameParticipants.length > 0 && (
                      <div className="space-y-4">
                        <div className="overflow-x-auto">
                          <Table data-testid="table-game-stats">
                            <TableHeader>
                              <TableRow>
                                <TableHead 
                                  className="cursor-pointer select-none" 
                                  onClick={() => handleSort('name')}
                                  data-testid="header-player-name"
                                >
                                  Player {getSortIcon('name')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('gamesPlayed')}
                                  data-testid="header-games-played"
                                >
                                  GP {getSortIcon('gamesPlayed')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('goals')}
                                  data-testid="header-goals"
                                >
                                  G {getSortIcon('goals')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('assists')}
                                  data-testid="header-assists"
                                >
                                  A {getSortIcon('assists')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('points')}
                                  data-testid="header-points"
                                >
                                  PTS {getSortIcon('points')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('penaltyMinutes')}
                                  data-testid="header-penalty-minutes"
                                >
                                  PIM {getSortIcon('penaltyMinutes')}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSortedPlayers(gameParticipants).map((player: Player, index: number) => (
                                <TableRow key={player.id} data-testid={`row-player-${player.id}`}>
                                  <TableCell className="font-medium" data-testid={`cell-name-${player.id}`}>
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
                                        {index + 1}
                                      </div>
                                      <div>
                                        <div className="font-medium">{player.firstName} {player.lastName}</div>
                                        {player.teamName && (
                                          <div className="text-sm text-muted-foreground">{player.teamName}</div>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-gamesplayed-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="1"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.gamesPlayed || '1'}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'gamesPlayed', e.target.value)}
                                      data-testid={`input-games-${player.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-goals-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.goals || ''}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'goals', e.target.value)}
                                      data-testid={`input-goals-${player.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-assists-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.assists || ''}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'assists', e.target.value)}
                                      data-testid={`input-assists-${player.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center text-blue-400 font-medium" data-testid={`cell-points-${player.id}`}>
                                    {(parseInt(playerGameStats[player.id]?.goals || '0') || 0) + (parseInt(playerGameStats[player.id]?.assists || '0') || 0)}
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-penalty-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.penaltyMinutes || ''}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'penaltyMinutes', e.target.value)}
                                      data-testid={`input-penalty-${player.id}`}
                                    />
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

              {/* By Player Tab */}
              <TabsContent value="by-player" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Update Player Stats by Individual
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Update stats for all league players individually. Changes are added to existing totals.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {selectedLeague && Array.isArray(players) && players.length > 0 && (
                      <div className="space-y-4">
                        <div className="overflow-x-auto">
                          <Table data-testid="table-player-stats">
                            <TableHeader>
                              <TableRow>
                                <TableHead 
                                  className="cursor-pointer select-none" 
                                  onClick={() => handleSort('name')}
                                  data-testid="header-player-name"
                                >
                                  Player {getSortIcon('name')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('gamesPlayed')}
                                  data-testid="header-games-played"
                                >
                                  GP {getSortIcon('gamesPlayed')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('goals')}
                                  data-testid="header-goals"
                                >
                                  G {getSortIcon('goals')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('assists')}
                                  data-testid="header-assists"
                                >
                                  A {getSortIcon('assists')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('points')}
                                  data-testid="header-points"
                                >
                                  PTS {getSortIcon('points')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer select-none text-center" 
                                  onClick={() => handleSort('penaltyMinutes')}
                                  data-testid="header-penalty-minutes"
                                >
                                  PIM {getSortIcon('penaltyMinutes')}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSortedPlayers(players).map((player: Player, index: number) => (
                                <TableRow key={player.id} data-testid={`row-player-${player.id}`}>
                                  <TableCell className="font-medium" data-testid={`cell-name-${player.id}`}>
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
                                        {index + 1}
                                      </div>
                                      <div>
                                        <div className="font-medium">{player.firstName} {player.lastName}</div>
                                        {player.teamName && (
                                          <div className="text-sm text-muted-foreground">{player.teamName}</div>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-gamesplayed-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.gamesPlayed || ''}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'gamesPlayed', e.target.value)}
                                      data-testid={`input-games-${player.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-goals-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.goals || ''}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'goals', e.target.value)}
                                      data-testid={`input-goals-${player.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-assists-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.assists || ''}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'assists', e.target.value)}
                                      data-testid={`input-assists-${player.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center text-blue-400 font-medium" data-testid={`cell-points-${player.id}`}>
                                    {(parseInt(playerGameStats[player.id]?.goals || '0') || 0) + (parseInt(playerGameStats[player.id]?.assists || '0') || 0)}
                                  </TableCell>
                                  <TableCell className="text-center" data-testid={`cell-penalty-${player.id}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      className="w-16 h-8 text-center"
                                      value={playerGameStats[player.id]?.penaltyMinutes || ''}
                                      onChange={(e) => updatePlayerGameStat(player.id, 'penaltyMinutes', e.target.value)}
                                      data-testid={`input-penalty-${player.id}`}
                                    />
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
                          data-testid="button-update-player-stats"
                        >
                          {updateStatsMutation.isPending ? 'Updating...' : 'Update All Player Stats'}
                        </Button>
                      </div>
                    )}

                    {selectedLeague && Array.isArray(players) && players.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground" data-testid="text-no-players">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                        <p>No players found in this league.</p>
                        <p className="text-sm">Players need to join teams in this league.</p>
                      </div>
                    )}

                    {!selectedLeague && (
                      <div className="text-center py-8 text-muted-foreground" data-testid="text-select-league">
                        <Users className="w-12 h-12 mx-auto mb-4" />
                        <p>Select a league to see all players.</p>
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