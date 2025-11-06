import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Users, Star, Upload, Coffee, Target, Award, TrendingUp, Apple, Flag, Edit2, X } from 'lucide-react';
import { ObjectUploader } from '@/components/ObjectUploader';
import { LineManager } from '@/components/LineManager';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { UploadResult } from '@uppy/core';

export default function Teams() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { hasRole } = usePermissions();
  const { toast } = useToast();
  const { selectedTeamId, setTeamSelection } = useDashboardSelection();
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [editedTeamName, setEditedTeamName] = useState('');

  // Get user's teams
  const { data: userTeams = [] } = useQuery({
    queryKey: ['/api/user/teams'],
    enabled: !!isAuthenticated,
  });

  // Define current team early so it can be used in subsequent queries
  const primaryTeam = (userTeams as any[])[0];
  const currentTeam = selectedTeamId ? (userTeams as any[]).find((t: any) => t.id === selectedTeamId) : primaryTeam;

  // Get selected team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/teams', currentTeam?.id, 'members'],
    enabled: !!currentTeam?.id,
  }) as { data: any[] };

  // Get upcoming games for beverage duty
  const { data: upcomingGames = [] } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
    enabled: !!isAuthenticated,
  });

  // Get user's league memberships (for league data, captain status now via teams.captainId)
  const { data: userLeagueMemberships = [] } = useQuery({
    queryKey: ['/api/user/league-memberships'],
    enabled: !!isAuthenticated,
  });

  // Fetch attendance data for games where user is captain (for alerts)
  const { data: gameAttendanceCounts } = useQuery({
    queryKey: ['/api/games/attendance/captain-overview'],
    enabled: !!(user && (
      (userTeams as any[])?.some((team: any) => team.captainId === (user as any)?.id) ||
      hasRole('secondary_commissioner')
    )),
  });

  // Fetch user's attendance status for each upcoming game
  const { data: userAttendanceStatuses } = useQuery({
    queryKey: ['/api/user/attendance-statuses'],
    enabled: !!user,
  });

  // Team logo upload mutation
  const updateTeamLogoMutation = useMutation({
    mutationFn: async (data: { teamId: string; logoUrl: string }) => {
      return apiRequest('PATCH', `/api/teams/${data.teamId}/logo`, { logoUrl: data.logoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      toast({
        title: "Success",
        description: "Team logo updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update team logo. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Team name update mutation
  const updateTeamNameMutation = useMutation({
    mutationFn: async (data: { teamId: string; name: string }) => {
      return apiRequest('PATCH', `/api/teams/${data.teamId}`, { name: data.name });
    },
    onSuccess: () => {
      // Invalidate all queries that might display team names
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues'] }); // Invalidate all league queries (includes games)
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] }); // Invalidate team-specific queries
      setIsEditingTeamName(false);
      toast({
        title: "Success",
        description: "Team name updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update team name. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Beverage duty claim mutation
  const claimBeverageDutyMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/beverage-duty`, { teamId: data.teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({
        title: "Success",
        description: "You've claimed beverage duty for this game!",
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

  const handleGetTeamLogoUploadParameters = async () => {
    try {
      const response = await apiRequest('POST', '/api/team-logos/upload');
      const data = await response.json();
      return {
        method: 'PUT' as const,
        url: data.uploadURL,
        path: data.path, // Return path for later use
      };
    } catch (error) {
      console.error('Failed to get upload URL:', error);
      throw error;
    }
  };

  const createTeamLogoUploadComplete = (teamId: string) => (result: { successful?: Array<{ uploadURL: string; path?: string }>; failed?: Array<any> }) => {
    if (!result.successful || result.successful.length === 0) return;
    
    try {
      // Use path if available, otherwise fall back to uploadURL
      const logoUrl = result.successful[0].path || result.successful[0].uploadURL;
      
      // Update the team logo in the database
      updateTeamLogoMutation.mutate({ teamId, logoUrl });
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Error",
        description: "Failed to upload team logo. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Fetch team stats for leaders (must be BEFORE early returns)
  const { data: teamStats = [] } = useQuery({
    queryKey: ['/api/leagues', currentTeam?.leagueId, 'stats', 'team', currentTeam?.id, 'members', teamMembers?.length],
    queryFn: async () => {
      if (!currentTeam?.leagueId || !teamMembers || teamMembers.length === 0) return [];
      const response = await apiRequest('GET', `/api/leagues/${currentTeam.leagueId}/stats`);
      const allStats = await response.json();
      
      // Build a set of user IDs from team members
      const memberUserIds = new Set((teamMembers || []).map((member: any) => 
        String(member.userId ?? member.user?.id)
      ));
      
      // Filter stats for current team players using proper user ID matching
      const filteredStats = allStats.filter((stat: any) => {
        if (stat.type !== 'skater') return false; // Only skaters for these stats
        
        // Match user IDs properly
        const statUserId = String(stat.userId ?? stat.user?.id);
        return memberUserIds.has(statUserId);
      });
      
      return filteredStats;
    },
    enabled: !!currentTeam?.leagueId && !!teamMembers && teamMembers.length > 0,
  });

  // Fetch league standings
  const { data: leagueStandings = [] } = useQuery({
    queryKey: ['/api/leagues', currentTeam?.leagueId, 'standings'],
    enabled: !!currentTeam?.leagueId,
  }) as { data: any[] };

  // Calculate team leaders
  const getTeamLeaders = () => {
    if (!teamStats || teamStats.length === 0) {
      return null;
    }

    // Ensure we have at least one stat entry for reduce to work
    const stats = Array.isArray(teamStats) ? teamStats : [];
    if (stats.length === 0) return null;

    // Sort stats by each category to find actual leaders (not just first player with tied stats)
    const topGoalScorer = [...stats].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
    const topAssistProvider = [...stats].sort((a, b) => (b.assists || 0) - (a.assists || 0))[0];
    const topScorer = [...stats].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
    const mostPenaltyMinutes = [...stats].sort((a, b) => (b.penaltyMinutes || 0) - (a.penaltyMinutes || 0))[0];

    return { topGoalScorer, topAssistProvider, topScorer, mostPenaltyMinutes };
  };

  const teamLeaders = getTeamLeaders();

  // Get current team's standing
  const getCurrentTeamStanding = () => {
    if (!currentTeam || !Array.isArray(leagueStandings) || leagueStandings.length === 0) return null;
    
    const standingIndex = leagueStandings.findIndex((standing: any) => standing.teamId === currentTeam.id);
    if (standingIndex === -1) return null;
    
    const teamStanding = leagueStandings[standingIndex];
    const position = standingIndex + 1; // 1-based position
    const totalTeams = leagueStandings.length;
    const goalDifferential = teamStanding.goalsFor - teamStanding.goalsAgainst;
    
    return {
      ...teamStanding,
      position,
      totalTeams,
      goalDifferential
    };
  };

  const teamStanding = getCurrentTeamStanding();

  // Filter games for current team only
  const teamGames = (upcomingGames as any[]).filter((game: any) => 
    currentTeam && (game.homeTeamId === currentTeam.id || game.awayTeamId === currentTeam.id)
  );

  // Helper functions (after all hooks, before early returns)
  const handleClaimBeverageDuty = (gameId: string) => {
    if (currentTeam) {
      claimBeverageDutyMutation.mutate({ gameId, teamId: currentTeam.id });
    }
  };

  // Early returns (must come AFTER all hooks)
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 pb-20">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-6 pb-20">
        <div className="text-center">Please log in to view your teams.</div>
      </div>
    );
  }

  // Computed values (after early returns)
  const isTeamCaptain = currentTeam?.captainId === (user as any)?.id;
  const isCommissioner = hasRole('secondary_commissioner');
  const canUploadLogo = isTeamCaptain || isCommissioner;

  return (
    <div className="w-full px-4 py-6 pb-20">
      <div className="space-y-6">
        {(userTeams as any[]).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Teams Found</h3>
              <p className="text-muted-foreground mb-4">
                You're not currently a member of any teams. Join a league to get started!
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => navigate('/leagues')}
                  className="w-full"
                  data-testid="button-find-league"
                >
                  Find a League
                </Button>
                <Button
                  onClick={() => navigate('/')}
                  variant="outline"
                  className="w-full"
                  data-testid="button-back-home"
                >
                  Back to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Attendance Alerts for Captains */}
            {Array.isArray(gameAttendanceCounts) && gameAttendanceCounts.length > 0 && (
              <div className="space-y-3">
                {/* Remove duplicates by gameId and only show unique games */}
                {gameAttendanceCounts
                  .filter((game: any, index: number, self: any[]) => 
                    index === self.findIndex((g: any) => g.gameId === game.gameId)
                  )
                  .slice(0, 3)
                  .map((game: any) => {
                    const checkedInCount = game.checkedInCount || 0;
                    const checkedOutCount = game.checkedOutCount || 0;
                    const noResponseCount = Math.max(0, game.totalRoster - checkedInCount - checkedOutCount);
                    
                    return (
                      <div
                        key={`attendance-alert-${game.gameId}`}
                        className="bg-red-500/50 text-white rounded-lg p-3"
                        data-testid={`alert-attendance-${game.gameId}`}
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span className="font-medium">Attendance Alert!</span>
                        </div>
                        <p className="text-sm mt-1">
                          {game.teamName} vs {game.opponent}
                        </p>
                        <p className="text-xs mt-1">
                          ✅ {checkedInCount} Checked In • ❌ {checkedOutCount} Checked Out • ⏳ {noResponseCount} No Response
                        </p>
                        <p className="text-xs mt-1">
                          Game: {new Date(game.scheduledAt).toLocaleDateString()} at {new Date(game.scheduledAt).toLocaleTimeString()}
                        </p>
                      </div>
                    );
                  })}
              </div>
            )}
            
            <Tabs value={selectedTeamId || primaryTeam?.id || ''} onValueChange={setTeamSelection}>
            {(userTeams as any[]).map((team: any) => (
              <TabsContent key={team.id} value={team.id} className="space-y-6">
                {/* Team Header Card */}
                <Card>
                  <CardHeader className="flex flex-col space-y-1.5 p-6 bg-[#e2e2e2] dark:bg-[#212121] pl-[12px] pr-[12px] pt-[4px] pb-[4px]">
                    <div className="flex items-center gap-4">
                      <div className="relative group">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${team.logoUrl ? 'bg-transparent' : 'bg-primary'}`}>
                          {team.logoUrl ? (
                            <img 
                              src={team.logoUrl} 
                              alt={`${team.name} logo`}
                              className="w-full h-full rounded-lg object-contain"
                              data-testid={`img-team-logo-${team.id}`}
                            />
                          ) : (
                            <Trophy className="w-8 h-8 text-primary-foreground" />
                          )}
                        </div>
                        {((team.captainId === (user as any)?.id) || 
                          hasRole('secondary_commissioner')) && (
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={10485760}
                            onGetUploadParameters={handleGetTeamLogoUploadParameters}
                            onComplete={createTeamLogoUploadComplete(team.id)}
                            buttonClassName="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-lg opacity-0 hover:opacity-100 bg-black/50 flex items-center justify-center transition-opacity"
                          >
                            <Upload className="w-6 h-6 text-white" />
                          </ObjectUploader>
                        )}
                      </div>
                      <div className="flex-1">
                        {isEditingTeamName && selectedTeamId === team.id ? (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="text"
                              value={editedTeamName}
                              onChange={(e) => setEditedTeamName(e.target.value)}
                              className="w-full max-w-[50vw] px-3 py-1.5 bg-card border border-border rounded-lg text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="Team name"
                              autoFocus
                              data-testid={`input-team-name-${team.id}`}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (editedTeamName.trim()) {
                                    updateTeamNameMutation.mutate({ teamId: team.id, name: editedTeamName.trim() });
                                  }
                                }}
                                disabled={!editedTeamName.trim() || updateTeamNameMutation.isPending}
                                className="flex-1 sm:flex-none px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs whitespace-nowrap"
                                data-testid={`button-save-team-name-${team.id}`}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setIsEditingTeamName(false);
                                  setEditedTeamName('');
                                }}
                                className="p-1.5 text-muted-foreground hover:text-foreground"
                                data-testid={`button-cancel-team-name-${team.id}`}
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-2xl" data-testid={`text-team-name-${team.id}`}>
                              {team.name}
                            </CardTitle>
                            {((team.captainId === (user as any)?.id) || 
                              hasRole('secondary_commissioner')) && (
                              <button
                                onClick={() => {
                                  setIsEditingTeamName(true);
                                  setEditedTeamName(team.name);
                                  setTeamSelection(team.id);
                                }}
                                className="p-1 text-muted-foreground hover:text-foreground rounded"
                                data-testid={`button-edit-team-name-${team.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Team Standings */}
                <Card className="rounded-lg border text-card-foreground shadow-sm bg-[#e2e2e2] dark:bg-[#212121]">
                  <CardHeader className="flex flex-col space-y-1.5 p-6 pt-[5px] pb-[5px]">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-2xl font-semibold leading-none tracking-tight">League Standing</CardTitle>
                      {teamStanding && (
                        <span className="text-lg font-bold text-primary">
                          {teamStanding.position}
                          {teamStanding.position === 1 ? 'st' : 
                           teamStanding.position === 2 ? 'nd' : 
                           teamStanding.position === 3 ? 'rd' : 'th'}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 pt-[5px] pb-[5px] bg-[212121]">
                    {teamStanding ? (
                      <div className="flex justify-between items-center gap-2">
                        <div className="text-center flex-1">
                          <div className="text-2xl font-bold">
                            {teamStanding.wins}-{teamStanding.losses}-{teamStanding.ties}
                          </div>
                        </div>
                        <div className="text-center flex-1">
                          <div className="text-2xl font-bold text-blue-600">{teamStanding.points}</div>
                          <div className="text-sm text-muted-foreground">Points</div>
                        </div>
                        <div className="text-center flex-1">
                          <div className={`text-2xl font-bold ${teamStanding.goalDifferential >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {teamStanding.goalDifferential >= 0 ? '+' : ''}{teamStanding.goalDifferential}
                          </div>
                          <div className="text-sm text-muted-foreground">Goal Diff</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No standings available yet.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Team Leaders */}
                <div className="px-0 pl-[0px] pr-[0px] mt-[0px] mb-[0px]">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pl-[0px] pr-[0px] pt-[2px] pb-[2px]">
                    {teamLeaders ? (
                      <>
                        {/* Points Leader */}
                        <Card className="rounded-lg border text-card-foreground shadow-sm p-3 h-10 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-team-points-leader">
                          <div className="flex items-center gap-3">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold">{teamLeaders.topScorer?.points || 0}</span>
                            </div>
                          </div>
                          <span className="text-sm font-medium truncate" data-testid="text-points-leader-name">{teamLeaders.topScorer?.user?.lastName || 'N/A'}</span>
                        </Card>

                        {/* Goals Leader */}
                        <Card className="rounded-lg border text-card-foreground shadow-sm p-3 h-10 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-team-goals-leader">
                          <div className="flex items-center gap-3">
                            <Target className="w-5 h-5 text-success" />
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold">{teamLeaders.topGoalScorer?.goals || 0}</span>
                            </div>
                          </div>
                          <span className="text-sm font-medium truncate" data-testid="text-goals-leader-name">{teamLeaders.topGoalScorer?.user?.lastName || 'N/A'}</span>
                        </Card>

                        {/* Assists Leader */}
                        <Card className="rounded-lg border text-card-foreground shadow-sm p-3 h-10 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-team-assists-leader">
                          <div className="flex items-center gap-3">
                            <Apple className="w-5 h-5 text-info" />
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold">{teamLeaders.topAssistProvider?.assists || 0}</span>
                            </div>
                          </div>
                          <span className="text-sm font-medium truncate" data-testid="text-assists-leader-name">{teamLeaders.topAssistProvider?.user?.lastName || 'N/A'}</span>
                        </Card>

                        {/* Penalty Minutes Leader */}
                        <Card className="rounded-lg border text-card-foreground shadow-sm p-3 h-10 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-team-penalty-leader">
                          <div className="flex items-center gap-3">
                            <Flag className="w-5 h-5 text-red-500" />
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold">{teamLeaders.mostPenaltyMinutes?.penaltyMinutes || 0}</span>
                            </div>
                          </div>
                          <span className="text-sm font-medium truncate" data-testid="text-penalty-leader-name">{teamLeaders.mostPenaltyMinutes?.user?.lastName || 'N/A'}</span>
                        </Card>
                      </>
                    ) : (
                      <div className="col-span-full text-center text-muted-foreground py-8">
                        No stats available for this team yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* Line Combinations Manager */}
                <LineManager 
                  teamId={team.id}
                  isTeamCaptain={isTeamCaptain}
                  teamMembers={teamMembers}
                />
                
              </TabsContent>
            ))}
          </Tabs>
          </>
        )}
      </div>
    </div>
  );
}