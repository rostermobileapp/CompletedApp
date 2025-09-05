import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Trophy, Check, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';

export default function Calendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Fetch user's teams
  const { data: userTeams } = useQuery({
    queryKey: ["/api/user/teams"],
  });

  // Get primary team (first team for now)
  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  // Fetch all upcoming games
  const { data: upcomingGames, isLoading: gamesLoading } = useQuery({
    queryKey: ["/api/user/games/upcoming"],
  });

  // Fetch user attendance statuses
  const { data: userAttendanceStatuses } = useQuery({
    queryKey: ["/api/user/attendance-statuses"],
  });

  // Check in mutation
  const checkInMutation = useMutation({
    mutationFn: async ({ gameId, teamId }: { gameId: string; teamId: string }) => {
      await apiRequest(`/api/games/${gameId}/check-in`, "POST", { teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/attendance-statuses"] });
      toast({
        title: "Checked In",
        description: "You've successfully checked in to this game.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to check in. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Check out mutation
  const checkOutMutation = useMutation({
    mutationFn: async ({ gameId, teamId }: { gameId: string; teamId: string }) => {
      await apiRequest(`/api/games/${gameId}/check-out`, "POST", { teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/attendance-statuses"] });
      toast({
        title: "Checked Out",
        description: "You've successfully checked out of this game.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to check out. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Claim beverage duty mutation
  const claimBeverageDutyMutation = useMutation({
    mutationFn: async ({ gameId, teamId }: { gameId: string; teamId: string }) => {
      await apiRequest(`/api/games/${gameId}/beverage-duty`, "POST", { teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      toast({
        title: "Beverage Duty Claimed",
        description: "You've successfully claimed beverage duty for this game.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to claim beverage duty. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter games for user's teams
  const userGames = Array.isArray(upcomingGames) && Array.isArray(userTeams) 
    ? upcomingGames.filter((game: any) => {
        const userTeamIds = userTeams.map((team: any) => team.id);
        return userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
      })
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="p-2"
            data-testid="button-back-to-dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold" data-testid="text-calendar-title">
            All Upcoming Games
          </h1>
        </div>
      </div>

      {/* Games List */}
      <div className="px-6 py-6">
        {gamesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse" data-testid={`loading-game-${i}`}>
                <div className="h-16 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        ) : userGames.length > 0 ? (
          <div className="space-y-3">
            {userGames.map((game: any) => (
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
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-8 text-center" data-testid="empty-all-games">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No upcoming games scheduled</p>
          </div>
        )}
      </div>
    </div>
  );
}