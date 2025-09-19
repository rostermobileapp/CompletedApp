import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Trophy, Target, Clock, Medal, TrendingUp, Filter, Settings, Apple, Hand, Flag } from 'lucide-react';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlayerStatsUnion, GoalieStats, SkaterStats } from '@shared/schema';

export default function Stats() {
  const { user } = useAuth();
  const { hasAccess } = useSubscription();
  const [location, navigate] = useLocation();
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [sortField, setSortField] = useState<string>('points');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [playerType, setPlayerType] = useState<'goalies' | 'non-goalies'>('non-goalies');

  // Set default sort field based on player type
  useEffect(() => {
    if (playerType === 'goalies') {
      setSortField('wins');
    } else {
      setSortField('points');
    }
  }, [playerType]);

  // Get league ID from URL parameter if provided, otherwise use user's primary league
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const urlLeagueId = urlParams.get('league');

  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;
  const leagueId = urlLeagueId || primaryTeam?.leagueId;

  // Fetch league seasons for filtering
  const { data: seasons } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/seasons`],
    enabled: !!leagueId,
  });

  // Fetch player stats for the league
  const { data: playerStats, isLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'stats', { seasonId: selectedSeason, playerType }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedSeason && selectedSeason !== 'all') {
        params.append('seasonId', selectedSeason);
      }
      if (playerType) {
        params.append('playerType', playerType);
      }
      const query = params.toString();
      return fetch(`/api/leagues/${leagueId}/stats${query ? `?${query}` : ''}`).then(res => res.json());
    },
    enabled: !!leagueId,
  });

  // Ensure playerStats is an array
  const statsArray = Array.isArray(playerStats) ? playerStats : [];

  // Sort the stats based on player type
  const sortedStats = statsArray.length > 0 ? [...statsArray].sort((a: PlayerStatsUnion, b: PlayerStatsUnion) => {
    let aVal, bVal;
    
    if (playerType === 'goalies' && a.type === 'goalie' && b.type === 'goalie') {
      // Handle goalie stats sorting
      switch (sortField) {
        case 'wins':
          aVal = a.wins || 0;
          bVal = b.wins || 0;
          break;
        case 'losses':
          aVal = a.losses || 0;
          bVal = b.losses || 0;
          break;
        case 'goalsAgainstAverage':
        case 'gaa':
          aVal = a.goalsAgainstAverage || 0;
          bVal = b.goalsAgainstAverage || 0;
          break;
        case 'name':
          aVal = `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim();
          bVal = `${b.user?.firstName || ''} ${b.user?.lastName || ''}`.trim();
          break;
        default:
          aVal = a.gamesPlayed || 0;
          bVal = b.gamesPlayed || 0;
      }
    } else if (a.type === 'skater' && b.type === 'skater') {
      // Handle skater stats sorting
      switch (sortField) {
        case 'points':
          aVal = a.points || 0;
          bVal = b.points || 0;
          break;
        case 'goals':
          aVal = a.goals || 0;
          bVal = b.goals || 0;
          break;
        case 'assists':
          aVal = a.assists || 0;
          bVal = b.assists || 0;
          break;
        case 'name':
          aVal = `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim();
          bVal = `${b.user?.firstName || ''} ${b.user?.lastName || ''}`.trim();
          break;
        default:
          aVal = a.gamesPlayed || 0;
          bVal = b.gamesPlayed || 0;
      }
    } else {
      // Fallback for mixed types or unknown types
      aVal = 0;
      bVal = 0;
    }
    
    if (sortOrder === 'desc') {
      return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    } else {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    }
  }) : [];

  // Calculate leaders based on player type
  const getLeaders = () => {
    if (statsArray.length === 0) return null;
    
    if (playerType === 'goalies') {
      // Goalie leaders
      const goalieStats = statsArray.filter((stat): stat is GoalieStats => stat.type === 'goalie');
      if (goalieStats.length === 0) return null;

      const mostWins = goalieStats.reduce((top, current) => {
        return (current.wins || 0) > (top.wins || 0) ? current : top;
      });
      
      const bestGAA = goalieStats.reduce((top, current) => {
        const topGAA = top.goalsAgainstAverage || 999;
        const currentGAA = current.goalsAgainstAverage || 999;
        return (currentGAA < topGAA && current.gamesPlayed > 0) ? current : top;
      });
      
      const mostGames = goalieStats.reduce((top, current) => {
        return (current.gamesPlayed || 0) > (top.gamesPlayed || 0) ? current : top;
      });
      
      const fewestLosses = goalieStats.reduce((top, current) => {
        return (current.losses || 0) < (top.losses || 0) ? current : top;
      });
      
      return { mostWins, bestGAA, mostGames, fewestLosses };
    } else {
      // Skater leaders
      const skaterStats = statsArray.filter((stat): stat is SkaterStats => stat.type === 'skater');
      if (skaterStats.length === 0) return null;

      const topScorer = skaterStats.reduce((top, current) => {
        const topPoints = top.points || 0;
        const currentPoints = current.points || 0;
        return currentPoints > topPoints ? current : top;
      });
      
      const topGoalScorer = skaterStats.reduce((top, current) => {
        return (current.goals || 0) > (top.goals || 0) ? current : top;
      });
      
      const topAssistProvider = skaterStats.reduce((top, current) => {
        return (current.assists || 0) > (top.assists || 0) ? current : top;
      });
      
      const mostActivePlayer = skaterStats.reduce((top, current) => {
        return (current.gamesPlayed || 0) > (top.gamesPlayed || 0) ? current : top;
      });
      
      const mostPenaltyMinutes = skaterStats.reduce((top, current) => {
        return (current.penaltyMinutes || 0) > (top.penaltyMinutes || 0) ? current : top;
      });
      
      return { topScorer, topGoalScorer, topAssistProvider, mostActivePlayer, mostPenaltyMinutes };
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortOrder === 'desc' ? '↓' : '↑';
  };

  if (!leagueId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" data-testid="no-league-state">
        <Trophy className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">No League Found</h2>
        <p className="text-muted-foreground text-center mb-6">
          You need to join a league to view player stats
        </p>
        <Button 
          onClick={() => navigate('/league-search')}
          data-testid="button-find-league"
        >
          Find a League
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="stats-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setPageTransitionDirection('down');
                navigate('/');
              }}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Player Stats</h1>
          </div>
          
          {/* Commissioner Update Button */}
          {hasAccess('commissioner') && (
            <Button 
              onClick={() => {
                setPageTransitionDirection('up');
                navigate(leagueId ? `/stats-management?league=${leagueId}` : '/stats-management');
              }}
              size="sm"
              data-testid="button-update-stats"
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Update Stats
            </Button>
          )}
        </div>
      </div>
      {/* Filters */}
      <div className="px-6 mb-3">
        <Card className="p-2" data-testid="card-filters">
          <div className="flex items-center gap-4">
            {/* Season Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Season:</label>
              <Select value={selectedSeason} onValueChange={setSelectedSeason} data-testid="select-season">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Seasons</SelectItem>
                  {Array.isArray(seasons) ? seasons.map((season: any) => (
                    <SelectItem key={season.id} value={String(season.id)}>
                      {season.name}
                    </SelectItem>
                  )) : []}
                </SelectContent>
              </Select>
            </div>

            {/* Player Type Toggle */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Type:</label>
              <Button 
                variant="outline" 
                onClick={() => setPlayerType(playerType === 'goalies' ? 'non-goalies' : 'goalies')}
                className="justify-start"
                data-testid="button-toggle-player-type"
              >
                {playerType === 'goalies' ? 'Switch to Skaters' : 'Switch to Goalies'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
      {/* Stats Overview Cards */}
      {statsArray.length > 0 && (
        <div className="px-6 pl-[0px] pr-[0px] mt-[0px] mb-[0px]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pl-[12px] pr-[12px] pt-[2px] pb-[2px]">
            {playerType === 'goalies' ? (
              // Goalie overview cards
              ((() => {
                const leaders = getLeaders();
                return (
                  <>
                    {/* Most Wins */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-most-wins">
                      <div className="flex items-center gap-3">
                        <Trophy className="w-5 h-5 text-primary" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{leaders?.mostWins?.wins || 0}</span>
                          <span className="text-sm text-muted-foreground">Wins</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.mostWins?.user?.lastName || 'N/A'}</span>
                    </Card>

                    {/* Best GAA */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-best-gaa">
                      <div className="flex items-center gap-3">
                        <Target className="w-5 h-5 text-success" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{leaders?.bestGAA?.goalsAgainstAverage?.toFixed(2) || '0.00'}</span>
                          <span className="text-sm text-muted-foreground">GAA</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.bestGAA?.user?.lastName || 'N/A'}</span>
                    </Card>

                    {/* Most Games */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-most-games-goalie">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-info" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{leaders?.mostGames?.gamesPlayed || 0}</span>
                          <span className="text-sm text-muted-foreground">Games</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.mostGames?.user?.lastName || 'N/A'}</span>
                    </Card>

                    {/* Fewest Losses */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-fewest-losses">
                      <div className="flex items-center gap-3">
                        <Medal className="w-5 h-5 text-warning" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{leaders?.fewestLosses?.losses || 0}</span>
                          <span className="text-sm text-muted-foreground">Losses</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.fewestLosses?.user?.lastName || 'N/A'}</span>
                    </Card>
                  </>
                );
              })())
            ) : (
              // Skater overview cards
              ((() => {
                const leaders = getLeaders();
                return (
                  <>
                    {/* Top Scorer */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-top-scorer">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">
                            {leaders?.topScorer ? (leaders.topScorer.goals || 0) + (leaders.topScorer.assists || 0) : 0}
                          </span>
                          <span className="text-sm text-muted-foreground">Points</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.topScorer?.user?.lastName || 'N/A'}</span>
                    </Card>

                    {/* Most Goals */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-most-goals">
                      <div className="flex items-center gap-3">
                        <Target className="w-5 h-5 text-success" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{leaders?.topGoalScorer?.goals || 0}</span>
                          <span className="text-sm text-muted-foreground">Goals</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.topGoalScorer?.user?.lastName || 'N/A'}</span>
                    </Card>

                    {/* Most Assists */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-most-assists">
                      <div className="flex items-center gap-3">
                        <Apple className="w-5 h-5 text-info" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{leaders?.topAssistProvider?.assists || 0}</span>
                          <span className="text-sm text-muted-foreground">Assists</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.topAssistProvider?.user?.lastName || 'N/A'}</span>
                    </Card>

                    {/* Most Penalty Minutes */}
                    <Card className="p-3 h-10 flex items-center justify-between" data-testid="card-most-penalty-minutes">
                      <div className="flex items-center gap-3">
                        <Flag className="w-5 h-5 text-red-500" />
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{leaders?.mostPenaltyMinutes?.penaltyMinutes || 0}</span>
                          <span className="text-sm text-muted-foreground">PIM</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium truncate">{leaders?.mostPenaltyMinutes?.user?.lastName || 'N/A'}</span>
                    </Card>
                  </>
                );
              })())
            )}
          </div>
        </div>
      )}
      {/* Stats Table */}
      <div className="px-6">
        <Card data-testid="card-stats-table">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold" data-testid="text-stats-title">
              Player Statistics ({sortedStats.length} players)
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center" data-testid="loading-stats">
              <div className="animate-pulse">
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted rounded" />
                  ))}
                </div>
              </div>
            </div>
          ) : sortedStats.length === 0 ? (
            <div className="p-8 text-center" data-testid="no-stats-state">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No player statistics available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-stats">
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
                    {playerType === 'goalies' ? (
                      // Goalie table headers
                      (<>
                        <TableHead 
                          className="cursor-pointer select-none text-center" 
                          onClick={() => handleSort('wins')}
                          data-testid="header-wins"
                        >
                          W {getSortIcon('wins')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer select-none text-center" 
                          onClick={() => handleSort('losses')}
                          data-testid="header-losses"
                        >
                          L {getSortIcon('losses')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer select-none text-center" 
                          onClick={() => handleSort('ties')}
                          data-testid="header-ties"
                        >
                          T {getSortIcon('ties')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer select-none text-center" 
                          onClick={() => handleSort('shootoutLosses')}
                          data-testid="header-shootout-losses"
                        >
                          SOL {getSortIcon('shootoutLosses')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer select-none text-center" 
                          onClick={() => handleSort('goalsAgainstAverage')}
                          data-testid="header-gaa"
                        >
                          GAA {getSortIcon('goalsAgainstAverage')}
                        </TableHead>
                      </>)
                    ) : (
                      // Skater table headers
                      (<>
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
                      </>)
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStats.map((stat: any, index: number) => (
                    <TableRow key={stat.userId} data-testid={`row-player-${stat.userId}`}>
                      <TableCell className="font-medium" data-testid={`cell-name-${stat.userId}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium">
                              {stat.user.firstName} {stat.user.lastName}
                            </p>
                            {stat.user.city && (
                              <p className="text-xs text-muted-foreground">{stat.user.city}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`cell-gp-${stat.userId}`}>
                        {stat.gamesPlayed || 0}
                      </TableCell>
                      {playerType === 'goalies' ? (
                        // Goalie table cells
                        (<>
                          <TableCell className="text-center font-semibold" data-testid={`cell-wins-${stat.userId}`}>
                            {stat.wins || 0}
                          </TableCell>
                          <TableCell className="text-center font-semibold" data-testid={`cell-losses-${stat.userId}`}>
                            {stat.losses || 0}
                          </TableCell>
                          <TableCell className="text-center font-semibold" data-testid={`cell-ties-${stat.userId}`}>
                            {stat.ties || 0}
                          </TableCell>
                          <TableCell className="text-center font-semibold" data-testid={`cell-sol-${stat.userId}`}>
                            {stat.shootoutLosses || 0}
                          </TableCell>
                          <TableCell className="text-center font-bold text-primary" data-testid={`cell-gaa-${stat.userId}`}>
                            {stat.goalsAgainstAverage?.toFixed(2) || '0.00'}
                          </TableCell>
                        </>)
                      ) : (
                        // Skater table cells
                        (<>
                          <TableCell className="text-center font-semibold" data-testid={`cell-goals-${stat.userId}`}>
                            {stat.goals || 0}
                          </TableCell>
                          <TableCell className="text-center font-semibold" data-testid={`cell-assists-${stat.userId}`}>
                            {stat.assists || 0}
                          </TableCell>
                          <TableCell className="text-center font-bold text-primary" data-testid={`cell-points-${stat.userId}`}>
                            {(stat.goals || 0) + (stat.assists || 0)}
                          </TableCell>
                          <TableCell className="text-center text-warning font-medium" data-testid={`cell-pim-${stat.userId}`}>
                            {stat.penaltyMinutes || 0}
                          </TableCell>
                        </>)
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}