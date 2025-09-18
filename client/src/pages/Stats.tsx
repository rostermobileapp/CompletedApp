import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Trophy, Target, Clock, Medal, TrendingUp, Filter } from 'lucide-react';
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

export default function Stats() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [sortField, setSortField] = useState<string>('points');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Get user's primary league (for now, using first league they're in)
  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;
  const leagueId = primaryTeam?.leagueId;

  // Fetch league seasons for filtering
  const { data: seasons } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/seasons`],
    enabled: !!leagueId,
  });

  // Fetch player stats for the league
  const { data: playerStats, isLoading } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/stats${selectedSeason ? `?seasonId=${selectedSeason}` : ''}`],
    enabled: !!leagueId,
  });

  // Ensure playerStats is an array
  const statsArray = Array.isArray(playerStats) ? playerStats : [];

  // Sort the stats
  const sortedStats = statsArray.length > 0 ? [...statsArray].sort((a, b) => {
    let aVal, bVal;
    
    switch (sortField) {
      case 'points':
        aVal = (a.goals || 0) + (a.assists || 0);
        bVal = (b.goals || 0) + (b.assists || 0);
        break;
      case 'name':
        aVal = `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim();
        bVal = `${b.user.firstName || ''} ${b.user.lastName || ''}`.trim();
        break;
      default:
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
    }
    
    if (sortOrder === 'desc') {
      return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    } else {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    }
  }) : [];

  // Calculate leaders independently of current sort
  const getTopScorer = () => {
    if (statsArray.length === 0) return null;
    return statsArray.reduce((top, current) => {
      const topPoints = (top.goals || 0) + (top.assists || 0);
      const currentPoints = (current.goals || 0) + (current.assists || 0);
      return currentPoints > topPoints ? current : top;
    });
  };

  const getTopGoalScorer = () => {
    if (statsArray.length === 0) return null;
    return statsArray.reduce((top, current) => {
      return (current.goals || 0) > (top.goals || 0) ? current : top;
    });
  };

  const getTopAssistProvider = () => {
    if (statsArray.length === 0) return null;
    return statsArray.reduce((top, current) => {
      return (current.assists || 0) > (top.assists || 0) ? current : top;
    });
  };

  const getMostActivePlayer = () => {
    if (statsArray.length === 0) return null;
    return statsArray.reduce((top, current) => {
      return (current.gamesPlayed || 0) > (top.gamesPlayed || 0) ? current : top;
    });
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
        <div className="flex items-center gap-4 mb-6">
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
      </div>

      {/* Filters */}
      <div className="px-6 mb-6">
        <Card className="p-4" data-testid="card-filters">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold">Filters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Season Filter */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Season</label>
              <Select value={selectedSeason} onValueChange={setSelectedSeason} data-testid="select-season">
                <SelectTrigger>
                  <SelectValue placeholder="All Seasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Seasons</SelectItem>
                  {Array.isArray(seasons) ? seasons.map((season: any) => (
                    <SelectItem key={season.id} value={String(season.id)}>
                      {season.name}
                    </SelectItem>
                  )) : []}
                </SelectContent>
              </Select>
            </div>

            {/* Sort Field */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Sort By</label>
              <Select value={sortField} onValueChange={setSortField} data-testid="select-sort-field">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="points">Points</SelectItem>
                  <SelectItem value="goals">Goals</SelectItem>
                  <SelectItem value="assists">Assists</SelectItem>
                  <SelectItem value="gamesPlayed">Games Played</SelectItem>
                  <SelectItem value="penaltyMinutes">Penalty Minutes</SelectItem>
                  <SelectItem value="name">Player Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </div>

      {/* Stats Overview Cards */}
      {statsArray.length > 0 && (
        <div className="px-6 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Top Scorer */}
            <Card className="p-4 text-center" data-testid="card-top-scorer">
              <Target className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">
                {(() => {
                  const topScorer = getTopScorer();
                  return topScorer ? (topScorer.goals || 0) + (topScorer.assists || 0) : 0;
                })()}
              </p>
              <p className="text-xs text-muted-foreground">Top Points</p>
              <p className="text-xs font-medium mt-1">{getTopScorer()?.user.firstName || 'N/A'}</p>
            </Card>

            {/* Most Goals */}
            <Card className="p-4 text-center" data-testid="card-most-goals">
              <Medal className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-2xl font-bold">{getTopGoalScorer()?.goals || 0}</p>
              <p className="text-xs text-muted-foreground">Most Goals</p>
              <p className="text-xs font-medium mt-1">{getTopGoalScorer()?.user.firstName || 'N/A'}</p>
            </Card>

            {/* Most Assists */}
            <Card className="p-4 text-center" data-testid="card-most-assists">
              <TrendingUp className="w-8 h-8 text-info mx-auto mb-2" />
              <p className="text-2xl font-bold">{getTopAssistProvider()?.assists || 0}</p>
              <p className="text-xs text-muted-foreground">Most Assists</p>
              <p className="text-xs font-medium mt-1">{getTopAssistProvider()?.user.firstName || 'N/A'}</p>
            </Card>

            {/* Most Games */}
            <Card className="p-4 text-center" data-testid="card-most-games">
              <Clock className="w-8 h-8 text-warning mx-auto mb-2" />
              <p className="text-2xl font-bold">{getMostActivePlayer()?.gamesPlayed || 0}</p>
              <p className="text-xs text-muted-foreground">Most Games</p>
              <p className="text-xs font-medium mt-1">{getMostActivePlayer()?.user.firstName || 'N/A'}</p>
            </Card>
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