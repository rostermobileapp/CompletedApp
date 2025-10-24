import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, ChevronRight, Settings, Trophy, Star } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PlayerStatsUnion, GoalieStats, SkaterStats } from '@shared/schema';
import { FeatureLockOverlay } from '@/components/FeatureLockOverlay';

export default function Stats() {
  const { user } = useAuth();
  const { canAccessPremiumFeatures, canEditStats } = usePermissions();
  const [location, navigate] = useLocation();
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'skaters' | 'goalies'>('skaters');
  const [viewMode, setViewMode] = useState<'summary' | 'table'>('summary');
  const [sortBy, setSortBy] = useState<'points' | 'goals' | 'assists' | 'penaltyMinutes' | 'wins' | 'goalsAgainstAverage' | 'shutouts'>('points');

  // Use dashboard selection to determine league/team context
  const { selectedType, selectedId, selectedTeamId, selectedLeagueId } = useDashboardSelection();

  // Fetch user teams to get league info for selected team
  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  // Fetch user leagues
  const { data: userLeagues } = useQuery({
    queryKey: ['/api/user/leagues'],
  });

  // Determine effective league ID based on dashboard selection
  let leagueId: string | null | undefined = null;
  
  if (selectedType === 'league') {
    // Direct league selection
    leagueId = selectedLeagueId;
  } else if (selectedType === 'team' && selectedTeamId) {
    // Team selected - find its league
    const selectedTeam = Array.isArray(userTeams) 
      ? userTeams.find((t: any) => t.id === selectedTeamId)
      : null;
    leagueId = selectedTeam?.leagueId;
  } else {
    // Fallback to URL params or first league
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const urlLeagueId = urlParams.get('league');
    const urlTeamId = urlParams.get('team');
    
    if (urlLeagueId) {
      leagueId = urlLeagueId;
    } else if (urlTeamId && Array.isArray(userTeams)) {
      const teamFromUrl = userTeams.find((t: any) => t.id === urlTeamId);
      leagueId = teamFromUrl?.leagueId;
    } else {
      // Fallback to first league
      leagueId = Array.isArray(userLeagues) && userLeagues.length > 0 
        ? userLeagues[0].id 
        : null;
    }
  }

  // Fetch league seasons for filtering
  const { data: seasons } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/seasons`],
    enabled: !!leagueId,
  });

  // Auto-select current season when seasons are loaded
  useEffect(() => {
    if (Array.isArray(seasons) && seasons.length > 0 && !selectedSeason) {
      const activeSeason = seasons.find((s: any) => s.isActive);
      setSelectedSeason(activeSeason?.id || seasons[0].id);
    }
  }, [seasons, selectedSeason]);

  // Determine player type based on active tab
  const playerType = activeTab === 'goalies' ? 'goalies' : 'non-goalies';

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

  // Fetch star leaderboard
  const { data: starLeaderboard } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/star-leaderboard`],
    enabled: !!leagueId,
  });

  // Ensure playerStats is an array
  const statsArray = Array.isArray(playerStats) ? playerStats : [];

  // Fetch league memberships to get position and jersey number data
  const { data: leagueMemberships } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/members`],
    enabled: !!leagueId,
  });

  // Fetch league teams to get team names
  const { data: leagueTeams } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/teams`],
    enabled: !!leagueId,
  });

  // Create a map of userId to membership data
  const membershipMap = new Map();
  if (Array.isArray(leagueMemberships)) {
    leagueMemberships.forEach((membership: any) => {
      membershipMap.set(membership.userId, membership);
    });
  }

  // Create a map of teamId to team name
  const teamMap = new Map();
  if (Array.isArray(leagueTeams)) {
    leagueTeams.forEach((team: any) => {
      teamMap.set(team.id, team.name);
    });
  }

  // Filter stats based on active tab
  const filteredStats = statsArray.filter((stat: PlayerStatsUnion) => {
    if (activeTab === 'goalies') {
      return stat.type === 'goalie';
    } else {
      // Skaters - all non-goalies
      return stat.type === 'skater';
    }
  });

  // Get top players by category
  const getTopPlayers = (category: 'points' | 'goals' | 'assists' | 'penaltyMinutes' | 'wins' | 'goalsAgainstAverage' | 'shutouts', limit: number = 3) => {
    if (activeTab === 'goalies') {
      const goalieStats = filteredStats.filter((stat): stat is GoalieStats => stat.type === 'goalie');
      if (category === 'wins') {
        return goalieStats
          .sort((a, b) => (b.wins || 0) - (a.wins || 0))
          .slice(0, limit);
      } else if (category === 'goalsAgainstAverage') {
        // Filter out goalies with no games played, then sort by GAA (lower is better)
        return goalieStats
          .filter(g => g.gamesPlayed > 0)
          .sort((a, b) => (a.goalsAgainstAverage || 999) - (b.goalsAgainstAverage || 999))
          .slice(0, limit);
      } else if (category === 'shutouts') {
        return goalieStats
          .sort((a, b) => (b.shutouts || 0) - (a.shutouts || 0))
          .slice(0, limit);
      }
      return [];
    } else {
      const skaterStats = filteredStats.filter((stat): stat is SkaterStats => stat.type === 'skater');
      
      switch (category) {
        case 'points':
          return skaterStats
            .sort((a, b) => (b.points || 0) - (a.points || 0))
            .slice(0, limit);
        case 'goals':
          return skaterStats
            .sort((a, b) => (b.goals || 0) - (a.goals || 0))
            .slice(0, limit);
        case 'assists':
          return skaterStats
            .sort((a, b) => (b.assists || 0) - (a.assists || 0))
            .slice(0, limit);
        case 'penaltyMinutes':
          return skaterStats
            .sort((a, b) => (b.penaltyMinutes || 0) - (a.penaltyMinutes || 0))
            .slice(0, limit);
        default:
          return [];
      }
    }
  };

  // Handle stat card click to show full table
  const handleStatClick = (category: typeof sortBy) => {
    setSortBy(category);
    setViewMode('table');
  };

  // Handle back to summary
  const handleBackToSummary = () => {
    setViewMode('summary');
  };

  // Get sorted stats for table view
  const getSortedStatsForTable = () => {
    const stats = [...filteredStats];
    
    if (activeTab === 'goalies') {
      const goalieStats = stats.filter((stat): stat is GoalieStats => stat.type === 'goalie');
      
      switch (sortBy) {
        case 'wins':
          return goalieStats.sort((a, b) => (b.wins || 0) - (a.wins || 0));
        case 'goalsAgainstAverage':
          return goalieStats
            .filter(g => g.gamesPlayed > 0)
            .sort((a, b) => (a.goalsAgainstAverage || 999) - (b.goalsAgainstAverage || 999));
        case 'shutouts':
          return goalieStats.sort((a, b) => (b.shutouts || 0) - (a.shutouts || 0));
        default:
          return goalieStats;
      }
    } else {
      const skaterStats = stats.filter((stat): stat is SkaterStats => stat.type === 'skater');
      
      switch (sortBy) {
        case 'points':
          return skaterStats.sort((a, b) => (b.points || 0) - (a.points || 0));
        case 'goals':
          return skaterStats.sort((a, b) => (b.goals || 0) - (a.goals || 0));
        case 'assists':
          return skaterStats.sort((a, b) => (b.assists || 0) - (a.assists || 0));
        case 'penaltyMinutes':
          return skaterStats.sort((a, b) => (b.penaltyMinutes || 0) - (a.penaltyMinutes || 0));
        default:
          return skaterStats;
      }
    }
  };

  // Get initials for avatar fallback
  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    } else if (firstName) {
      return firstName[0].toUpperCase();
    } else if (lastName) {
      return lastName[0].toUpperCase();
    }
    return 'P';
  };

  // Format player name
  const formatPlayerName = (stat: PlayerStatsUnion) => {
    const membership = membershipMap.get(stat.userId);
    const firstName = membership?.displayFirstName || stat.user?.firstName;
    const lastName = membership?.displayLastName || stat.user?.lastName;
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else if (lastName) {
      return lastName;
    }
    return 'Unknown Player';
  };

  if (!leagueId) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6" data-testid="no-league-state">
        <Trophy className="w-16 h-16 text-gray-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No League Found</h2>
        <p className="text-gray-400 text-center mb-6">
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
    <div className="min-h-screen bg-black text-white pb-24" data-testid="stats-page">
      <FeatureLockOverlay isLocked={!canAccessPremiumFeatures() && !canEditStats()} className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-gray-800">
          <div className="px-4 pt-8 pb-3">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    setPageTransitionDirection('down');
                    navigate('/');
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold" data-testid="text-page-title">Stats</h1>
              </div>
              
              {canEditStats() && (
                <Button 
                  onClick={() => {
                    setPageTransitionDirection('up');
                    const params = new URLSearchParams();
                    if (leagueId) params.append('league', leagueId);
                    if (selectedSeason && selectedSeason !== 'all') params.append('season', selectedSeason);
                    navigate(`/stats-management${params.toString() ? `?${params.toString()}` : ''}`);
                  }}
                  size="sm"
                  variant="ghost"
                  data-testid="button-update-stats"
                  className="text-gray-400 hover:text-white"
                >
                  Update Stats
                </Button>
              )}
            </div>
            
            {/* Season Selector */}
            {Array.isArray(seasons) && seasons.length > 0 && (
              <div className="mt-3">
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="bg-gray-900 text-gray-300 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00A9FF] focus:border-transparent"
                  data-testid="select-season"
                >
                  <option value="all">All Seasons</option>
                  {seasons.map((season: any) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
            <TabsList className="w-full bg-transparent border-b border-gray-800 rounded-none h-auto p-0 gap-8 px-4">
              <TabsTrigger 
                value="skaters" 
                className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-[#00A9FF] data-[state=active]:bg-transparent px-0 pb-3 text-gray-400 data-[state=active]:text-white font-medium"
                data-testid="tab-skaters"
              >
                Skaters
              </TabsTrigger>
              <TabsTrigger 
                value="goalies" 
                className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-[#00A9FF] data-[state=active]:bg-transparent px-0 pb-3 text-gray-400 data-[state=active]:text-white font-medium"
                data-testid="tab-goalies"
              >
                Goalies
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Star Leaders Section */}
        {Array.isArray(starLeaderboard) && starLeaderboard.length > 0 && (
          <div className="px-4 py-4 bg-gradient-to-b from-yellow-900/10 to-transparent pt-[4px] pb-[4px] pl-[12px] pr-[12px]">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2" data-testid="text-star-leaders-title">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              Star Leaders
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {starLeaderboard.slice(0, 3).map((leader: any, index: number) => (
                <div 
                  key={leader.user.id} 
                  className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 flex items-start gap-2"
                  data-testid={`row-star-leader-${index}`}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={leader.user?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-gray-700 text-white text-xs">
                      {getInitials(leader.user?.firstName, leader.user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <div className="text-white font-medium text-sm" data-testid={`text-star-leader-name-${index}`}>
                      {leader.user.lastName}
                    </div>
                    <div className="text-xl font-bold text-yellow-500" data-testid={`text-star-points-${index}`}>
                      {leader.starPoints}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-4 py-6">
          {isLoading ? (
            <div className="space-y-6" data-testid="loading-stats">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-800 rounded w-20 mb-4" />
                  <div className="h-20 bg-gray-800 rounded" />
                </div>
              ))}
            </div>
          ) : filteredStats.length === 0 ? (
            <div className="text-center py-12" data-testid="no-stats-state">
              <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No player statistics available</p>
            </div>
          ) : viewMode === 'table' ? (
            /* Table View */
            (<div className="space-y-4">
              {/* Back button and title */}
              <div className="flex items-center gap-3 mb-6">
                <button 
                  onClick={handleBackToSummary}
                  className="text-gray-400 hover:text-white transition-colors"
                  data-testid="button-back-to-summary"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-white capitalize" data-testid="text-table-title">
                  {sortBy === 'penaltyMinutes' ? 'Penalty Minutes' : sortBy === 'goalsAgainstAverage' ? 'Goals Against Average' : sortBy}
                </h2>
              </div>
              {/* Stats Table */}
              <div className="overflow-auto border border-gray-800 rounded-lg">
                <table className="w-full" data-testid="table-stats">
                  <thead className="bg-gray-900 border-b border-gray-800">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">#</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Player</th>
                      {activeTab === 'skaters' ? (
                        <>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">GP</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">G</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">A</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">PTS</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">PIM</th>
                        </>
                      ) : (
                        <>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">GP</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">W</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">L</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">GAA</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">SO</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedStatsForTable().map((stat, index) => {
                      const membership = membershipMap.get(stat.userId);
                      return (
                        <tr key={stat.userId} className="border-b border-gray-800 hover:bg-gray-900/50" data-testid={`row-player-${index}`}>
                          <td className="px-4 py-3 text-gray-400 text-sm">{index + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={stat.user?.profileImageUrl || undefined} />
                                <AvatarFallback className="bg-gray-700 text-white text-xs">
                                  {getInitials(stat.user?.firstName, stat.user?.lastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="text-white text-sm font-medium">
                                  {formatPlayerName(stat)}
                                </div>
                                {membership && (
                                  <div className="text-gray-400 text-xs">
                                    {teamMap.get(membership.assignedTeamId) || 'N/A'} • #{membership.jerseyNumber || 'N/A'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          {activeTab === 'skaters' && stat.type === 'skater' ? (
                            <>
                              <td className="text-center px-4 py-3 text-white text-sm">{stat.gamesPlayed || 0}</td>
                              <td className="text-center px-4 py-3 text-white text-sm font-medium">{stat.goals || 0}</td>
                              <td className="text-center px-4 py-3 text-white text-sm">{stat.assists || 0}</td>
                              <td className="text-center px-4 py-3 text-white text-sm font-medium">{stat.points || 0}</td>
                              <td className="text-center px-4 py-3 text-white text-sm">{stat.penaltyMinutes || 0}</td>
                            </>
                          ) : stat.type === 'goalie' ? (
                            <>
                              <td className="text-center px-4 py-3 text-white text-sm">{stat.gamesPlayed || 0}</td>
                              <td className="text-center px-4 py-3 text-white text-sm font-medium">{stat.wins || 0}</td>
                              <td className="text-center px-4 py-3 text-white text-sm">{stat.losses || 0}</td>
                              <td className="text-center px-4 py-3 text-white text-sm font-medium">{stat.goalsAgainstAverage?.toFixed(2) || '0.00'}</td>
                              <td className="text-center px-4 py-3 text-white text-sm">{stat.shutouts || 0}</td>
                            </>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>)
          ) : (
            /* Summary View */
            (<div className="space-y-8">
              {/* Points Section */}
              {activeTab !== 'goalies' && (
                <StatSection
                  title="Points"
                  players={getTopPlayers('points', 3)}
                  renderStat={(stat) => (stat.type === 'skater' ? stat.points || 0 : 0)}
                  formatPlayerName={formatPlayerName}
                  getInitials={getInitials}
                  membershipMap={membershipMap}
                  teamMap={teamMap}
                  onClick={() => handleStatClick('points')}
                />
              )}
              {/* Goals Section */}
              {activeTab !== 'goalies' && (
                <StatSection
                  title="Goals"
                  players={getTopPlayers('goals', 1)}
                  renderStat={(stat) => (stat.type === 'skater' ? stat.goals || 0 : 0)}
                  formatPlayerName={formatPlayerName}
                  getInitials={getInitials}
                  showPosition={true}
                  membershipMap={membershipMap}
                  teamMap={teamMap}
                  onClick={() => handleStatClick('goals')}
                />
              )}
              {/* Assists Section */}
              {activeTab !== 'goalies' && (
                <StatSection
                  title="Assists"
                  players={getTopPlayers('assists', 5)}
                  renderStat={(stat) => (stat.type === 'skater' ? stat.assists || 0 : 0)}
                  formatPlayerName={formatPlayerName}
                  getInitials={getInitials}
                  showPosition={true}
                  showMoreIndicator={true}
                  membershipMap={membershipMap}
                  teamMap={teamMap}
                  onClick={() => handleStatClick('assists')}
                />
              )}
              {/* Penalty Minutes Section */}
              {activeTab !== 'goalies' && (
                <StatSection
                  title="Penalty Minutes"
                  players={getTopPlayers('penaltyMinutes', 1)}
                  renderStat={(stat) => (stat.type === 'skater' ? stat.penaltyMinutes || 0 : 0)}
                  formatPlayerName={formatPlayerName}
                  getInitials={getInitials}
                  showPosition={true}
                  membershipMap={membershipMap}
                  teamMap={teamMap}
                  onClick={() => handleStatClick('penaltyMinutes')}
                />
              )}
              {/* Wins Section (Goalies) */}
              {activeTab === 'goalies' && (
                <StatSection
                  title="Wins"
                  players={getTopPlayers('wins', 1)}
                  renderStat={(stat) => (stat.type === 'goalie' ? stat.wins || 0 : 0)}
                  formatPlayerName={formatPlayerName}
                  getInitials={getInitials}
                  showPosition={true}
                  membershipMap={membershipMap}
                  teamMap={teamMap}
                  onClick={() => handleStatClick('wins')}
                />
              )}
              {/* Goals Against Average Section (Goalies) */}
              {activeTab === 'goalies' && (
                <StatSection
                  title="Goals Against Average"
                  players={getTopPlayers('goalsAgainstAverage', 1)}
                  renderStat={(stat) => (stat.type === 'goalie' ? stat.goalsAgainstAverage?.toFixed(2) || '0.00' : '0.00')}
                  formatPlayerName={formatPlayerName}
                  getInitials={getInitials}
                  showPosition={true}
                  membershipMap={membershipMap}
                  teamMap={teamMap}
                  onClick={() => handleStatClick('goalsAgainstAverage')}
                />
              )}
              {/* Shutouts Section (Goalies) */}
              {activeTab === 'goalies' && (
                <StatSection
                  title="Shutouts"
                  players={getTopPlayers('shutouts', 1)}
                  renderStat={(stat) => (stat.type === 'goalie' ? stat.shutouts || 0 : 0)}
                  formatPlayerName={formatPlayerName}
                  getInitials={getInitials}
                  showPosition={true}
                  membershipMap={membershipMap}
                  teamMap={teamMap}
                  onClick={() => handleStatClick('shutouts')}
                />
              )}
            </div>)
          )}
        </div>
      </FeatureLockOverlay>
    </div>
  );
}

// Stat Section Component
interface StatSectionProps {
  title: string;
  players: PlayerStatsUnion[];
  renderStat: (stat: PlayerStatsUnion) => number | string;
  formatPlayerName: (stat: PlayerStatsUnion) => string;
  getInitials: (firstName?: string | null, lastName?: string | null) => string;
  showPosition?: boolean;
  showMoreIndicator?: boolean;
  membershipMap: Map<any, any>;
  teamMap: Map<any, any>;
  onClick?: () => void;
}

function StatSection({ 
  title, 
  players, 
  renderStat, 
  formatPlayerName, 
  getInitials, 
  showPosition = false,
  showMoreIndicator = false,
  membershipMap,
  teamMap,
  onClick
}: StatSectionProps) {
  if (players.length === 0) return null;

  // Check if there are tied players
  const topStat = renderStat(players[0]);
  const tiedPlayers = players.filter(p => renderStat(p) === topStat);
  const isTied = tiedPlayers.length > 1;

  return (
    <div data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <h2 className="text-[#00A9FF] text-sm font-semibold mb-3 uppercase tracking-wide" data-testid={`header-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        {title}
      </h2>
      <button
        onClick={onClick}
        className="w-full bg-[#0a0a0a] rounded-lg p-4 flex items-center justify-between hover:bg-gray-900 transition-colors group"
        data-testid={`button-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div className="flex items-center gap-4 flex-1">
          {/* Player Avatars */}
          <div className="flex -space-x-2">
            {isTied ? (
              // Show multiple avatars for tied players
              (<>
                {tiedPlayers.slice(0, 3).map((player, idx) => (
                  <Avatar key={idx} className="w-12 h-12 border-2 border-black" data-testid={`avatar-player-${idx}`}>
                    <AvatarImage src={player.user?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-gray-700 text-white text-sm">
                      {getInitials(player.user?.firstName, player.user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {tiedPlayers.length > 3 && (
                  <div className="w-12 h-12 rounded-full bg-gray-700 border-2 border-black flex items-center justify-center text-sm font-medium" data-testid="avatar-more">
                    +{tiedPlayers.length - 3}
                  </div>
                )}
              </>)
            ) : (
              // Show single avatar
              (<Avatar className="w-12 h-12" data-testid="avatar-player-single">
                <AvatarImage src={players[0].user?.profileImageUrl || undefined} />
                <AvatarFallback className="bg-gray-700 text-white text-sm">
                  {getInitials(players[0].user?.firstName, players[0].user?.lastName)}
                </AvatarFallback>
              </Avatar>)
            )}
          </div>

          {/* Player Info */}
          <div className="flex-1 text-left">
            <div className="text-white font-medium" data-testid="text-player-name">
              {isTied ? `${tiedPlayers.length} Tied` : formatPlayerName(players[0])}
            </div>
            {showPosition && !isTied && (() => {
              const membership = membershipMap.get(players[0].userId);
              return (
                <div className="text-gray-400 text-sm" data-testid="text-player-team">
                  {teamMap.get(membership?.assignedTeamId) || 'N/A'} • #{membership?.jerseyNumber || 'N/A'}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Stat Value */}
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-white" data-testid="text-stat-value">
            {renderStat(players[0])}
          </span>
          <ChevronRight className="w-5 h-5 text-[#00A9FF] group-hover:translate-x-1 transition-transform" data-testid="icon-chevron" />
        </div>
      </button>
    </div>
  );
}
