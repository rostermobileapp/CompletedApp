import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
                        <h3 className="font-medium" data-testid="text-game-participants">Game Participants</h3>
                        <div className="space-y-3">
                          {gameParticipants.map((player: Player) => (
                            <div key={player.id} className="border border-border rounded-lg p-3" data-testid={`player-stats-${player.id}`}>
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <p className="font-medium">{player.firstName} {player.lastName}</p>
                                  {player.teamName && (
                                    <p className="text-sm text-muted-foreground">{player.teamName}</p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Goals</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={playerGameStats[player.id]?.goals || ''}
                                    onChange={(e) => updatePlayerGameStat(player.id, 'goals', e.target.value)}
                                    data-testid={`input-goals-${player.id}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Assists</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={playerGameStats[player.id]?.assists || ''}
                                    onChange={(e) => updatePlayerGameStat(player.id, 'assists', e.target.value)}
                                    data-testid={`input-assists-${player.id}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Penalty Min</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={playerGameStats[player.id]?.penaltyMinutes || ''}
                                    onChange={(e) => updatePlayerGameStat(player.id, 'penaltyMinutes', e.target.value)}
                                    data-testid={`input-penalty-${player.id}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Games Played</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="1"
                                    value={playerGameStats[player.id]?.gamesPlayed || '1'}
                                    onChange={(e) => updatePlayerGameStat(player.id, 'gamesPlayed', e.target.value)}
                                    data-testid={`input-games-${player.id}`}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
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
                      Update Individual Player Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Player</Label>
                      <Select value={selectedPlayer} onValueChange={setSelectedPlayer} data-testid="select-player">
                        <SelectTrigger>
                          <SelectValue placeholder="Select a player" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.isArray(players) && players.map((player: Player) => (
                            <SelectItem key={player.id} value={player.id}>
                              {player.firstName} {player.lastName}
                              {player.teamName && ` (${player.teamName})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedPlayer && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label>Goals</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={individualStats.goals}
                              onChange={(e) => setIndividualStats(prev => ({ ...prev, goals: e.target.value }))}
                              data-testid="input-individual-goals"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Assists</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={individualStats.assists}
                              onChange={(e) => setIndividualStats(prev => ({ ...prev, assists: e.target.value }))}
                              data-testid="input-individual-assists"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Penalty Minutes</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={individualStats.penaltyMinutes}
                              onChange={(e) => setIndividualStats(prev => ({ ...prev, penaltyMinutes: e.target.value }))}
                              data-testid="input-individual-penalty"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Games Played</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={individualStats.gamesPlayed}
                              onChange={(e) => setIndividualStats(prev => ({ ...prev, gamesPlayed: e.target.value }))}
                              data-testid="input-individual-games"
                            />
                          </div>
                        </div>
                        
                        <Button 
                          onClick={handlePlayerStatsUpdate} 
                          disabled={updateStatsMutation.isPending}
                          className="w-full"
                          data-testid="button-update-player-stats"
                        >
                          {updateStatsMutation.isPending ? 'Updating...' : 'Update Player Stats'}
                        </Button>
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