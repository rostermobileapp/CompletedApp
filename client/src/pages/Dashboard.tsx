import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search, Coffee, Check, X, Beer, Megaphone, BarChart3, Award, ChevronDown, Target, AlertCircle, Settings, UserCheck } from 'lucide-react';
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

// Commissioner To-Do Modal Component
function CommissionerToDoModal({ isOpen, onClose, leagueId, onNavigate }: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId: string | null;
  onNavigate: (path: string) => void;
}) {
  // Fetch pending league member approvals
  const { data: pendingMembers = [], isLoading: pendingMembersLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'pending-members'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/pending-members`);
      return response.json();
    },
    enabled: !!leagueId && isOpen,
  });

  // Fetch games that need score verification
  const { data: gamesNeedingVerification = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification-modal'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      const gamesNeedingVerification = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const game of allGames) {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0);
        
        if (gameDate >= today) continue;
        
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          const submissions = await submissionsResponse.json();
          
          if (!Array.isArray(submissions)) continue;
          
          const submissionCount = submissions.length;
          let needsVerification = false;
          let reason = '';
          
          if (submissionCount === 0) {
            needsVerification = true;
            reason = 'No score submissions';
          } else if (submissionCount === 1) {
            needsVerification = true;
            reason = 'Missing one team submission';
          } else if (submissionCount === 2) {
            const [sub1, sub2] = submissions;
            if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
              needsVerification = true;
              reason = `Mismatched scores: ${sub1.homeScore}-${sub1.awayScore} vs ${sub2.homeScore}-${sub2.awayScore}`;
            }
          }
          
          if (needsVerification) {
            gamesNeedingVerification.push({ ...game, reason });
          }
        } catch (error) {
          continue;
        }
      }
      
      return gamesNeedingVerification;
    },
    enabled: !!leagueId && isOpen,
  });

  const totalTasks = (Array.isArray(pendingMembers) ? pendingMembers.length : 0) + 
                     (Array.isArray(gamesNeedingVerification) ? gamesNeedingVerification.length : 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-2xl font-semibold text-center">Commissioner To-Do List</h2>
          <p className="text-center text-muted-foreground mt-1">
            {totalTasks} task{totalTasks === 1 ? '' : 's'} requiring your attention
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {(pendingMembersLoading || gamesLoading) ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-muted-foreground">Loading tasks...</p>
              </div>
            </div>
          ) : totalTasks === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <p className="text-muted-foreground">No pending tasks at this time.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pending Member Approvals Section */}
              {Array.isArray(pendingMembers) && pendingMembers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-blue-600">
                      Pending Player Approvals ({pendingMembers.length})
                    </h3>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="space-y-3">
                      {pendingMembers.map((member: any) => (
                        <div 
                          key={member.id}
                          className="bg-white dark:bg-card border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-between"
                          data-testid={`pending-member-${member.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 text-sm font-medium">
                                {member.user?.firstName?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">
                                {member.user?.firstName || 'Unknown'} {member.user?.lastName || 'User'}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {member.user?.email}
                              </p>
                              {member.assignedTeam && (
                                <p className="text-sm text-blue-600">
                                  Assigned to: {member.assignedTeam.name}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => onNavigate(`/league-management?league=${leagueId}`)}
                            data-testid={`button-review-member-${member.id}`}
                          >
                            Review
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Games Needing Score Verification Section */}
              {Array.isArray(gamesNeedingVerification) && gamesNeedingVerification.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-orange-600" />
                    <h3 className="text-lg font-semibold text-orange-600">
                      Score Verifications ({gamesNeedingVerification.length})
                    </h3>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                    <div className="space-y-3">
                      {gamesNeedingVerification.map((game: any) => (
                        <div 
                          key={game.id}
                          className="bg-white dark:bg-card border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-center justify-between"
                          data-testid={`verification-game-${game.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-orange-500" />
                            <div>
                              <p className="font-medium">
                                {game.homeTeam?.name} vs {game.awayTeam?.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(game.scheduledAt), 'MMM d, yyyy • h:mm a')}
                              </p>
                              <p className="text-sm text-orange-600">
                                {game.reason}
                              </p>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={() => onNavigate(`/league-management?league=${leagueId}`)}
                            data-testid={`button-verify-game-${game.id}`}
                          >
                            Verify
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Close Button */}
        <div className="p-6 border-t border-border">
          <div className="flex justify-center">
            <Button 
              onClick={onClose}
              className="px-8 py-2"
              data-testid="button-close-commissioner-todo"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Standings Modal Component
function StandingsModal({ isOpen, onClose, leagueId }: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId: string | null; 
}) {
  const { data: standings = [], isLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'standings'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/standings`);
      return response.json();
    },
    enabled: !!leagueId && isOpen,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-2xl font-semibold text-center">League Standings</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-muted-foreground">Loading standings...</p>
              </div>
            </div>
          ) : standings.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No standings data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-semibold">Team Name</th>
                    <th className="text-center p-3 font-semibold">GP</th>
                    <th className="text-center p-3 font-semibold">W</th>
                    <th className="text-center p-3 font-semibold">L</th>
                    <th className="text-center p-3 font-semibold">T</th>
                    <th className="text-center p-3 font-semibold">SOL</th>
                    <th className="text-center p-3 font-semibold">PTS</th>
                    <th className="text-center p-3 font-semibold">GF</th>
                    <th className="text-center p-3 font-semibold">GA</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team: any, index: number) => (
                    <tr 
                      key={team.teamId} 
                      className={`border-b border-border/50 hover:bg-muted/30 ${index === 0 ? 'bg-primary/5' : ''}`}
                      data-testid={`standings-row-${team.teamId}`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{team.teamName}</span>
                        </div>
                      </td>
                      <td className="text-center p-3" data-testid={`games-played-${team.teamId}`}>
                        {team.gamesPlayed}
                      </td>
                      <td className="text-center p-3 text-green-600 font-medium" data-testid={`wins-${team.teamId}`}>
                        {team.wins}
                      </td>
                      <td className="text-center p-3 text-red-600 font-medium" data-testid={`losses-${team.teamId}`}>
                        {team.losses}
                      </td>
                      <td className="text-center p-3 text-yellow-600 font-medium" data-testid={`ties-${team.teamId}`}>
                        {team.ties}
                      </td>
                      <td className="text-center p-3 text-orange-600 font-medium" data-testid={`shootout-losses-${team.teamId}`}>
                        {team.shootoutLosses}
                      </td>
                      <td className="text-center p-3 font-bold text-primary" data-testid={`points-${team.teamId}`}>
                        {team.points}
                      </td>
                      <td className="text-center p-3" data-testid={`goals-for-${team.teamId}`}>
                        {team.goalsFor}
                      </td>
                      <td className="text-center p-3" data-testid={`goals-against-${team.teamId}`}>
                        {team.goalsAgainst}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer with Close Button */}
        <div className="p-6 border-t border-border">
          <div className="flex justify-center">
            <Button 
              onClick={onClose}
              className="px-8 py-2"
              data-testid="button-close-standings"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      
      // Find games that need commissioner verification based on the correct business logic:
      // 1. Today's date is AFTER the game's date (past games)
      // 2. Game has problematic score submissions (0, 1, or 2 mismatched)
      const gamesNeedingVerification: any[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      const debugInfo = { 
        totalGames: allGames.length, 
        pastGames: 0, 
        gamesNeedingVerification: 0,
        problemGames: [] as any[]
      };
      
      for (const game of allGames) {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0); // Start of game date
        
        // Only check games from past dates
        if (gameDate >= today) {
          continue; // Skip future games
        }
        
        debugInfo.pastGames++;
        
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          const submissions = await submissionsResponse.json();
          
          if (!Array.isArray(submissions)) continue;
          
          const submissionCount = submissions.length;
          let needsVerification = false;
          let reason = '';
          
          if (submissionCount === 0) {
            // No score submissions - needs verification
            needsVerification = true;
            reason = 'No score submissions';
          } else if (submissionCount === 1) {
            // Only one team submitted - needs verification
            needsVerification = true;
            reason = 'Missing one team submission';
          } else if (submissionCount === 2) {
            // Two submissions - check if they match
            const [sub1, sub2] = submissions;
            if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
              needsVerification = true;
              reason = `Mismatched scores: ${sub1.homeScore}-${sub1.awayScore} vs ${sub2.homeScore}-${sub2.awayScore}`;
            }
          }
          
          if (needsVerification) {
            debugInfo.gamesNeedingVerification++;
            debugInfo.problemGames.push({
              homeTeam: game.homeTeam?.name || 'Unknown',
              awayTeam: game.awayTeam?.name || 'Unknown', 
              date: game.scheduledAt || new Date().toISOString(),
              reason: reason
            });
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
    return null;
  }

  return (
    <div className="px-6 mb-4">
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <button
          onClick={() => onNavigate(`/league-management?league=${leagueId}`)}
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

  // Standings modal state
  const [showStandingsModal, setShowStandingsModal] = useState(false);
  
  // Commissioner To-Do modal state
  const [showCommissionerToDoModal, setShowCommissionerToDoModal] = useState(false);
  
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

  // Fetch commissioner to-do data for the permanent bar
  const { data: commissionerTodoData } = useQuery({
    queryKey: ['/api/commissioner/todo-summary', selectedLeagueId],
    queryFn: async () => {
      if (!selectedLeagueId || tier !== 'commissioner') return { pendingMembers: 0, gamesNeedingVerification: 0, total: 0 };
      
      try {
        // Fetch pending members
        const pendingMembersResponse = await apiRequest('GET', `/api/leagues/${selectedLeagueId}/pending-members`);
        const pendingMembers = await pendingMembersResponse.json();
        
        // Fetch games needing verification
        const gamesResponse = await apiRequest('GET', `/api/leagues/${selectedLeagueId}/games`);
        const allGames = await gamesResponse.json();
        
        let gamesNeedingVerification = 0;
        if (Array.isArray(allGames)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          for (const game of allGames) {
            const gameDate = new Date(game.scheduledAt);
            gameDate.setHours(0, 0, 0, 0);
            
            if (gameDate >= today) continue;
            
            try {
              const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
              const submissions = await submissionsResponse.json();
              
              if (!Array.isArray(submissions)) continue;
              
              const submissionCount = submissions.length;
              let needsVerification = false;
              
              if (submissionCount === 0 || submissionCount === 1) {
                needsVerification = true;
              } else if (submissionCount === 2) {
                const [sub1, sub2] = submissions;
                if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
                  needsVerification = true;
                }
              }
              
              if (needsVerification) {
                gamesNeedingVerification++;
              }
            } catch (error) {
              continue;
            }
          }
        }
        
        const pendingMembersCount = Array.isArray(pendingMembers) ? pendingMembers.length : 0;
        const total = pendingMembersCount + gamesNeedingVerification;
        
        console.log('Commissioner TODO Debug:', {
          tier,
          selectedLeagueId,
          pendingMembersCount,
          gamesNeedingVerification,
          total
        });
        
        return {
          pendingMembers: pendingMembersCount,
          gamesNeedingVerification,
          total
        };
      } catch (error) {
        return { pendingMembers: 0, gamesNeedingVerification: 0, total: 0 };
      }
    },
    enabled: !!selectedLeagueId && tier === 'commissioner',
    refetchInterval: 30000, // Refresh every 30 seconds
  });

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
              {(user as any)?.profileImageUrl ? (
                <img 
                  src={(user as any).profileImageUrl} 
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary-foreground text-sm font-semibold">
                  {(user as any)?.firstName?.[0] || 'U'}
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
          <div 
            className="bg-card rounded-xl border border-border p-5 min-h-[72px] cursor-pointer hover:bg-muted/50 transition-colors" 
            data-testid="card-standings"
            onClick={() => selectedLeagueId && setShowStandingsModal(true)}
          >
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
                    {(teamRecord as any)?.gamesRemaining ?? 0}
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
                    {teamRecord ? `${(teamRecord as any).wins}-${(teamRecord as any).losses}-${(teamRecord as any).ties}` : '0-0-0'}
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
          userTeams={userTeams as any[]} 
          onNavigate={navigate}
          onOpenScoreModal={(game) => {
            setSelectedGameForScore(game);
            setShowScoreModal(true);
          }}
        />
      )}
      {/* Permanent Commissioner To-Do Bar */}
      {(() => {
        console.log('Commissioner To-Do Bar Debug:', {
          tier,
          isCommissioner: tier === 'commissioner',
          selectedLeagueId,
          commissionerTodoData,
          shouldShow: tier === 'commissioner' && selectedLeagueId && commissionerTodoData
        });
        return null;
      })()}
      {tier === 'commissioner' && selectedLeagueId && commissionerTodoData && (
        <div className="px-6 mb-4">
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 shadow-sm">
            <button
              onClick={() => setShowCommissionerToDoModal(true)}
              className="w-full flex items-center justify-between hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors rounded-lg p-2"
              data-testid="button-commissioner-todo-permanent"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-yellow-700 dark:text-yellow-300">To-Do List</h3>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    {commissionerTodoData.total === 0 ? (
                      ''
                    ) : (
                      <>
                        {commissionerTodoData.pendingMembers > 0 && `${commissionerTodoData.pendingMembers} pending approval${commissionerTodoData.pendingMembers === 1 ? '' : 's'}`}
                        {commissionerTodoData.pendingMembers > 0 && commissionerTodoData.gamesNeedingVerification > 0 && ' • '}
                        {commissionerTodoData.gamesNeedingVerification > 0 && `${commissionerTodoData.gamesNeedingVerification} score verification${commissionerTodoData.gamesNeedingVerification === 1 ? '' : 's'}`}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{commissionerTodoData.total}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-yellow-600" />
              </div>
            </button>
          </div>
        </div>
      )}
      {/* Commissioner To-Do Section */}
      {tier === 'commissioner' && selectedLeagueId && (
        <CommissionerToDo 
          leagueId={selectedLeagueId} 
          onNavigate={navigate}
        />
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
            {(upcomingGames as any[])
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
                      // Show claim button only if no one has claimed beverage duty
                      const noBeverageDutyClaimed = !(game.homeBeverageDutyUserId || game.awayBeverageDutyUserId);
                      
                      return noBeverageDutyClaimed;
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
      {/* Standings Modal */}
      <StandingsModal
        isOpen={showStandingsModal}
        onClose={() => setShowStandingsModal(false)}
        leagueId={selectedLeagueId}
      />
      {/* Commissioner To-Do Modal */}
      <CommissionerToDoModal 
        isOpen={showCommissionerToDoModal}
        onClose={() => setShowCommissionerToDoModal(false)}
        leagueId={selectedLeagueId}
        onNavigate={navigate}
      />
    </div>
  );
}
