import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
// 🚨 SUBSCRIPTION SYSTEM REMOVED - ALL FEATURES FREE! 🚨
// import { SubscriptionGate } from '@/components/SubscriptionGate'; // DELETED
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
import { Link, useLocation } from 'wouter';
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

interface PlayerStatsResponse {
  goals: number;
  assists: number;
  penaltyMinutes: number;
  gamesPlayed: number;
}

export default function StatsManagement() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  
  // Get league ID from URL parameter if provided
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const urlLeagueId = urlParams.get('league');
  
  const [selectedLeague, setSelectedLeague] = useState<string>(urlLeagueId || '');
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [playerGameStats, setPlayerGameStats] = useState<Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }>>({});
  const [individualPlayerStats, setIndividualPlayerStats] = useState<{ goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }>({ goals: '', assists: '', penaltyMinutes: '', gamesPlayed: '' });
  const [bulkPlayerStats, setBulkPlayerStats] = useState<Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }>>({});
  const [updateMode, setUpdateMode] = useState<'single' | 'bulk'>('bulk');
  
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
  const { data: players = [] } = useQuery<Player[]>({
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
    queryKey: [`/api/games/${selectedGame}/participants`],
    enabled: !!selectedGame,
  });

  // Get individual player stats for selected player
  const { data: currentPlayerStats } = useQuery<PlayerStatsResponse>({
    queryKey: [`/api/leagues/${selectedLeague}/stats/player/${selectedPlayer}`, selectedSeason],
    enabled: !!selectedLeague && !!selectedPlayer && !!selectedSeason,
  });

  // Get all players' stats for the season (for bulk mode)
  const { data: allPlayerStats = [] } = useQuery<Array<PlayerStatsResponse & { userId: string; firstName: string; lastName: string }>>({
    queryKey: [`/api/leagues/${selectedLeague}/stats/season/${selectedSeason}`],
    enabled: !!selectedLeague && !!selectedSeason,
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

  // Initialize individual player stats when current player stats change
  useEffect(() => {
    if (currentPlayerStats) {
      setIndividualPlayerStats({
        goals: currentPlayerStats.goals?.toString() || '0',
        assists: currentPlayerStats.assists?.toString() || '0',
        penaltyMinutes: currentPlayerStats.penaltyMinutes?.toString() || '0',
        gamesPlayed: currentPlayerStats.gamesPlayed?.toString() || '0'
      });
    } else {
      setIndividualPlayerStats({ goals: '0', assists: '0', penaltyMinutes: '0', gamesPlayed: '0' });
    }
  }, [currentPlayerStats]);

  // Initialize bulk player stats when all player stats change
  useEffect(() => {
    if (Array.isArray(allPlayerStats) && allPlayerStats.length > 0) {
      const initialBulkStats: Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }> = {};
      
      allPlayerStats.forEach((playerStat: any) => {
        initialBulkStats[playerStat.userId] = {
          goals: playerStat.goals?.toString() || '0',
          assists: playerStat.assists?.toString() || '0',
          penaltyMinutes: playerStat.penaltyMinutes?.toString() || '0',
          gamesPlayed: playerStat.gamesPlayed?.toString() || '0'
        };
      });
      
      setBulkPlayerStats(initialBulkStats);
    } else {
      // Initialize with players from the league if no stats exist yet
      if (Array.isArray(players) && players.length > 0) {
        const initialBulkStats: Record<string, { goals: string; assists: string; penaltyMinutes: string; gamesPlayed: string }> = {};
        
        (players as Player[]).forEach((player: Player) => {
          initialBulkStats[player.id] = {
            goals: '0',
            assists: '0',
            penaltyMinutes: '0',
            gamesPlayed: '0'
          };
        });
        
        setBulkPlayerStats(initialBulkStats);
      }
    }
  }, [allPlayerStats, players]);

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
    mutationFn: async ({ updates, mode, seasonId }: { updates: Array<{userId: string, stats: {goals: number, assists: number, penaltyMinutes: number, gamesPlayed: number}}>, mode: 'increment' | 'set', seasonId: string }) => {
      return apiRequest('POST', `/api/leagues/${selectedLeague}/stats/bulk`, {
        updates,
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
    const updates = Object.entries(playerGameStats)
      .map(([userId, stats]) => ({
        userId,
        stats: {
          goals: parseInt(stats.goals) || 0,
          assists: parseInt(stats.assists) || 0,
          penaltyMinutes: parseInt(stats.penaltyMinutes) || 0,
          gamesPlayed: parseInt(stats.gamesPlayed) || 1, // Ensure every participant gets GP+1
        }
      }));

    if (updates.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter statistics for at least one player.',
        variant: 'destructive',
      });
      return;
    }

    updateStatsMutation.mutate({ 
      updates, 
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

    const updates = [{
      userId: selectedPlayer,
      stats: {
        goals: parseInt(individualPlayerStats.goals) || 0,
        assists: parseInt(individualPlayerStats.assists) || 0,
        penaltyMinutes: parseInt(individualPlayerStats.penaltyMinutes) || 0,
        gamesPlayed: parseInt(individualPlayerStats.gamesPlayed) || 0,
      }
    }];

    updateStatsMutation.mutate({ 
      updates, 
      mode: 'set', // Use 'set' mode for absolute values
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

  const handleBulkStatsUpdate = () => {
    if (!selectedLeague || !selectedSeason) {
      toast({
        title: 'Error',
        description: 'Please select a league and season.',
        variant: 'destructive',
      });
      return;
    }

    const updates = Object.entries(bulkPlayerStats)
      .filter(([_, stats]) => 
        // Include any player with entered values (not empty strings)
        stats.goals !== '' || 
        stats.assists !== '' || 
        stats.penaltyMinutes !== '' || 
        stats.gamesPlayed !== ''
      )
      .map(([userId, stats]) => ({
        userId,
        stats: {
          goals: parseInt(stats.goals) || 0,
          assists: parseInt(stats.assists) || 0,
          penaltyMinutes: parseInt(stats.penaltyMinutes) || 0,
          gamesPlayed: parseInt(stats.gamesPlayed) || 1, // Keep min 1 for gamesPlayed
        }
      }));

    if (updates.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter statistics for at least one player.',
        variant: 'destructive',
      });
      return;
    }

    updateStatsMutation.mutate({ 
      updates, 
      mode: 'set', // Use 'set' mode for absolute values
      seasonId: selectedSeason 
    });
  };

  const updateBulkPlayerStat = (userId: string, field: string, value: string) => {
    setBulkPlayerStats(prev => ({
      ...prev,
      [userId]: {
        goals: '0',
        assists: '0',
        penaltyMinutes: '0',
        gamesPlayed: '1',
        ...prev[userId],
        [field]: value
      }
    }));
  };

  const incrementBulkPlayerStat = (userId: string, field: string) => {
    setBulkPlayerStats(prev => {
      const currentStats = prev[userId] || { goals: '0', assists: '0', penaltyMinutes: '0', gamesPlayed: '1' };
      const currentValue = parseInt(currentStats[field as keyof typeof currentStats] || (field === 'gamesPlayed' ? '1' : '0'));
      return {
        ...prev,
        [userId]: {
          ...currentStats,
          [field]: String(currentValue + 1)
        }
      };
    });
  };

  const decrementBulkPlayerStat = (userId: string, field: string) => {
    setBulkPlayerStats(prev => {
      const currentStats = prev[userId] || { goals: '0', assists: '0', penaltyMinutes: '0', gamesPlayed: '1' };
      const currentValue = parseInt(currentStats[field as keyof typeof currentStats] || (field === 'gamesPlayed' ? '1' : '0'));
      // Don't let gamesPlayed go below 1, other stats can go to 0
      const minValue = field === 'gamesPlayed' ? 1 : 0;
      const newValue = Math.max(minValue, currentValue - 1);
      return {
        ...prev,
        [userId]: {
          ...currentStats,
          [field]: String(newValue)
        }
      };
    });
  };

  const updateIndividualPlayerStat = (field: string, value: string) => {
    setIndividualPlayerStats(prev => ({
      ...prev,
      [field as keyof typeof prev]: value
    }));
  };

  const incrementIndividualPlayerStat = (field: string) => {
    setIndividualPlayerStats(prev => {
      const currentValue = parseInt(prev[field as keyof typeof prev] || (field === 'gamesPlayed' ? '1' : '0'));
      return {
        ...prev,
        [field as keyof typeof prev]: String(currentValue + 1)
      };
    });
  };

  const decrementIndividualPlayerStat = (field: string) => {
    setIndividualPlayerStats(prev => {
      const currentValue = parseInt(prev[field as keyof typeof prev] || (field === 'gamesPlayed' ? '1' : '0'));
      // Don't let gamesPlayed go below 1, other stats can go to 0
      const minValue = field === 'gamesPlayed' ? 1 : 0;
      const newValue = Math.max(minValue, currentValue - 1);
      return {
        ...prev,
        [field as keyof typeof prev]: String(newValue)
      };
    });
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

  // Sort players alphabetically by name
  const getSortedPlayersAlphabetically = (playersList: Player[]) => {
    return [...playersList].sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
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

  // 🚨 SUBSCRIPTION GATE REMOVED - FULL ACCESS FOR EVERYONE! 🚨
  return (
    // <SubscriptionGate requiredTier="commissioner"> // DELETED - ALL ACCESS GRANTED
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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="by-game" className="flex items-center gap-2" data-testid="tab-by-game">
                  <Users className="w-4 h-4" />
                  By Game
                </TabsTrigger>
                <TabsTrigger value="by-player" className="flex items-center gap-2" data-testid="tab-by-player">
                  <Target className="w-4 h-4" />
                  By Player
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

              {/* By Player Tab */}
              <TabsContent value="by-player" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Player Stats Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Mode Selection */}
                    <div className="flex items-center space-x-4">
                      <Label>Update Mode:</Label>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant={updateMode === 'bulk' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setUpdateMode('bulk')}
                          data-testid="button-bulk-mode"
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Bulk Update
                        </Button>
                        <Button
                          variant={updateMode === 'single' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setUpdateMode('single')}
                          data-testid="button-single-mode"
                        >
                          <Target className="w-4 h-4 mr-2" />
                          Single Player
                        </Button>
                      </div>
                    </div>

                    {/* Bulk Update Mode */}
                    {updateMode === 'bulk' && Array.isArray(players) && players.length > 0 && (
                      <div className="space-y-4">
                        <div className="text-sm text-muted-foreground" data-testid="text-bulk-players">
                          {players.length} players found - Edit stats for multiple players simultaneously
                        </div>
                        
                        <div className="max-h-96 overflow-auto border rounded-lg">
                          <Table data-testid="table-bulk-stats">
                            <TableHeader className="sticky top-0 bg-background z-10">
                              <TableRow>
                                <TableHead className="w-48">Player</TableHead>
                                <TableHead className="text-center w-20">Goals</TableHead>
                                <TableHead className="text-center w-20">Assists</TableHead>
                                <TableHead className="text-center w-20">PIM</TableHead>
                                <TableHead className="text-center w-20">GP</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSortedPlayersAlphabetically(players as Player[]).map((player: Player) => (
                                <TableRow key={player.id} data-testid={`row-bulk-player-${player.id}`}>
                                  <TableCell className="font-medium">
                                    <div>
                                      <div className="font-medium">{player.firstName} {player.lastName}</div>
                                      {player.teamName && (
                                        <div className="text-sm text-muted-foreground">{player.teamName}</div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center space-x-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => decrementBulkPlayerStat(player.id, 'goals')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-decrease-bulk-goals-${player.id}`}
                                      >
                                        -
                                      </Button>
                                      <Input
                                        type="number"
                                        value={bulkPlayerStats[player.id]?.goals || '0'}
                                        onChange={(e) => updateBulkPlayerStat(player.id, 'goals', e.target.value)}
                                        min="0"
                                        className="w-12 text-center p-1"
                                        data-testid={`input-bulk-goals-${player.id}`}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => incrementBulkPlayerStat(player.id, 'goals')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-increase-bulk-goals-${player.id}`}
                                      >
                                        +
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center space-x-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => decrementBulkPlayerStat(player.id, 'assists')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-decrease-bulk-assists-${player.id}`}
                                      >
                                        -
                                      </Button>
                                      <Input
                                        type="number"
                                        value={bulkPlayerStats[player.id]?.assists || '0'}
                                        onChange={(e) => updateBulkPlayerStat(player.id, 'assists', e.target.value)}
                                        min="0"
                                        className="w-12 text-center p-1"
                                        data-testid={`input-bulk-assists-${player.id}`}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => incrementBulkPlayerStat(player.id, 'assists')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-increase-bulk-assists-${player.id}`}
                                      >
                                        +
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center space-x-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => decrementBulkPlayerStat(player.id, 'penaltyMinutes')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-decrease-bulk-penalty-${player.id}`}
                                      >
                                        -
                                      </Button>
                                      <Input
                                        type="number"
                                        value={bulkPlayerStats[player.id]?.penaltyMinutes || '0'}
                                        onChange={(e) => updateBulkPlayerStat(player.id, 'penaltyMinutes', e.target.value)}
                                        min="0"
                                        className="w-12 text-center p-1"
                                        data-testid={`input-bulk-penalty-${player.id}`}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => incrementBulkPlayerStat(player.id, 'penaltyMinutes')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-increase-bulk-penalty-${player.id}`}
                                      >
                                        +
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center space-x-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => decrementBulkPlayerStat(player.id, 'gamesPlayed')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-decrease-bulk-games-${player.id}`}
                                      >
                                        -
                                      </Button>
                                      <Input
                                        type="number"
                                        value={bulkPlayerStats[player.id]?.gamesPlayed || '0'}
                                        onChange={(e) => updateBulkPlayerStat(player.id, 'gamesPlayed', e.target.value)}
                                        min="0"
                                        className="w-12 text-center p-1"
                                        data-testid={`input-bulk-games-${player.id}`}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => incrementBulkPlayerStat(player.id, 'gamesPlayed')}
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-increase-bulk-games-${player.id}`}
                                      >
                                        +
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        
                        <Button 
                          onClick={handleBulkStatsUpdate} 
                          disabled={updateStatsMutation.isPending}
                          className="w-full"
                          data-testid="button-update-bulk-stats"
                        >
                          {updateStatsMutation.isPending ? 'Updating...' : 'Update All Player Stats'}
                        </Button>
                      </div>
                    )}

                    {/* Single Player Mode */}
                    {updateMode === 'single' && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Player</Label>
                          <Select value={selectedPlayer} onValueChange={setSelectedPlayer} data-testid="select-player">
                            <SelectTrigger>
                              <SelectValue placeholder="Select a player" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.isArray(players) && getSortedPlayersAlphabetically(players as Player[]).map((player: Player) => (
                                <SelectItem key={player.id} value={player.id}>
                                  {player.firstName} {player.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedPlayer && (
                          <div className="space-y-4">
                            <div className="text-sm text-muted-foreground" data-testid="text-selected-player">
                              Editing stats for: {(players as Player[]).find((p: Player) => p.id === selectedPlayer)?.firstName} {(players as Player[]).find((p: Player) => p.id === selectedPlayer)?.lastName}
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="player-goals">Goals</Label>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => decrementIndividualPlayerStat('goals')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-decrease-player-goals"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    id="player-goals"
                                    type="number"
                                    value={individualPlayerStats.goals}
                                    onChange={(e) => updateIndividualPlayerStat('goals', e.target.value)}
                                    min="0"
                                    className="text-center"
                                    data-testid="input-player-goals"
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => incrementIndividualPlayerStat('goals')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-increase-player-goals"
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="player-assists">Assists</Label>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => decrementIndividualPlayerStat('assists')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-decrease-player-assists"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    id="player-assists"
                                    type="number"
                                    value={individualPlayerStats.assists}
                                    onChange={(e) => updateIndividualPlayerStat('assists', e.target.value)}
                                    min="0"
                                    className="text-center"
                                    data-testid="input-player-assists"
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => incrementIndividualPlayerStat('assists')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-increase-player-assists"
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="player-penalty">Penalty Minutes</Label>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => decrementIndividualPlayerStat('penaltyMinutes')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-decrease-player-penalty"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    id="player-penalty"
                                    type="number"
                                    value={individualPlayerStats.penaltyMinutes}
                                    onChange={(e) => updateIndividualPlayerStat('penaltyMinutes', e.target.value)}
                                    min="0"
                                    className="text-center"
                                    data-testid="input-player-penalty"
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => incrementIndividualPlayerStat('penaltyMinutes')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-increase-player-penalty"
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="player-games">Games Played</Label>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => decrementIndividualPlayerStat('gamesPlayed')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-decrease-player-games"
                                  >
                                    -
                                  </Button>
                                  <Input
                                    id="player-games"
                                    type="number"
                                    value={individualPlayerStats.gamesPlayed}
                                    onChange={(e) => updateIndividualPlayerStat('gamesPlayed', e.target.value)}
                                    min="0"
                                    className="text-center"
                                    data-testid="input-player-games"
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => incrementIndividualPlayerStat('gamesPlayed')}
                                    className="h-9 w-9 p-0"
                                    data-testid="button-increase-player-games"
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {currentPlayerStats && (
                              <div className="bg-muted/50 p-4 rounded-lg">
                                <h4 className="font-medium mb-2">Current Season Stats</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Goals:</span>
                                    <span className="ml-2 font-medium" data-testid="display-current-goals">{currentPlayerStats.goals || 0}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Assists:</span>
                                    <span className="ml-2 font-medium" data-testid="display-current-assists">{currentPlayerStats.assists || 0}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">PIM:</span>
                                    <span className="ml-2 font-medium" data-testid="display-current-penalty">{currentPlayerStats.penaltyMinutes || 0}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">GP:</span>
                                    <span className="ml-2 font-medium" data-testid="display-current-games">{currentPlayerStats.gamesPlayed || 0}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                            
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

                        {selectedPlayer && !currentPlayerStats && (
                          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-stats">
                            <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                            <p>No stats found for this player in the selected season.</p>
                            <p className="text-sm">Enter initial stats to create a record.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* No Players Message */}
                    {(!players || players.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground" data-testid="text-no-players">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                        <p>No players found in this league.</p>
                        <p className="text-sm">Players need to be added to the league first.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    );
}