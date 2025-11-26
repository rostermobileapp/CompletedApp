import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Users, TrendingUp, Target, Apple, Flag, Upload, Edit2, X, ArrowLeft } from 'lucide-react';
import { ObjectUploader } from '@/components/ObjectUploader';
import { LineManager } from '@/components/LineManager';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, getImageUrl } from '@/lib/queryClient';

export default function TournamentTeams() {
  const [, params] = useRoute('/tournament-teams/:tournamentId');
  const tournamentId = params?.tournamentId;
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { hasRole } = usePermissions();
  const { toast } = useToast();
  const { selectedTeamId, selectedTournamentId, setTournamentSelection } = useDashboardSelection();
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [editedTeamName, setEditedTeamName] = useState('');
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  // Fetch tournament data with authenticated request
  const { data: tournament } = useQuery({
    queryKey: ['/api/tournaments', tournamentId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/tournaments/${tournamentId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!tournamentId && !!isAuthenticated,
  });

  // Fetch tournament teams with authenticated request
  const { data: tournamentTeams = [], isLoading: teamsLoading } = useQuery<any[]>({
    queryKey: ['/api/tournaments', tournamentId, 'teams'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/teams`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!tournamentId && !!isAuthenticated,
  });

  // Fetch user's tournament participation (may be null for commissioners)
  const { data: userParticipation, isError: participationError } = useQuery({
    queryKey: ['/api/tournaments', tournamentId, 'my-participation'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/my-participation`);
        if (!response.ok) return null;
        return response.json();
      } catch {
        return null;
      }
    },
    enabled: !!tournamentId && !!isAuthenticated,
  });

  // Check if user is commissioner (for team resolution logic)
  const isCommissionerCheck = !!(
    (tournament as any)?.createdBy === (user as any)?.id || 
    hasRole('secondary_commissioner')
  );

  // Determine which team to display based on user role
  useEffect(() => {
    if (tournamentTeams.length > 0) {
      let resolvedTeamId: string | null = null;
      
      // First priority: user's participation team (if they are a participant)
      if (userParticipation?.tournamentTeamId) {
        const participantTeam = tournamentTeams.find((t: any) => t.id === userParticipation.tournamentTeamId);
        if (participantTeam) {
          resolvedTeamId = participantTeam.id;
        }
      }
      
      // For commissioners ONLY: try dashboard selection or default to first team
      if (!resolvedTeamId && isCommissionerCheck) {
        // Try the selected team from dashboard (if it's in this tournament)
        if (selectedTeamId) {
          const selectedTeam = tournamentTeams.find((t: any) => t.id === selectedTeamId || t.teamId === selectedTeamId);
          if (selectedTeam) {
            resolvedTeamId = selectedTeam.id;
          }
        }
        
        // Default to first team for commissioners
        if (!resolvedTeamId) {
          resolvedTeamId = tournamentTeams[0]?.id;
        }
      }
      
      if (resolvedTeamId) {
        setCurrentTeamId(resolvedTeamId);
      }
    }
  }, [tournamentTeams, userParticipation, selectedTeamId, isCommissionerCheck]);
  
  // Keep tournament selection in dashboard - this ensures navigation stays in tournament context
  useEffect(() => {
    if (tournamentId && selectedTournamentId !== tournamentId) {
      setTournamentSelection(tournamentId);
    }
  }, [tournamentId, selectedTournamentId, setTournamentSelection]);

  // Find the current team
  const currentTeam = tournamentTeams.find((team: any) => team.id === currentTeamId);

  // Fetch team members for current team
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/tournaments', tournamentId, 'teams', currentTeamId, 'members'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/teams/${currentTeamId}/members`);
      return response.json();
    },
    enabled: !!tournamentId && !!currentTeamId,
  }) as { data: any[] };

  // Fetch tournament standings
  const { data: tournamentStandings = [] } = useQuery<any[]>({
    queryKey: ['/api/tournaments', tournamentId, 'standings'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/standings`);
      return response.json();
    },
    enabled: !!tournamentId,
  });

  // Fetch tournament team stats
  const { data: teamStats = [] } = useQuery({
    queryKey: ['/api/tournaments', tournamentId, 'teams', currentTeamId, 'stats'],
    queryFn: async () => {
      if (!currentTeamId) return [];
      const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/stats`);
      const allStats = await response.json();
      // Filter stats for current team
      return allStats.filter((stat: any) => stat.teamId === currentTeamId);
    },
    enabled: !!tournamentId && !!currentTeamId,
  });

  // Team name update mutation
  const updateTeamNameMutation = useMutation({
    mutationFn: async (data: { teamId: string; name: string }) => {
      return apiRequest('PATCH', `/api/tournament-teams/${data.teamId}`, { teamName: data.name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'teams'] });
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

  // Team logo upload mutation
  const updateTeamLogoMutation = useMutation({
    mutationFn: async (data: { teamId: string; logoUrl: string }) => {
      return apiRequest('PATCH', `/api/tournament-teams/${data.teamId}`, { logoUrl: data.logoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'teams'] });
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

  const handleGetTeamLogoUploadParameters = async () => {
    try {
      const response = await apiRequest('POST', '/api/team-logos/upload');
      const data = await response.json();
      return {
        method: 'PUT' as const,
        url: data.uploadURL,
        path: data.path,
      };
    } catch (error) {
      console.error('Failed to get upload URL:', error);
      throw error;
    }
  };

  const createTeamLogoUploadComplete = (teamId: string) => (result: { successful?: Array<{ uploadURL: string; path?: string }>; failed?: Array<any> }) => {
    if (!result.successful || result.successful.length === 0) return;
    
    try {
      const logoUrl = result.successful[0].path || result.successful[0].uploadURL;
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

  // Calculate team leaders
  const getTeamLeaders = () => {
    if (!teamStats || teamStats.length === 0) {
      return null;
    }

    const stats = Array.isArray(teamStats) ? teamStats : [];
    if (stats.length === 0) return null;

    const topGoalScorer = [...stats].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
    const topAssistProvider = [...stats].sort((a, b) => (b.assists || 0) - (a.assists || 0))[0];
    const topScorer = [...stats].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
    const mostPenaltyMinutes = [...stats].sort((a, b) => (b.penaltyMinutes || 0) - (a.penaltyMinutes || 0))[0];

    return { topGoalScorer, topAssistProvider, topScorer, mostPenaltyMinutes };
  };

  const teamLeaders = getTeamLeaders();

  // Get current team's standing
  const getCurrentTeamStanding = () => {
    if (!currentTeam || !Array.isArray(tournamentStandings) || tournamentStandings.length === 0) return null;
    
    const standingIndex = tournamentStandings.findIndex((standing: any) => standing.teamId === currentTeam.id);
    if (standingIndex === -1) return null;
    
    const teamStanding = tournamentStandings[standingIndex];
    const position = standingIndex + 1;
    const totalTeams = tournamentStandings.length;
    const goalDifferential = (teamStanding.goalsFor || 0) - (teamStanding.goalsAgainst || 0);
    const points = (teamStanding.wins || 0) * 2 + (teamStanding.ties || 0);
    
    return {
      ...teamStanding,
      position,
      totalTeams,
      goalDifferential,
      points
    };
  };

  const teamStanding = getCurrentTeamStanding();

  // Check if user is commissioner - via tournament creator or secondary commissioner role
  const isCommissioner = !!(
    (tournament as any)?.createdBy === (user as any)?.id || 
    hasRole('secondary_commissioner')
  );
  
  // Check if user is team captain - via linked team captain, or via participation with captain role
  const isTeamCaptain = !!(
    currentTeam?.captainId === (user as any)?.id || 
    (userParticipation?.tournamentTeamId === currentTeamId && userParticipation?.role === 'captain')
  );

  // Check if user can manage this team (is captain or commissioner)
  const canManageTeam = () => {
    if (!user || !tournament) return false;
    return isCommissioner || isTeamCaptain;
  };

  const canUploadLogo = isTeamCaptain || isCommissioner;

  // Handle team selection change
  const handleTeamChange = (teamId: string) => {
    setCurrentTeamId(teamId);
  };

  // Loading state - for auth
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 pb-20">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-6 pb-20">
        <div className="text-center">Please log in to view your team.</div>
      </div>
    );
  }
  
  // Loading teams
  if (teamsLoading) {
    return (
      <div className="w-full px-4 py-6 pb-20">
        <div className="space-y-6">
          <Card className="animate-pulse">
            <CardHeader className="bg-[#e2e2e2] dark:bg-[#212121]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-muted rounded-lg" />
                <div className="h-8 w-48 bg-muted rounded" />
              </div>
            </CardHeader>
          </Card>
          <Card className="animate-pulse bg-[#e2e2e2] dark:bg-[#212121]">
            <CardHeader>
              <div className="h-6 w-40 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="flex justify-between gap-4">
                <div className="h-12 w-20 bg-muted rounded" />
                <div className="h-12 w-20 bg-muted rounded" />
                <div className="h-12 w-20 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // No teams in tournament
  if (tournamentTeams.length === 0) {
    return (
      <div className="w-full px-4 py-6 pb-20">
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/tournaments/${tournamentId}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Tournament
          </Button>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Teams Found</h3>
            <p className="text-muted-foreground mb-4">
              This tournament doesn't have any teams yet.
            </p>
            <Button
              onClick={() => navigate(`/tournaments/${tournamentId}`)}
              className="w-full"
              data-testid="button-view-tournament"
            >
              View Tournament
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User is not on any team in this tournament (and not a commissioner)
  if (!userParticipation?.tournamentTeamId && !isCommissionerCheck) {
    return (
      <div className="w-full px-4 py-6 pb-20">
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/tournaments/${tournamentId}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Tournament
          </Button>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Not on a Team</h3>
            <p className="text-muted-foreground mb-4">
              You are not currently assigned to a team in this tournament.
            </p>
            <Button
              onClick={() => navigate(`/tournaments/${tournamentId}`)}
              className="w-full"
              data-testid="button-view-tournament"
            >
              View Tournament
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 pb-20">
      <div className="space-y-6">
        
        {/* Show loading state while team is being resolved */}
        {!currentTeam && tournamentTeams.length > 0 && (
          <Card className="animate-pulse">
            <CardContent className="p-6 text-center text-muted-foreground">
              Loading team...
            </CardContent>
          </Card>
        )}

        {currentTeam && (
          <div className="space-y-6">
            {/* Team Header Card */}
            <Card>
              <CardHeader className="flex flex-col space-y-1.5 p-6 bg-[#e2e2e2] dark:bg-[#212121] pl-[12px] pr-[12px] pt-[4px] pb-[4px]">
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${currentTeam.logoUrl ? 'bg-transparent' : 'bg-primary'}`}>
                      {currentTeam.logoUrl ? (
                        <img 
                          src={getImageUrl(currentTeam.logoUrl) || ''} 
                          alt={`${currentTeam.teamName} logo`}
                          className="w-full h-full rounded-lg object-contain"
                          data-testid={`img-team-logo-${currentTeam.id}`}
                        />
                      ) : (
                        <Trophy className="w-8 h-8 text-primary-foreground" />
                      )}
                    </div>
                    {canUploadLogo && (
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={10485760}
                        onGetUploadParameters={handleGetTeamLogoUploadParameters}
                        onComplete={createTeamLogoUploadComplete(currentTeam.id)}
                        buttonClassName="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-lg opacity-0 hover:opacity-100 bg-black/50 flex items-center justify-center transition-opacity"
                      >
                        <Upload className="w-6 h-6 text-white" />
                      </ObjectUploader>
                    )}
                  </div>
                  <div className="flex-1">
                    {isEditingTeamName ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          value={editedTeamName}
                          onChange={(e) => setEditedTeamName(e.target.value)}
                          className="w-full max-w-[50vw] px-3 py-1.5 bg-card border border-border rounded-lg text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Team name"
                          autoFocus
                          data-testid={`input-team-name-${currentTeam.id}`}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (editedTeamName.trim()) {
                                updateTeamNameMutation.mutate({ teamId: currentTeam.id, name: editedTeamName.trim() });
                              }
                            }}
                            disabled={!editedTeamName.trim() || updateTeamNameMutation.isPending}
                            className="flex-1 sm:flex-none px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs whitespace-nowrap"
                            data-testid={`button-save-team-name-${currentTeam.id}`}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingTeamName(false);
                              setEditedTeamName('');
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground"
                            data-testid={`button-cancel-team-name-${currentTeam.id}`}
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-2xl" data-testid={`text-team-name-${currentTeam.id}`}>
                          {currentTeam.teamName}
                        </CardTitle>
                        {canManageTeam() && (
                          <button
                            onClick={() => {
                              setIsEditingTeamName(true);
                              setEditedTeamName(currentTeam.teamName);
                            }}
                            className="p-1 text-muted-foreground hover:text-foreground rounded"
                            data-testid={`button-edit-team-name-${currentTeam.id}`}
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

            {/* Tournament Standings */}
            <Card className="rounded-lg border text-card-foreground shadow-sm bg-[#e2e2e2] dark:bg-[#212121]">
              <CardHeader className="flex flex-col space-y-1.5 p-6 pt-[5px] pb-[5px]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl font-semibold leading-none tracking-tight">Tournament Standing</CardTitle>
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
                        {teamStanding.wins || 0}-{teamStanding.losses || 0}-{teamStanding.ties || 0}
                      </div>
                    </div>
                    <div className="text-center flex-1">
                      <div className="text-2xl font-bold text-blue-600">{teamStanding.points || 0}</div>
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
              teamId={currentTeam.teamId || currentTeam.id}
              isTeamCaptain={isTeamCaptain || isCommissioner}
              teamMembers={teamMembers}
            />
          </div>
        )}
      </div>
    </div>
  );
}
