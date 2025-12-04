import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Trophy, Users, Upload, Edit } from 'lucide-react';
import { useLocation } from 'wouter';
import { ObjectUploader } from '@/components/ObjectUploader';
import { useToast } from '@/hooks/use-toast';
import { queryClient, getImageUrl } from '@/lib/queryClient';
import type { UploadResult } from '@uppy/core';
import { apiRequest } from '@/lib/queryClient';

export default function Roster() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: [`/api/teams/${primaryTeam?.id}/members`],
    enabled: !!primaryTeam?.id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0, // Force fresh data
  });


  // Team logo upload mutation
  const updateTeamLogoMutation = useMutation({
    mutationFn: async (logoUrl: string) => {
      return apiRequest(`/api/teams/${primaryTeam?.id}/logo`, 'PATCH', { logoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      toast({
        title: "Success",
        description: "Team logo updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update team logo",
        variant: "destructive",
      });
    },
  });

  const handleGetTeamLogoUploadParameters = async () => {
    const response = await apiRequest('/api/team-logos/upload', 'POST');
    const data = await response.json();
    return {
      method: 'PUT' as const,
      url: data.uploadURL,
      path: data.path, // Return path for later use
    };
  };

  const handleTeamLogoUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful[0]) {
      const logoPath = (result.successful[0] as any).path || (result.successful[0] as any).uploadURL;
      updateTeamLogoMutation.mutate(logoPath);
    }
  };

  const isTeamCaptain = user && primaryTeam && primaryTeam.captainId === user.id;

  if (!primaryTeam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" data-testid="no-team-state">
        <Users className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">No Team Found</h2>
        <p className="text-muted-foreground text-center mb-6">
          You need to join a team to view the roster
        </p>
        <button 
          onClick={() => navigate('/league-search')}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold"
          data-testid="button-find-league"
        >
          Find a League
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="roster-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/more');
            }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Team Roster</h1>
        </div>
      </div>
      
      {/* Team Info */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-4" data-testid="card-team-info">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
                {primaryTeam.logoUrl ? (
                  <img 
                    src={getImageUrl(primaryTeam.logoUrl) || ''} 
                    alt={`${primaryTeam.name} logo`}
                    className="w-full h-full rounded-lg object-cover"
                    data-testid="img-team-logo"
                  />
                ) : (
                  <Trophy className="w-8 h-8 text-primary-foreground" />
                )}
              </div>
              {isTeamCaptain && (
                <div className="absolute -bottom-2 -right-2">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={5 * 1024 * 1024} // 5MB
                    onGetUploadParameters={handleGetTeamLogoUploadParameters}
                    onComplete={handleTeamLogoUploadComplete}
                    buttonClassName="w-8 h-8 rounded-full bg-primary text-primary-foreground p-0 flex items-center justify-center hover:bg-primary/90"
                  >
                    <Upload className="w-4 h-4" />
                  </ObjectUploader>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold" data-testid="text-team-name">{primaryTeam.name}</h2>
              <p className="text-muted-foreground" data-testid="text-team-record">
                {primaryTeam.wins}-{primaryTeam.losses}-{primaryTeam.ties} • League Position TBD
              </p>
              {isTeamCaptain && (
                <p className="text-xs text-primary font-medium mt-1">Team Captain</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div data-testid="stat-wins">
              <p className="text-2xl font-bold text-success">{primaryTeam.wins}</p>
              <p className="text-xs text-muted-foreground">Wins</p>
            </div>
            <div data-testid="stat-losses">
              <p className="text-2xl font-bold text-destructive">{primaryTeam.losses}</p>
              <p className="text-xs text-muted-foreground">Losses</p>
            </div>
            <div data-testid="stat-ties">
              <p className="text-2xl font-bold text-warning">{primaryTeam.ties}</p>
              <p className="text-xs text-muted-foreground">Ties</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Players List */}
      <div className="px-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-players-title">
            Players ({Array.isArray(teamMembers) ? teamMembers.filter((member: any) => !member.user.email?.includes('@placeholder.roster')).length : 0})
          </h2>
        </div>
        
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3" data-testid="loading-team-members">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-3 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-muted rounded-full shrink-0"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : Array.isArray(teamMembers) && teamMembers.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {teamMembers
              .filter((member: any) => !member.user.email?.includes('@placeholder.roster'))
              .map((member: any) => (
              <div key={member.id} className="bg-card rounded-lg border border-border p-3" data-testid={`card-player-${member.id}`}>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shrink-0">
                    {member.user.profileImageUrl ? (
                      <img 
                        src={getImageUrl(member.user.profileImageUrl) || ''} 
                        alt={`${member.user.firstName} ${member.user.lastName}`}
                        className="w-full h-full rounded-full object-cover"
                        data-testid={`img-player-avatar-${member.id}`}
                      />
                    ) : (
                      <span className="text-primary-foreground font-semibold text-sm" data-testid={`text-player-initials-${member.id}`}>
                        {member.user.firstName?.[0]}{member.user.lastName?.[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="font-semibold text-sm truncate" data-testid={`text-player-name-${member.id}`}>
                        {member.user.firstName} {member.user.lastName}
                      </h3>
                      {primaryTeam.captainId === member.userId && (
                        <span className="text-warning font-bold text-xs shrink-0">C</span>
                      )}
                      {isTeamCaptain && (
                        <button
                          onClick={() => {
                            navigate(`/league-management?leagueId=${primaryTeam.leagueId}&edit=true&editMember=${member.id}`);
                          }}
                          className="p-0.5 hover:bg-muted rounded-md transition-colors shrink-0"
                          title="Edit Player"
                          data-testid={`button-edit-player-${member.id}`}
                        >
                          <Edit className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate" data-testid={`text-player-position-${member.id}`}>
                      {member.position ? `${member.position}` : 'Player'}
                      {member.jerseyNumber ? ` • #${member.jerseyNumber}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12" data-testid="empty-team-members">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No team members found</p>
          </div>
        )}
      </div>
    </div>
  );
}
