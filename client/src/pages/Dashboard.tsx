import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search, Coffee, Check, X, Beer, Megaphone, BarChart3, Award, ChevronDown, Target, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import logoUrl from '@assets/Roster Logo White_1757083079896.png';
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';
import rostersLogoUrl from '@assets/Roster R White_1757096715093.png';

// Commissioner To-Do Component for Score Verification
function CommissionerToDo({ leagueId, onNavigate }: { 
  leagueId: string; 
  onNavigate: (path: string) => void; 
}) {
  // Fetch games that need score verification
  const { data: gamesNeedingVerification = [] } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      // Find games that have score submissions but are not yet completed
      const gamesNeedingVerification = [];
      const debugInfo = { totalGames: allGames.length, completedGames: 0, gamesWithSubmissions: 0, oldGames: [] };
      
      for (const game of allGames) {
        if (game.isCompleted) {
          debugInfo.completedGames++;
          continue; // Skip already completed games
        }
        
        // Check if game is from 9/7/2025 or earlier
        const gameDate = new Date(game.scheduledAt);
        const sept7 = new Date('2025-09-07');
        if (gameDate <= sept7) {
          debugInfo.oldGames.push({
            homeTeam: game.homeTeam?.name,
            awayTeam: game.awayTeam?.name,
            date: game.scheduledAt,
            isCompleted: game.isCompleted
          });
        }
        
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          const submissions = await submissionsResponse.json();
          
          // Include games that have at least one score submission
          if (Array.isArray(submissions) && submissions.length > 0) {
            debugInfo.gamesWithSubmissions++;
            gamesNeedingVerification.push(game);
          }
        } catch (error) {
          // Skip on error
          continue;
        }
      }
      
      // Store debug info globally for inspection
      (window as any).commissionerDebug = debugInfo;
      
      return gamesNeedingVerification;
    },
    enabled: !!leagueId,
  });

  if (!Array.isArray(gamesNeedingVerification) || gamesNeedingVerification.length === 0) {
    // Debug - show what we found
    const debugInfo = (window as any).commissionerDebug;
    return (
      <div className="px-6 mb-4">
        <div className="bg-yellow-100 border border-yellow-400 rounded-lg p-3 text-sm">
          <p>CommissionerToDo Debug:</p>
          <p>• Total games: {debugInfo?.totalGames || 0}</p>
          <p>• Completed games: {debugInfo?.completedGames || 0}</p>
          <p>• Games with submissions: {debugInfo?.gamesWithSubmissions || 0}</p>
          <p>• Old games (9/7 or earlier): {debugInfo?.oldGames?.length || 0}</p>
          {debugInfo?.oldGames?.length > 0 && (
            <div>
              <p>Old games details:</p>
              {debugInfo.oldGames.map((game: any, i: number) => (
                <p key={i}>- {game.homeTeam} vs {game.awayTeam} on {new Date(game.date).toLocaleDateString()} (completed: {String(game.isCompleted)})</p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 mb-4">
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <button
          onClick={() => onNavigate('/league-management')}
          className="w-full flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors rounded p-1"
          data-testid="button-commissioner-todo"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">
              {gamesNeedingVerification.length} game{gamesNeedingVerification.length === 1 ? '' : 's'} need score verification
            </span>
          </div>
          <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{gamesNeedingVerification.length}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

// Captain To-Do Component for Score Submission Tasks
function CaptainToDo({ leagueId, userTeams, onNavigate, onOpenScoreModal }: { 
  leagueId: string; 
  userTeams: any[]; 
  onNavigate: (path: string) => void; 
  onOpenScoreModal: (game: any) => void;
}) {
  const { toast } = useToast();

  // Fetch games that need score submission
  const { data: gamesNeedingScores = [] } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-scores'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Filter games that need score submission and check if user has already submitted
      const gamesNeedingUserSubmission = [];
      
      for (const game of allGames) {
        const gameStartTime = new Date(game.scheduledAt);
        const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
        const isUserGame = userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
        
        // Check basic criteria first
        if (!isUserGame || gameStartTime >= oneHourAgo || game.isCompleted) {
          continue;
        }
        
        // Check if user has already submitted their score for this game
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          const submissions = await submissionsResponse.json();
          
          // Check if current user has already submitted a score
          const userSubmission = Array.isArray(submissions) ? 
            submissions.find((sub: any) => userTeamIds.includes(sub.teamId)) : null;
          
          // Only include if user hasn't submitted yet
          if (!userSubmission) {
            gamesNeedingUserSubmission.push(game);
          }
        } catch (error) {
          // If we can't fetch submissions, include the game to be safe
          gamesNeedingUserSubmission.push(game);
        }
      }
      
      return gamesNeedingUserSubmission;
    },
    enabled: !!leagueId && Array.isArray(userTeams) && userTeams.length > 0,
  });

  if (!Array.isArray(gamesNeedingScores) || gamesNeedingScores.length === 0) {
    return null;
  }

  return (
    <div className="px-6 mb-6">
      <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-orange-600" />
          <h2 className="text-lg font-semibold text-orange-600">Captain To-Do</h2>
          <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{gamesNeedingScores.length}</span>
          </div>
        </div>
        
        <div className="space-y-3">
          {gamesNeedingScores.slice(0, 3).map((game: any) => (
            <div 
              key={game.id}
              className="bg-white dark:bg-card border border-orange-200 dark:border-orange-800 rounded-lg p-3 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
              onClick={() => onNavigate(`/game/${game.id}`)}
              data-testid={`card-score-needed-${game.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium text-orange-600">
                      Score submission needed
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {game.homeTeam?.name} vs {game.awayTeam?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(game.scheduledAt), 'MMM d • h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="text-xs h-7 px-2 bg-orange-500 text-white hover:bg-orange-600 border-orange-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenScoreModal(game);
                    }}
                    data-testid={`button-submit-score-${game.id}`}
                  >
                    Submit Score
                  </Button>
                </div>
              </div>
            </div>
          ))}
          
          {gamesNeedingScores.length > 3 && (
            <div className="text-center pt-2">
              <button
                onClick={() => onNavigate('/calendar')}
                className="text-orange-600 text-sm hover:underline"
                data-testid="button-view-all-score-tasks"
              >
                View all {gamesNeedingScores.length} games needing scores
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // League selection state
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Score submission modal state
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedGameForScore, setSelectedGameForScore] = useState<any>(null);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  
  const { data: upcomingGames, isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
    select: (games) => {
      // Filter games by selected league if available
      if (!selectedLeagueId || !Array.isArray(games)) return games;
      return games.filter(game => 
        game.homeTeam?.leagueId === selectedLeagueId || 
        game.awayTeam?.leagueId === selectedLeagueId
      );
    }
  });

  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
    select: (teams) => {
      // Filter teams by selected league if available
      if (!selectedLeagueId || !Array.isArray(teams)) return teams;
      return teams.filter(team => team.leagueId === selectedLeagueId);
    }
  });

  const { data: userLeagueMemberships } = useQuery({
    queryKey: ['/api/user/league-memberships'],
  });
  
  const { data: userLeagues } = useQuery({
    queryKey: ['/api/user/leagues'],
  });
  
  // Set default selected league when leagues load
  React.useEffect(() => {
    if (Array.isArray(userLeagues) && userLeagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(userLeagues[0].id);
    }
  }, [userLeagues, selectedLeagueId]);
  
  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowLeagueDropdown(false);
      }
    };

    if (showLeagueDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLeagueDropdown]);
  
  // Get currently selected league and membership
  const selectedLeague = Array.isArray(userLeagues) && selectedLeagueId
    ? userLeagues.find(league => league.id === selectedLeagueId)
    : Array.isArray(userLeagues) && userLeagues.length > 0 
      ? userLeagues[0] 
      : null;
      
  const selectedLeagueMembership = Array.isArray(userLeagueMemberships) && selectedLeagueId
    ? userLeagueMemberships.find(membership => membership.leagueId === selectedLeagueId)
    : Array.isArray(userLeagueMemberships) && userLeagueMemberships.length > 0 
      ? userLeagueMemberships[0] 
      : null;

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  // Fetch team record based on game scores
  const { data: teamRecord } = useQuery({
    queryKey: [`/api/teams/${primaryTeam?.id}/record`],
    enabled: !!primaryTeam?.id,
  });

  // Get user's attendance statuses
  const { data: userAttendanceStatuses } = useQuery({
    queryKey: ['/api/user/attendance-statuses'],
  });

  // Attendance mutations
  const checkInMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/check-in`, { teamId: data.teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/attendance-statuses'] });
      toast({
        title: "Success",
        description: "Checked in successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check in. Please try again.",
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/check-out`, { teamId: data.teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/attendance-statuses'] });
      toast({
        title: "Success",
        description: "Checked out successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Beverage duty mutation
  const claimBeverageDutyMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/beverage-duty`, { teamId: data.teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({
        title: "Success",
        description: "Beverage duty claimed!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to claim beverage duty. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Score submission mutation
  const scoreSubmissionMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      return await apiRequest("POST", `/api/games/${gameId}/submit-score`, { homeScore, awayScore });
    },
    onSuccess: () => {
      setShowScoreModal(false);
      setHomeScore('');
      setAwayScore('');
      setSelectedGameForScore(null);
      toast({
        title: "Score Submitted",
        description: "Game score has been submitted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit score. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleScoreSubmit = () => {
    const home = parseInt(homeScore);
    const away = parseInt(awayScore);
    if (!isNaN(home) && !isNaN(away) && home >= 0 && away >= 0 && selectedGameForScore) {
      scoreSubmissionMutation.mutate({ 
        gameId: selectedGameForScore.id, 
        homeScore: home, 
        awayScore: away 
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="dashboard-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <img 
              src={logoUrl}
              alt="Roster Logo" 
              className="h-6 w-auto"
              data-testid="img-roster-logo"
            />
          </div>
          <div className="flex items-center gap-3">
            
            
            {/* Captain Badge */}
            {selectedLeagueMembership?.isCaptain && (
              <span className="w-6 h-6 bg-warning text-black font-bold text-sm flex items-center justify-center rounded">
                C
              </span>
            )}
            
            <span 
              className={`tier-badge text-xs px-2 py-1 rounded-full font-semibold ${
                tier === 'commissioner' 
                  ? 'bg-warning text-black' 
                  : tier === 'player_plus' 
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
              }`}
              data-testid="badge-subscription-tier"
            >
              {tier === 'commissioner' ? 'COMMISSIONER' : tier === 'player_plus' ? 'PLAYER PLUS' : 'FREE'}
            </span>
            
            <button 
              onClick={() => navigate('/profile')}
              className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-primary"
              data-testid="button-profile"
            >
              {user?.profileImageUrl ? (
                <img 
                  src={user.profileImageUrl} 
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary-foreground text-sm font-semibold">
                  {user?.firstName?.[0] || 'U'}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
      {/* League Selection Dropdown */}
      {Array.isArray(userLeagues) && userLeagues.length > 0 && (
        <div className="px-6 mb-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowLeagueDropdown(!showLeagueDropdown)}
              className="w-full bg-card border border-border rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              data-testid="button-league-selector"
            >
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">
                  {selectedLeague?.name || 'Select League'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showLeagueDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showLeagueDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50">
                {userLeagues.map((league: any) => {
                  const membership = Array.isArray(userLeagueMemberships) 
                    ? userLeagueMemberships.find(m => m.leagueId === league.id)
                    : null;
                  return (
                    <button
                      key={league.id}
                      onClick={() => {
                        setSelectedLeagueId(league.id);
                        setShowLeagueDropdown(false);
                      }}
                      className={`w-full p-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        selectedLeagueId === league.id ? 'bg-primary/10 text-primary' : ''
                      }`}
                      data-testid={`option-league-${league.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4" />
                        <span className="font-medium text-sm">{league.name}</span>
                        {membership?.isCaptain && (
                          <span className="ml-auto w-4 h-4 bg-warning text-black font-bold text-xs flex items-center justify-center rounded">
                            C
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {/* 3-Card Section */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {/* Announcements Card */}
          <div className="bg-card rounded-xl border border-border p-5 min-h-[72px] relative" data-testid="card-announcements">
            <div className="h-full flex flex-col items-center justify-center">
              <Megaphone className="w-8 h-8 text-orange-500 mb-3" />
              <p className="text-xs font-medium">Announcements</p>
            </div>
            <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">3</span>
            </div>
          </div>

          {/* Stats Card */}
          <div className="bg-card rounded-xl border border-border p-5 min-h-[72px]" data-testid="card-stats">
            <div className="h-full flex flex-col items-center justify-center">
              <BarChart3 className="w-8 h-8 text-purple-500 mb-3" />
              <p className="text-xs font-medium">Stats</p>
            </div>
          </div>

          {/* Standings Card */}
          <div className="bg-card rounded-xl border border-border p-5 min-h-[72px]" data-testid="card-standings">
            <div className="h-full flex flex-col items-center justify-center">
              <Award className="w-8 h-8 text-blue-500 mb-3" />
              <p className="text-xs font-medium">Standings</p>
            </div>
          </div>
        </div>
      </div>
      {/* Quick Stats */}
      {primaryTeam && (
        <div className="px-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border p-4" data-testid="card-games-stat">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-games-remaining">
                    {teamRecord?.gamesRemaining ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Games Remaining</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4" data-testid="card-record-stat">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-team-record">
                    {teamRecord ? `${teamRecord.wins}-${teamRecord.losses}-${teamRecord.ties}` : '0-0-0'}
                  </p>
                  <p className="text-xs text-muted-foreground">Team Record</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Captain To-Do Section */}
      {selectedLeagueMembership?.isCaptain && selectedLeagueId && (
        <CaptainToDo 
          leagueId={selectedLeagueId} 
          userTeams={userTeams} 
          onNavigate={navigate}
          onOpenScoreModal={(game) => {
            setSelectedGameForScore(game);
            setShowScoreModal(true);
          }}
        />
      )}
      {/* Commissioner To-Do Section */}
      {tier === 'commissioner' && selectedLeagueId && (
        <CommissionerToDo 
          leagueId={selectedLeagueId} 
          onNavigate={navigate}
        />
      )}
      {/* Debug info - remove later */}
      {tier === 'commissioner' && (
        <div className="px-6 mb-4">
          <div className="border border-yellow-400 rounded-lg p-3 text-sm bg-[#ef444482]">
            <p>Debug: tier={tier}, selectedLeagueId={selectedLeagueId}</p>
            <p>Condition result: {String(tier === 'commissioner' && selectedLeagueId)}</p>
          </div>
        </div>
      )}
      {/* Upcoming Games */}
      <div className="px-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-schedule-title">Schedule</h2>
          <button 
            onClick={() => navigate('/calendar')}
            className="text-primary text-sm"
            data-testid="button-view-all-games"
          >
            View All
          </button>
        </div>
        
        {gamesLoading ? (
          <div className="bg-card rounded-xl border border-border p-4 animate-pulse" data-testid="loading-upcoming-games">
            <div className="h-16 bg-muted rounded"></div>
          </div>
        ) : Array.isArray(upcomingGames) && upcomingGames.length > 0 ? (
          <div className="space-y-3">
            {upcomingGames
              .filter((game: any) => {
                // Ensure we only show games for teams the user is currently on
                const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
                return userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
              })
              .slice(0, 2).map((game: any) => (
              <div 
                key={game.id} 
                className="bg-card rounded-xl border border-border p-4 relative cursor-pointer hover:bg-muted/50 transition-colors" 
                onClick={() => navigate(`/game/${game.id}`)}
                data-testid={`card-game-${game.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center relative">
                    {(() => {
                      const opponentTeam = game.homeTeam?.id === primaryTeam?.id ? game.awayTeam : game.homeTeam;
                      return opponentTeam?.logoUrl ? (
                        <img 
                          src={opponentTeam.logoUrl} 
                          alt={`${opponentTeam.name} logo`}
                          className="w-full h-full rounded-lg object-cover"
                          data-testid={`img-opponent-logo-${game.id}`}
                        />
                      ) : (
                        <Trophy className="w-6 h-6 text-primary-foreground" />
                      );
                    })()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" data-testid={`text-game-opponent-${game.id}`}>
                      vs {game.homeTeam?.id === primaryTeam?.id ? game.awayTeam?.name : game.homeTeam?.name}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-game-time-${game.id}`}>
                      {format(new Date(game.scheduledAt), 'MMM d • h:mm a')}
                    </p>
                    {game.venue && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-game-venue-${game.id}`}>
                        {game.venue}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Beverage Duty Icon - Left side */}
                    {(() => {
                      // Find user's attendance status for this game
                      const userStatus = Array.isArray(userAttendanceStatuses) ? 
                        userAttendanceStatuses.find((status: any) => status.gameId === game.id)?.status : null;
                      
                      // Show beverage icon if user has beverage duty
                      const hasBeverageDuty = game.homeBeverageDutyUserId === (user as any)?.id || game.awayBeverageDutyUserId === (user as any)?.id;
                      
                      return hasBeverageDuty ? (
                        <div className="flex items-center">
                          <img 
                            src={beverageJarUrl}
                            alt="Beverage Duty"
                            className="h-8 w-auto"
                            style={{ aspectRatio: '9/16' }}
                            data-testid={`icon-beverage-duty-${game.id}`}
                          />
                        </div>
                      ) : null;
                    })()}
                    {/* Claim Beverage Duty Button */}
                    {(() => {
                      // Find user's attendance status for this game
                      const userStatus = Array.isArray(userAttendanceStatuses) ? 
                        userAttendanceStatuses.find((status: any) => status.gameId === game.id)?.status : null;
                      
                      // Show claim button only if no one has claimed beverage duty AND user is not checked out
                      const noBeverageDutyClaimed = !(game.homeBeverageDutyUserId || game.awayBeverageDutyUserId);
                      const isCheckedOut = userStatus === 'checked_out';
                      
                      return noBeverageDutyClaimed && !isCheckedOut;
                    })() && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 bg-primary text-primary-foreground hover:bg-primary/90 border-primary"
                        onClick={() => {
                          const userTeam = game.homeTeam?.id === primaryTeam?.id ? game.homeTeam : game.awayTeam;
                          if (userTeam && primaryTeam) {
                            claimBeverageDutyMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                          }
                        }}
                        disabled={claimBeverageDutyMutation.isPending}
                        data-testid={`button-claim-beverage-duty-${game.id}`}
                      >
                        <img 
                          src={beverageJarUrl}
                          alt="Claim Beverage Duty"
                          className="h-4 w-auto"
                          style={{ aspectRatio: '9/16' }}
                        />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {(() => {
                      // Find user's attendance status for this game
                      const userStatus = Array.isArray(userAttendanceStatuses) ? 
                        userAttendanceStatuses.find((status: any) => status.gameId === game.id)?.status : null;
                      
                      if (userStatus === 'checked_in') {
                        return (
                          <div className="text-center">
                            <div className="bg-green-500/50 text-white w-8 h-8 rounded flex items-center justify-center" data-testid={`status-confirmed-${game.id}`}>
                              <Check className="w-4 h-4" />
                            </div>
                          </div>
                        );
                      } else if (userStatus === 'checked_out') {
                        return (
                          <div className="text-center">
                            <div className="bg-red-500/50 text-white w-8 h-8 rounded flex items-center justify-center" data-testid={`status-declined-${game.id}`}>
                              <X className="w-4 h-4" />
                            </div>
                          </div>
                        );
                      } else {
                        // No response yet, show buttons
                        return (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 bg-green-500/50 text-white hover:bg-green-600/50 border-green-500/50"
                              onClick={() => {
                                const userTeam = game.homeTeam?.id === primaryTeam?.id ? game.homeTeam : game.awayTeam;
                                if (userTeam && primaryTeam) {
                                  checkInMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                                }
                              }}
                              disabled={checkInMutation.isPending}
                              data-testid={`button-check-in-${game.id}`}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 bg-red-500/50 text-white hover:bg-red-600/50 border-red-500/50"
                              onClick={() => {
                                const userTeam = game.homeTeam?.id === primaryTeam?.id ? game.homeTeam : game.awayTeam;
                                if (userTeam && primaryTeam) {
                                  checkOutMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                                }
                              }}
                              disabled={checkOutMutation.isPending}
                              data-testid={`button-check-out-${game.id}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      }
                    })()
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-8 text-center" data-testid="empty-upcoming-games">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No upcoming games scheduled</p>
          </div>
        )}
      </div>
      {/* Find a League Section - Bottom */}
      <div className="px-6">
        <div className="bg-card rounded-lg border border-border px-2 py-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Looking for a League?</span>
          </div>
          <button
            onClick={() => navigate('/league-search')}
            className="bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:bg-primary/90 font-medium text-sm"
            data-testid="button-find-league"
          >
            Find a League
          </button>
        </div>
      </div>
      {/* Score Submission Modal */}
      <Dialog open={showScoreModal} onOpenChange={setShowScoreModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Game Score</DialogTitle>
          </DialogHeader>
          
          {selectedGameForScore && (
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                {selectedGameForScore.homeTeam?.name} vs {selectedGameForScore.awayTeam?.name}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="homeScore" className="text-sm font-medium">
                    {selectedGameForScore.homeTeam?.name || 'Home'} Score
                  </Label>
                  <Input
                    id="homeScore"
                    type="number"
                    min="0"
                    value={homeScore}
                    onChange={(e) => setHomeScore(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="awayScore" className="text-sm font-medium">
                    {selectedGameForScore.awayTeam?.name || 'Away'} Score
                  </Label>
                  <Input
                    id="awayScore"
                    type="number"
                    min="0"
                    value={awayScore}
                    onChange={(e) => setAwayScore(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowScoreModal(false)}
                  disabled={scoreSubmissionMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleScoreSubmit}
                  disabled={
                    scoreSubmissionMutation.isPending || 
                    !homeScore.trim() || 
                    !awayScore.trim() ||
                    isNaN(parseInt(homeScore)) ||
                    isNaN(parseInt(awayScore))
                  }
                >
                  {scoreSubmissionMutation.isPending ? "Submitting..." : "Submit Score"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
