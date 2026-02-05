import { useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Users, Target, TrendingUp, Apple, Flag, ArrowLeft, Lock } from 'lucide-react';
import { ClickableAvatar } from '@/components/ClickableAvatar';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { usePermissions } from '@/context/SubscriptionContext';
import { useAuth } from '@/hooks/useAuth';

export default function TeamView() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/team/:id");
  const teamId = params?.id;
  const { canAccessPremiumFeatures } = usePermissions();
  const { user } = useAuth();
  
  // Check if user is on free tier
  const isFreeTier = !canAccessPremiumFeatures();

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ['/api/teams', teamId],
    enabled: !!teamId,
  });
  
  // Fetch user's teams to check if this is their own team
  const { data: userTeams = [], isLoading: userTeamsLoading } = useQuery<any[]>({
    queryKey: ['/api/user/teams'],
    enabled: !!user,
  });
  
  // Check if this is the user's own team (only after teams have loaded)
  const isOwnTeam = userTeams.some((t: any) => t.id === teamId);
  
  // Determine if we're still loading ownership data for free tier check
  const isLoadingOwnership = isFreeTier && userTeamsLoading;

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/teams', teamId, 'members'],
    enabled: !!teamId,
  }) as { data: any[] };

  const { data: teamStats = [] } = useQuery({
    queryKey: ['/api/leagues', (team as any)?.leagueId, 'stats', 'team', teamId, 'members', teamMembers?.length],
    queryFn: async () => {
      if (!(team as any)?.leagueId || !teamMembers || teamMembers.length === 0) return [];
      const response = await apiRequest('GET', `/api/leagues/${(team as any).leagueId}/stats`);
      const allStats = await response.json();
      
      const memberUserIds = new Set((teamMembers || []).map((member: any) => 
        String(member.userId ?? member.user?.id)
      ));
      
      const filteredStats = allStats.filter((stat: any) => {
        if (stat.type !== 'skater') return false;
        const statUserId = String(stat.userId ?? stat.user?.id);
        return memberUserIds.has(statUserId);
      });
      
      return filteredStats;
    },
    enabled: !!(team as any)?.leagueId && !!teamMembers && teamMembers.length > 0,
  });

  const { data: leagueStandings = [] } = useQuery({
    queryKey: ['/api/leagues', (team as any)?.leagueId, 'standings'],
    enabled: !!(team as any)?.leagueId,
  }) as { data: any[] };

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

  const getTeamStanding = () => {
    if (!team || !Array.isArray(leagueStandings) || leagueStandings.length === 0) return null;
    
    const standingIndex = leagueStandings.findIndex((standing: any) => standing.teamId === teamId);
    if (standingIndex === -1) return null;
    
    const teamStanding = leagueStandings[standingIndex];
    const position = standingIndex + 1;
    const totalTeams = leagueStandings.length;
    const goalDifferential = teamStanding.goalsFor - teamStanding.goalsAgainst;
    
    return {
      ...teamStanding,
      position,
      totalTeams,
      goalDifferential
    };
  };

  const teamStanding = getTeamStanding();

  if (teamLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  navigate('/');
                }
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Team Details</h1>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="bg-card rounded-xl border border-border p-4 animate-pulse">
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  navigate('/');
                }
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Team Details</h1>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-center text-muted-foreground">Team not found</p>
          </div>
        </div>
      </div>
    );
  }
  
  // FREE TIER RESTRICTION: Block access to other teams' pages for free tier users
  // Wait for ownership data to load before blocking
  if (isLoadingOwnership) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  navigate('/');
                }
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Team Details</h1>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="bg-card rounded-xl border border-border p-4 animate-pulse">
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }
  
  if (isFreeTier && !isOwnTeam) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  navigate('/');
                }
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Team Details</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 mt-12">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
          <p className="text-muted-foreground text-center max-w-sm mb-6">
            Viewing other teams' pages is available with a Player Pro or Commissioner subscription. You can still view your own team's page.
          </p>
          <Button 
            onClick={() => {
              setPageTransitionDirection('up');
              navigate('/subscription');
            }}
            size="lg"
            data-testid="button-upgrade-team-view"
          >
            Upgrade to View All Teams
          </Button>
        </div>
      </div>
    );
  }

  const typedTeam = team as any;

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPageTransitionDirection('down');
              window.history.back();
            }}
            className="p-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold" data-testid="text-team-view-title">Team Details</h1>
        </div>
      </div>

      <div className="w-full px-4 py-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-col space-y-1.5 p-6 bg-[#e2e2e2] dark:bg-[#212121] pl-[12px] pr-[12px] pt-[4px] pb-[4px]">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${typedTeam.logoUrl ? 'bg-transparent' : 'bg-primary'}`}>
                {typedTeam.logoUrl ? (
                  <img 
                    src={getImageUrl(typedTeam.logoUrl) || ''} 
                    alt={`${typedTeam.name} logo`}
                    className="w-full h-full rounded-lg object-contain"
                    data-testid="img-team-logo"
                  />
                ) : (
                  <Trophy className="w-8 h-8 text-primary-foreground" />
                )}
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl" data-testid="text-team-name">
                  {typedTeam.name}
                </CardTitle>
              </div>
            </div>
          </CardHeader>
        </Card>

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
          <CardContent className="p-6 pt-[5px] pb-[5px]">
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

        <div className="px-0 pl-[0px] pr-[0px] mt-[0px] mb-[0px]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pl-[0px] pr-[0px] pt-[2px] pb-[2px]">
            {teamLeaders ? (
              <>
                <Card className="rounded-lg border text-card-foreground shadow-sm p-3 h-10 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-team-points-leader">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{teamLeaders.topScorer?.points || 0}</span>
                    </div>
                  </div>
                  <span className="text-sm font-medium truncate" data-testid="text-points-leader-name">{teamLeaders.topScorer?.user?.lastName || 'N/A'}</span>
                </Card>

                <Card className="rounded-lg border text-card-foreground shadow-sm p-3 h-10 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-team-goals-leader">
                  <div className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-success" />
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{teamLeaders.topGoalScorer?.goals || 0}</span>
                    </div>
                  </div>
                  <span className="text-sm font-medium truncate" data-testid="text-goals-leader-name">{teamLeaders.topGoalScorer?.user?.lastName || 'N/A'}</span>
                </Card>

                <Card className="rounded-lg border text-card-foreground shadow-sm p-3 h-10 flex items-center justify-between bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-team-assists-leader">
                  <div className="flex items-center gap-3">
                    <Apple className="w-5 h-5 text-info" />
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{teamLeaders.topAssistProvider?.assists || 0}</span>
                    </div>
                  </div>
                  <span className="text-sm font-medium truncate" data-testid="text-assists-leader-name">{teamLeaders.topAssistProvider?.user?.lastName || 'N/A'}</span>
                </Card>

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

        <Card className="rounded-lg border text-card-foreground shadow-sm bg-[#e2e2e2] dark:bg-[#212121]">
          <CardHeader className="flex flex-col space-y-1.5 p-6 pt-[5px] pb-[5px]">
            <CardTitle className="text-xl font-semibold leading-none tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5" />
              Roster ({teamMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-[5px] pb-[5px]">
            {teamMembers.length > 0 ? (
              <div className="space-y-2">
                {teamMembers.map((member: any) => {
                  const memberStats = (teamStats as any[]).find((stat: any) => 
                    String(stat.userId ?? stat.user?.id) === String(member.userId ?? member.user?.id)
                  );
                  
                  return (
                    <div 
                      key={member.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-card border hover:bg-accent transition-colors"
                      data-testid={`roster-member-${member.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <ClickableAvatar
                          userId={member.user?.id || ''}
                          profileImageUrl={member.user?.profileImageUrl}
                          firstName={member.user?.firstName}
                          lastName={member.user?.lastName}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium" data-testid={`text-member-name-${member.id}`}>
                            {member.user?.firstName || 'Unknown'} {member.user?.lastName || 'Player'}
                          </p>
                          {member.jerseyNumber && (
                            <p className="text-sm text-muted-foreground">
                              #{member.jerseyNumber} {member.position && `• ${member.position}`}
                            </p>
                          )}
                        </div>
                      </div>
                      {memberStats && (
                        <div className="text-right text-sm">
                          <p className="font-medium">{memberStats.goals || 0}G {memberStats.assists || 0}A</p>
                          <p className="text-muted-foreground">{memberStats.points || 0} pts</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No roster members found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
