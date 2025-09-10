import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format, isBefore, isAfter, addHours } from "date-fns";
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Trophy, ArrowLeft, Check, X, Clock } from "lucide-react";
import { RSVPButtons } from "@/components/RSVPButtons";
import { RSVPStatusIcon } from "@/components/RSVPStatusIcon";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useEffect, useRef } from "react";
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';

export default function Calendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const gamesListRef = useRef<HTMLDivElement>(null);

  // Fetch user's teams
  const { data: userTeams } = useQuery({
    queryKey: ["/api/user/teams"],
  });

  // Get primary team (first team for now)
  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  // Fetch all games (past and future)
  const { data: allGames, isLoading: gamesLoading } = useQuery({
    queryKey: ["/api/user/games/all"],
  });




  // Claim beverage duty mutation
  const claimBeverageDutyMutation = useMutation({
    mutationFn: async ({ gameId, teamId }: { gameId: string; teamId: string }) => {
      await apiRequest("POST", `/api/games/${gameId}/beverage-duty`, { teamId });
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

  // Filter games for user's teams and sort chronologically
  const userGames = Array.isArray(allGames) && Array.isArray(userTeams) 
    ? allGames.filter((game: any) => {
        const userTeamIds = userTeams.map((team: any) => team.id);
        return userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
      }).sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    : [];

  // Find the index to scroll to (between last game and next game)
  const currentTime = new Date();
  const nextGameIndex = userGames.findIndex((game: any) => 
    isAfter(new Date(game.scheduledAt), currentTime)
  );
  const scrollToIndex = nextGameIndex > 0 ? nextGameIndex - 1 : 0;

  // Auto-scroll to position between last and next game
  useEffect(() => {
    if (!gamesLoading && userGames.length > 0 && gamesListRef.current) {
      const gameCards = gamesListRef.current.children;
      if (gameCards[scrollToIndex]) {
        gameCards[scrollToIndex].scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }
  }, [gamesLoading, userGames.length, scrollToIndex]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPageTransitionDirection('down');
              navigate("/");
            }}
            className="p-2"
            data-testid="button-back-to-dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold" data-testid="text-calendar-title">
            Schedule & Results
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
          <div className="space-y-3" ref={gamesListRef}>
            {userGames.map((game: any) => {
              const isCompleted = game.isCompleted || (game.homeScore !== null && game.awayScore !== null);
              const isPastGame = isBefore(addHours(new Date(game.scheduledAt), 2), new Date());
              return (
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
                    {/* Score display for completed games */}
                    {isCompleted && (
                      <div className="text-sm font-medium mt-1" data-testid={`text-game-score-${game.id}`}>
                        <span className={game.homeTeam?.id === primaryTeam?.id ? "text-primary" : "text-muted-foreground"}>
                          {game.homeTeam?.name}: {game.homeScore ?? 0}
                        </span>
                        <span className="text-muted-foreground mx-2">•</span>
                        <span className={game.awayTeam?.id === primaryTeam?.id ? "text-primary" : "text-muted-foreground"}>
                          {game.awayTeam?.name}: {game.awayScore ?? 0}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {/* RSVP Status Icon */}
                    {!isCompleted && !isPastGame && user && (
                      <RSVPStatusIcon gameId={game.id} userId={(user as any).id} />
                    )}
                    
                    {/* RSVP Buttons for upcoming games */}
                    {!isCompleted && !isPastGame && user && (
                      <RSVPButtons 
                        gameId={game.id} 
                        userId={(user as any).id}
                        className="mb-1"
                      />
                    )}
                    
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
              </div>
              );
            })}
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