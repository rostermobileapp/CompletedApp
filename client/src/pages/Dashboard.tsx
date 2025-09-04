import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search, Coffee, UserCheck, UserX } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [, navigate] = useLocation();

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
    mutationFn: async (gameId: string) => {
      return apiRequest('POST', `/api/games/${gameId}/check-out`, {});
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

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="dashboard-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-welcome">
              {user?.firstName || 'Player'}
            </h1>
            {primaryTeam && (
              <p className="text-muted-foreground" data-testid="text-primary-team">
                {primaryTeam.name}
              </p>
            )}
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
      
      {/* Find a League Section - Compact */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-lg border border-border px-2 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-primary" />
            <span className="font-medium">Looking for a League?</span>
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
            {/* Beverage Duty Alert */}
            {upcomingGames.some((game: any) => 
              game.homeBeverageDutyUserId === (user as any)?.id || 
              game.awayBeverageDutyUserId === (user as any)?.id
            ) && (
              <div className="bg-red-500 text-white rounded-lg p-3 mb-3" data-testid="alert-beverage-duty">
                <div className="flex items-center gap-2">
                  <Coffee className="w-4 h-4" />
                  <span className="font-medium">Beverage Duty Alert!</span>
                </div>
                <p className="text-sm mt-1">
                  You have beverage duty for upcoming games. Don't forget!
                </p>
              </div>
            )}
            {upcomingGames
              .filter((game: any) => {
                // Ensure we only show games for teams the user is currently on
                const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
                return userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
              })
              .slice(0, 2).map((game: any) => (
              <div key={game.id} className="bg-card rounded-xl border border-border p-4" data-testid={`card-game-${game.id}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
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
                  <div className="flex flex-col gap-2">
                    <span className="tier-badge bg-success text-accent-foreground text-xs px-2 py-1 rounded-full text-center" data-testid={`badge-game-status-${game.id}`}>
                      UPCOMING
                    </span>
                    {(() => {
                      // Find user's attendance status for this game
                      const userStatus = Array.isArray(userAttendanceStatuses) ? 
                        userAttendanceStatuses.find((status: any) => status.gameId === game.id)?.status : null;
                      
                      if (userStatus === 'checked_in') {
                        return (
                          <div className="text-center">
                            <span className="tier-badge bg-green-500 text-white text-xs px-2 py-1 rounded-full" data-testid={`status-confirmed-${game.id}`}>
                              ✓ Confirmed
                            </span>
                          </div>
                        );
                      } else if (userStatus === 'checked_out') {
                        return (
                          <div className="text-center">
                            <span className="tier-badge bg-red-500 text-white text-xs px-2 py-1 rounded-full" data-testid={`status-declined-${game.id}`}>
                              ✗ Declined
                            </span>
                          </div>
                        );
                      } else {
                        // No response yet, show buttons
                        return (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs bg-green-500 text-white hover:bg-green-600 border-green-500"
                              onClick={() => {
                                const userTeam = game.homeTeam?.id === primaryTeam?.id ? game.homeTeam : game.awayTeam;
                                if (userTeam && primaryTeam) {
                                  checkInMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                                }
                              }}
                              disabled={checkInMutation.isPending}
                              data-testid={`button-check-in-${game.id}`}
                            >
                              <UserCheck className="w-3 h-3 mr-1" />
                              Check In
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs bg-red-500 text-white hover:bg-red-600 border-red-500"
                              onClick={() => checkOutMutation.mutate(game.id)}
                              disabled={checkOutMutation.isPending}
                              data-testid={`button-check-out-${game.id}`}
                            >
                              <UserX className="w-3 h-3 mr-1" />
                              Check Out
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
      <div className="px-6">
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
    </div>
  );
}
