import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format, isBefore, isAfter, addHours } from "date-fns";
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Trophy, ArrowLeft, Check, X, Clock, Users } from "lucide-react";
import { RSVPButtons } from "@/components/RSVPButtons";
import { RSVPStatusIcon } from "@/components/RSVPStatusIcon";
import { RSVPDetailModal } from "@/components/RSVPDetailModal";
import { SubstituteRequestModal } from "@/components/SubstituteRequestModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { Scrimmage, ScrimmageRequest, User } from "@shared/schema";
import { ScrimmageRSVPButtons } from "@/components/ScrimmageRSVPButtons";
import { ScrimmageRSVPStatusIcon } from "@/components/ScrimmageRSVPStatusIcon";
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';

export default function Calendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const gamesListRef = useRef<HTMLDivElement>(null);
  
  // Modal state for RSVP details and substitute requests
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [selectedGameData, setSelectedGameData] = useState<any>(null);
  const [substituteRequestData, setSubstituteRequestData] = useState<{ playerId: string; playerName: string; teamId?: string } | null>(null);

  // Handler functions for modal interactions
  const handleViewDetails = (game: any) => {
    setSelectedGameId(game.id);
    setSelectedGameData(game);
    setShowRSVPModal(true);
  };

  const handleRequestSubstitute = (playerId: string, playerName: string, teamId?: string) => {
    setSubstituteRequestData({ playerId, playerName, teamId });
    setShowRSVPModal(false);
    setShowSubstituteModal(true);
  };

  const handleCloseRSVPModal = () => {
    setShowRSVPModal(false);
    setSelectedGameId("");
    setSelectedGameData(null);
  };

  const handleCloseSubstituteModal = () => {
    setShowSubstituteModal(false);
    setSubstituteRequestData(null);
  };

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

  // Fetch user's created scrimmages
  const { data: createdScrimmages = [] } = useQuery({
    queryKey: ["/api/users", "scrimmages"],
  }) as { data: (Scrimmage & { creator: User })[] };

  // Fetch user's scrimmage requests (to find approved ones they're participating in)
  const { data: scrimmageRequests = [] } = useQuery({
    queryKey: ["/api/users", "scrimmage-requests"],
  }) as { data: (ScrimmageRequest & { scrimmage: Scrimmage & { creator: User } })[] };

  // Fetch user's approved substitute requests (games they're subbing for)
  const { data: mySubstitutions = [] } = useQuery({
    queryKey: ["/api/substitute-requests/my-substitutions"],
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

  // Get user's relevant scrimmages (created + approved requests)
  const userScrimmages = [
    // User's created scrimmages
    ...createdScrimmages.map(scrimmage => ({
      ...scrimmage,
      type: 'scrimmage' as const,
      userRole: 'creator' as const,
      scheduledAt: scrimmage.dateTime, // Match games field name
    })),
    // User's approved scrimmage requests
    ...scrimmageRequests
      .filter(request => request.status === 'approved')
      .map(request => ({
        ...request.scrimmage,
        type: 'scrimmage' as const,
        userRole: 'participant' as const,
        scheduledAt: request.scrimmage.dateTime, // Match games field name
      }))
  ];

  // Get user's substitute games (games they're subbing for)
  const substituteGames = Array.isArray(mySubstitutions) 
    ? mySubstitutions.map((sub: any) => ({
        ...sub.game,
        type: 'substitute' as const,
        substituteForTeam: sub.requestingTeam,
        scheduledAt: sub.game.scheduledAt,
      }))
    : [];

  // Combine games, scrimmages, and substitute games, then sort chronologically
  const allEvents = [
    ...userGames.map((game: any) => ({ ...game, type: 'game' as const })),
    ...userScrimmages,
    ...substituteGames
  ].sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Find the index to scroll to (between last event and next event)
  const currentTime = new Date();
  const nextEventIndex = allEvents.findIndex((event: any) => 
    isAfter(new Date(event.scheduledAt), currentTime)
  );
  const scrollToIndex = nextEventIndex > 0 ? nextEventIndex - 1 : 0;

  // Auto-scroll to position between last and next event
  useEffect(() => {
    if (!gamesLoading && allEvents.length > 0 && gamesListRef.current) {
      const eventCards = gamesListRef.current.children;
      if (eventCards[scrollToIndex]) {
        eventCards[scrollToIndex].scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }
  }, [gamesLoading, allEvents.length, scrollToIndex]);

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
        ) : allEvents.length > 0 ? (
          <div className="space-y-3" ref={gamesListRef}>
            {allEvents.map((event: any) => {
              // Handle scrimmage events
              if (event.type === 'scrimmage') {
                return (
                  <div 
                    key={`scrimmage-${event.id}`}
                    className="bg-card rounded-xl border border-blue-200 dark:border-blue-800 p-4 relative cursor-pointer hover:bg-muted/50 transition-colors" 
                    onClick={() => navigate(`/scrimmage-management`)}
                    data-testid={`card-scrimmage-${event.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center relative">
                        <Users className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold" data-testid={`text-scrimmage-title-${event.id}`}>
                          {event.title}
                        </h3>
                        <p className="text-sm text-muted-foreground" data-testid={`text-scrimmage-time-${event.id}`}>
                          {format(new Date(event.scheduledAt), 'MMM d • h:mm a')}
                        </p>
                        {event.location && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-scrimmage-location-${event.id}`}>
                            {event.location}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                            {event.userRole === 'creator' ? 'Creator' : 'Participant'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Scrimmage
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {/* RSVP Status Icon */}
                        {user && event.userRole !== 'creator' && (
                          <ScrimmageRSVPStatusIcon scrimmageId={event.id} />
                        )}
                        
                        {/* RSVP Buttons for non-creators */}
                        {user && event.userRole !== 'creator' && (
                          <ScrimmageRSVPButtons 
                            scrimmageId={event.id} 
                            className="mb-1"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Handle substitute games
              if (event.type === 'substitute') {
                const game = event;
                const isCompleted = game.isCompleted || (game.homeScore !== null && game.awayScore !== null);
                const isPastGame = isBefore(addHours(new Date(game.scheduledAt), 2), new Date());
                return (
                  <div 
                    key={game.id} 
                    className="bg-card rounded-xl border border-border p-4 relative hover:bg-muted/50 transition-colors" 
                    data-testid={`card-substitute-game-${game.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center relative">
                        <Trophy className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold" data-testid={`text-substitute-team-${game.id}`}>
                          Subbing for {event.substituteForTeam?.name || 'Team'}
                        </h3>
                        <p className="text-sm text-muted-foreground" data-testid={`text-substitute-time-${game.id}`}>
                          {format(new Date(game.scheduledAt), 'MMM d • h:mm a')}
                        </p>
                        {game.venue && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-substitute-venue-${game.id}`}>
                            {game.venue}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-1 rounded-full">
                            Substitute
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Handle game events (existing logic)
              const game = event;
              const isCompleted = game.isCompleted || (game.homeScore !== null && game.awayScore !== null);
              const isPastGame = isBefore(addHours(new Date(game.scheduledAt), 2), new Date());
              return (
              <div 
                key={game.id} 
                className="bg-card rounded-xl border border-border p-4 relative hover:bg-muted/50 transition-colors" 
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
                    
                    {/* View Details Button for upcoming games */}
                    {!isCompleted && !isPastGame && user && primaryTeam && (game.homeTeam?.id === primaryTeam.id || game.awayTeam?.id === primaryTeam.id) && (
                      <Button
                        size="sm"
                        variant="outline" 
                        className="mb-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(game);
                        }}
                        data-testid={`button-view-details-${game.id}`}
                      >
                        <Users className="w-3 h-3 mr-1" />
                        View Details
                      </Button>
                    )}

                    {/* RSVP Buttons for upcoming games */}
                    {!isCompleted && !isPastGame && user && primaryTeam && (game.homeTeam?.id === primaryTeam.id || game.awayTeam?.id === primaryTeam.id) && (
                      <RSVPButtons 
                        gameId={game.id} 
                        userId={(user as any).id}
                        userTeamId={primaryTeam.id}
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
          <div className="bg-card rounded-xl border border-border p-8 text-center" data-testid="empty-all-events">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No upcoming games or scrimmages scheduled</p>
          </div>
        )}
      </div>

      {/* RSVP Detail Modal */}
      {showRSVPModal && selectedGameData && (() => {
        // Determine which team the user is on for this game
        const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
        const userTeamId = userTeamIds.includes(selectedGameData.homeTeamId || selectedGameData.homeTeam?.id) 
          ? (selectedGameData.homeTeamId || selectedGameData.homeTeam?.id)
          : userTeamIds.includes(selectedGameData.awayTeamId || selectedGameData.awayTeam?.id)
            ? (selectedGameData.awayTeamId || selectedGameData.awayTeam?.id)
            : undefined;
        
        return (
          <RSVPDetailModal
            gameId={selectedGameId}
            isOpen={showRSVPModal}
            onClose={handleCloseRSVPModal}
            onRequestSubstitute={handleRequestSubstitute}
            showSubstituteButtons={true}
            teamId={userTeamId}
          />
        );
      })()}

      {/* Substitute Request Modal */}
      {showSubstituteModal && selectedGameData && substituteRequestData && substituteRequestData.teamId && (
        <SubstituteRequestModal
          gameId={selectedGameId}
          gameDate={selectedGameData.scheduledAt}
          leagueId={selectedGameData.leagueId || selectedGameData.homeTeam?.leagueId || selectedGameData.awayTeam?.leagueId}
          originalPlayerId={substituteRequestData.playerId}
          originalPlayerName={substituteRequestData.playerName}
          homeTeamId={selectedGameData.homeTeamId || selectedGameData.homeTeam?.id}
          awayTeamId={selectedGameData.awayTeamId || selectedGameData.awayTeam?.id}
          originalPlayerTeamId={substituteRequestData.teamId}
          isOpen={showSubstituteModal}
          onClose={handleCloseSubstituteModal}
        />
      )}
    </div>
  );
}