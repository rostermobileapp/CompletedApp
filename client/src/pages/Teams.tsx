import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Users, Star, Upload, Coffee } from 'lucide-react';
import { ObjectUploader } from '@/components/ObjectUploader';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { UploadResult } from '@uppy/core';

export default function Teams() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  // Get user's teams
  const { data: userTeams = [] } = useQuery({
    queryKey: ['/api/user/teams'],
    enabled: !!isAuthenticated,
  });

  // Get selected team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/teams', selectedTeam, 'members'],
    enabled: !!selectedTeam,
  });

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
      (user as any)?.subscriptionTier === 'commissioner'
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
      console.log('Upload URL response:', data);
      return {
        method: 'PUT' as const,
        url: data.uploadURL,
      };
    } catch (error) {
      console.error('Failed to get upload URL:', error);
      throw error;
    }
  };

  const createTeamLogoUploadComplete = (teamId: string) => (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    console.log('Upload complete result:', result);
    if (result.successful && result.successful[0]) {
      const uploadURL = result.successful[0].uploadURL as string;
      console.log('Updating team logo with URL:', uploadURL);
      updateTeamLogoMutation.mutate({ teamId, logoUrl: uploadURL });
    } else {
      console.error('Upload failed or no successful uploads:', result);
      toast({
        title: "Error",
        description: "Failed to upload team logo. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleClaimBeverageDuty = (gameId: string) => {
    if (currentTeam) {
      claimBeverageDutyMutation.mutate({ gameId, teamId: currentTeam.id });
    }
  };

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

  const primaryTeam = (userTeams as any[])[0];
  const currentTeam = selectedTeam ? (userTeams as any[]).find((t: any) => t.id === selectedTeam) : primaryTeam;
  const isTeamCaptain = currentTeam?.captainId === (user as any)?.id;
  const isCommissioner = (user as any)?.subscriptionTier === 'commissioner';
  const canUploadLogo = isTeamCaptain || isCommissioner;

  // Filter games for current team only
  const teamGames = (upcomingGames as any[]).filter((game: any) => 
    currentTeam && (game.homeTeamId === currentTeam.id || game.awayTeamId === currentTeam.id)
  );

  return (
    <div className="container mx-auto px-4 py-6 pb-20">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold" data-testid="page-title">Teams</h1>
          <Users className="w-8 h-8 text-primary" />
        </div>

        {(userTeams as any[]).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Teams Found</h3>
              <p className="text-muted-foreground mb-4">
                You're not currently a member of any teams. Join a league to get started!
              </p>
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
            
            <Tabs value={selectedTeam || primaryTeam?.id || ''} onValueChange={setSelectedTeam}>
              {/* Team Selection */}
            {(userTeams as any[]).length > 1 && (
              <TabsList className="grid w-full grid-cols-2 mb-6">
                {(userTeams as any[]).slice(0, 2).map((team: any) => (
                  <TabsTrigger key={team.id} value={team.id} data-testid={`tab-team-${team.id}`}>
                    {team.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}

            {(userTeams as any[]).map((team: any) => (
              <TabsContent key={team.id} value={team.id} className="space-y-6">
                {/* Team Header Card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
                        {team.logoUrl ? (
                          <img 
                            src={team.logoUrl} 
                            alt={`${team.name} logo`}
                            className="w-full h-full rounded-lg object-cover"
                            data-testid={`img-team-logo-${team.id}`}
                          />
                        ) : (
                          <Trophy className="w-8 h-8 text-primary-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-2xl" data-testid={`text-team-name-${team.id}`}>
                          {team.name}
                        </CardTitle>
                        <p className="text-muted-foreground">
                          {team.wins}-{team.losses}-{team.ties} Record
                        </p>
                      </div>
                      {((team.captainId === (user as any)?.id) || 
                        (user as any)?.subscriptionTier === 'commissioner') && (
                        <ObjectUploader
                          maxNumberOfFiles={1}
                          maxFileSize={10485760}
                          onGetUploadParameters={handleGetTeamLogoUploadParameters}
                          onComplete={createTeamLogoUploadComplete(team.id)}
                          buttonClassName="h-9"
                        >
                          <div className="flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            <span>Upload Logo</span>
                          </div>
                        </ObjectUploader>
                      )}
                    </div>
                  </CardHeader>
                </Card>

                {/* Team Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Stats</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600/50">{team.wins}</div>
                        <div className="text-sm text-muted-foreground">Wins</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600/50">{team.losses}</div>
                        <div className="text-sm text-muted-foreground">Losses</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600/50">{team.ties}</div>
                        <div className="text-sm text-muted-foreground">Ties</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">
                          {team.wins + team.losses + team.ties > 0 
                            ? ((team.wins + team.ties * 0.5) / (team.wins + team.losses + team.ties) * 100).toFixed(1)
                            : '0.0'
                          }%
                        </div>
                        <div className="text-sm text-muted-foreground">Win Rate</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Teammates */}
                <Card>
                  <CardHeader>
                    <CardTitle>Teammates</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(teamMembers as any[]).map((member: any) => (
                        <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <Avatar>
                            <AvatarImage src={member.profileImageUrl || undefined} />
                            <AvatarFallback>
                              {member.firstName?.[0]}{member.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="font-medium">
                              {member.firstName} {member.lastName}
                              {member.id === team.captainId && (
                                <Badge variant="secondary" className="ml-2">
                                  <span className="w-3 h-3 mr-1 text-xs font-bold">C</span>
                                  Captain
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {member.city && `${member.city} • `}
                              {member.age && `Age ${member.age}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Upcoming Games & Beverage Duty */}
                {teamGames.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Upcoming Games & Beverage Duty</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {teamGames.map((game: any) => {
                          const gameDate = new Date(game.scheduledAt);
                          const homeTeam = game.homeTeam;
                          const awayTeam = game.awayTeam;
                          const isHomeGame = game.homeTeamId === team.id;
                          const beverageDutyClaimed = isHomeGame 
                            ? !!game.homeBeverageDutyUserId 
                            : !!game.awayBeverageDutyUserId;
                          const userClaimedDuty = isHomeGame 
                            ? game.homeBeverageDutyUserId === (user as any)?.id
                            : game.awayBeverageDutyUserId === (user as any)?.id;

                          return (
                            <div key={game.id} className="p-4 border rounded-lg">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="text-sm">
                                    <div className="font-medium">
                                      {homeTeam?.name} vs {awayTeam?.name}
                                    </div>
                                    <div className="text-muted-foreground">
                                      {gameDate.toLocaleDateString()} at {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    {game.venue && (
                                      <div className="text-muted-foreground text-xs">
                                        📍 {game.venue}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <Badge variant={isHomeGame ? "default" : "secondary"}>
                                  {isHomeGame ? "Home" : "Away"}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-between">
                                <div className="text-sm">
                                  <Coffee className="w-4 h-4 inline mr-1" />
                                  Beverage Duty
                                </div>
                                {beverageDutyClaimed ? (
                                  <div className="text-right">
                                    <Badge variant={userClaimedDuty ? "default" : "secondary"}>
                                      {userClaimedDuty ? "You claimed it!" : "Claimed"}
                                    </Badge>
                                  </div>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    onClick={() => handleClaimBeverageDuty(game.id)}
                                    disabled={claimBeverageDutyMutation.isPending}
                                    data-testid={`button-claim-duty-${game.id}`}
                                  >
                                    <Coffee className="w-4 h-4 mr-1" />
                                    Claim Duty
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            ))}
          </Tabs>
          </>
        )}
      </div>
    </div>
  );
}