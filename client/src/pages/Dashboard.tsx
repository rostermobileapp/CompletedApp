import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search, Coffee, Check, X, Beer } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import logoUrl from '@assets/Roster Logo White_1757083079896.png';
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';

export default function Dashboard() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: upcomingGames, isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
  });

  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  const { data: userLeagueMemberships } = useQuery({
    queryKey: ['/api/user/league-memberships'],
  });

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;
  const primaryLeagueMembership = Array.isArray(userLeagueMemberships) && userLeagueMemberships.length > 0 ? userLeagueMemberships[0] : null;

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
            {/* Jersey Number */}
            {primaryLeagueMembership?.jerseyNumber && (
              <div className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded font-semibold">
                #{primaryLeagueMembership.jerseyNumber}
              </div>
            )}
            
            {/* Captain Badge */}
            {primaryLeagueMembership?.isCaptain && (
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
                  <p className="text-2xl font-bold" data-testid="text-games-played">
                    {primaryTeam.wins + primaryTeam.losses + primaryTeam.ties}
                  </p>
                  <p className="text-xs text-muted-foreground">Games Played</p>
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
                    {primaryTeam.wins}-{primaryTeam.losses}-{primaryTeam.ties}
                  </p>
                  <p className="text-xs text-muted-foreground">Team Record</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Upcoming Games */}
      <div className="px-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-upcoming-games-title">Upcoming Games</h2>
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
              <div key={game.id} className="bg-card rounded-xl border border-border p-4 relative" data-testid={`card-game-${game.id}`}>
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
                      
                      // Show beverage icon only if user has beverage duty AND is not checked out
                      const hasBeverageDuty = game.homeBeverageDutyUserId === (user as any)?.id || game.awayBeverageDutyUserId === (user as any)?.id;
                      const isCheckedOut = userStatus === 'checked_out';
                      
                      return hasBeverageDuty && !isCheckedOut ? (
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
      
      
      {/* Recent Activity */}
      <div className="px-6 mb-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-recent-activity-title">Recent Activity</h2>
        <div className="space-y-3">
          <div className="bg-card rounded-lg border border-border p-3" data-testid="card-activity-placeholder">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center mt-1">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Join a team to see recent activity
                </p>
              </div>
            </div>
          </div>
        </div>
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
    </div>
  );
}
