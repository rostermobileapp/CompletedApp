import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format, isBefore, isAfter, addHours } from "date-fns";
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Trophy, ArrowLeft, Check, X, Clock, Users, Plus } from "lucide-react";
import { RSVPButtons } from "@/components/RSVPButtons";
import { RSVPStatusIcon } from "@/components/RSVPStatusIcon";
import { RSVPDetailModal } from "@/components/RSVPDetailModal";
import { SubstituteRequestModal } from "@/components/SubstituteRequestModal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { Scrimmage, ScrimmageRequest, User } from "@shared/schema";
import { ScrimmageRSVPButtons } from "@/components/ScrimmageRSVPButtons";
import { ScrimmageRSVPStatusIcon } from "@/components/ScrimmageRSVPStatusIcon";
import { useDashboardSelection } from "@/hooks/useDashboardSelection";
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';

const personalReminderSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, "Date and time are required"),
});

const teamGameSchema = z.object({
  teamId: z.string().min(1, "Team is required"),
  opponentName: z.string().min(1, "Opponent name is required"),
  scheduledAt: z.string().min(1, "Date and time are required"),
  venue: z.string().optional(),
  notes: z.string().optional(),
});

export default function Calendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const gamesListRef = useRef<HTMLDivElement>(null);
  const { selectedTeamId } = useDashboardSelection();
  
  // Modal state for RSVP details and substitute requests
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [selectedGameData, setSelectedGameData] = useState<any>(null);
  const [substituteRequestData, setSubstituteRequestData] = useState<{ playerId: string; playerName: string; teamId?: string } | null>(null);
  
  // Add event dialog state
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [eventType, setEventType] = useState<'reminder' | 'game' | null>(null);

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

  // Get active team based on Dashboard selection (or first team if none selected/invalid)
  const activeTeam = (() => {
    if (!Array.isArray(userTeams) || userTeams.length === 0) return null;
    
    if (selectedTeamId) {
      const selectedTeam = userTeams.find((team: any) => team.id === selectedTeamId);
      // If selected team exists, use it; otherwise fall back to first team
      return selectedTeam || userTeams[0];
    }
    
    return userTeams[0];
  })();

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

  // Fetch user's personal reminders
  const { data: personalReminders = [] } = useQuery({
    queryKey: ["/api/user/personal-reminders"],
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

  // Personal reminder form
  const reminderForm = useForm<z.infer<typeof personalReminderSchema>>({
    resolver: zodResolver(personalReminderSchema),
    defaultValues: {
      title: "",
      description: "",
      scheduledAt: "",
    },
  });

  // Team game form
  const gameForm = useForm<z.infer<typeof teamGameSchema>>({
    resolver: zodResolver(teamGameSchema),
    defaultValues: {
      teamId: "",
      opponentName: "",
      scheduledAt: "",
      venue: "",
      notes: "",
    },
  });

  // Create personal reminder mutation
  const createReminderMutation = useMutation({
    mutationFn: async (data: z.infer<typeof personalReminderSchema>) => {
      await apiRequest("POST", "/api/personal-reminders", {
        ...data,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/personal-reminders"] });
      toast({
        title: "Reminder Created",
        description: "Your personal reminder has been added to your calendar.",
      });
      setEventType(null);
      reminderForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create reminder. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create team game mutation
  const createGameMutation = useMutation({
    mutationFn: async (data: z.infer<typeof teamGameSchema>) => {
      await apiRequest("POST", "/api/games", {
        homeTeamId: data.teamId,
        awayTeamId: null, // Create placeholder for opponent
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        venue: data.venue || null,
        notes: data.notes || null,
        opponentName: data.opponentName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/all"] });
      toast({
        title: "Game Created",
        description: "Your team game has been added to your calendar.",
      });
      setEventType(null);
      gameForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create game. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter games by active team (or all user teams if none selected)
  const userGames = Array.isArray(allGames) && Array.isArray(userTeams) 
    ? allGames.filter((game: any) => {
        if (selectedTeamId) {
          // Team is selected - filter by activeTeam (which has fallback logic)
          return activeTeam && (game.homeTeamId === activeTeam.id || game.awayTeamId === activeTeam.id);
        } else {
          // No team selected - show games for all user teams
          const userTeamIds = userTeams.map((team: any) => team.id);
          return userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
        }
      }).sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    : [];

  // Get active team's league (if a team is active)
  const activeTeamLeagueId = activeTeam?.leagueId;

  // Get user's relevant scrimmages (created + approved requests), filtered by selected team's league
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
  ].filter(scrimmage => {
    // Filter by active team's league if a team is selected
    if (selectedTeamId) {
      return activeTeamLeagueId && scrimmage.leagueId === activeTeamLeagueId;
    }
    return true;
  });

  // Get user's substitute games (games they're subbing for), filtered by selected team
  const substituteGames = Array.isArray(mySubstitutions) 
    ? mySubstitutions
        .map((sub: any) => ({
          ...sub.game,
          type: 'substitute' as const,
          substituteForTeam: sub.requestingTeam,
          scheduledAt: sub.game.scheduledAt,
        }))
        .filter((game: any) => {
          // Filter by active team if a team is selected
          if (selectedTeamId) {
            return activeTeam && (game.homeTeamId === activeTeam.id || game.awayTeamId === activeTeam.id);
          }
          return true;
        })
    : [];

  // Combine games, scrimmages, personal reminders, and substitute games, then sort chronologically
  const allEvents = [
    ...userGames.map((game: any) => ({ ...game, type: 'game' as const })),
    ...userScrimmages,
    ...substituteGames,
    ...(Array.isArray(personalReminders) ? personalReminders.map((reminder: any) => ({ ...reminder, type: 'reminder' as const })) : [])
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
        <div className="flex items-center justify-between gap-4">
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
          <Button
            onClick={() => setShowAddEventDialog(true)}
            className="w-10 h-10 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full"
            data-testid="button-add-event"
          >
            <Plus className="w-5 h-5" />
          </Button>
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

              // Handle personal reminders
              if (event.type === 'reminder') {
                return (
                  <div 
                    key={`reminder-${event.id}`}
                    className="bg-card rounded-xl border border-green-200 dark:border-green-800 p-4 relative" 
                    data-testid={`card-reminder-${event.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center relative">
                        <Clock className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold" data-testid={`text-reminder-title-${event.id}`}>
                          {event.title}
                        </h3>
                        <p className="text-sm text-muted-foreground" data-testid={`text-reminder-time-${event.id}`}>
                          {format(new Date(event.scheduledAt), 'MMM d • h:mm a')}
                        </p>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-1" data-testid={`text-reminder-description-${event.id}`}>
                            {event.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                            Reminder
                          </span>
                        </div>
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
                      const opponentTeam = game.homeTeam?.id === activeTeam?.id ? game.awayTeam : game.homeTeam;
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
                      vs {game.homeTeam?.id === activeTeam?.id ? game.awayTeam?.name : game.homeTeam?.name}
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
                        <span className={game.homeTeam?.id === activeTeam?.id ? "text-primary" : "text-muted-foreground"}>
                          {game.homeTeam?.name}: {game.homeScore ?? 0}
                        </span>
                        <span className="text-muted-foreground mx-2">•</span>
                        <span className={game.awayTeam?.id === activeTeam?.id ? "text-primary" : "text-muted-foreground"}>
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
                    {!isCompleted && !isPastGame && user && activeTeam && (game.homeTeam?.id === activeTeam.id || game.awayTeam?.id === activeTeam.id) && (
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
                    {!isCompleted && !isPastGame && user && activeTeam && (game.homeTeam?.id === activeTeam.id || game.awayTeam?.id === activeTeam.id) && (
                      <RSVPButtons 
                        gameId={game.id} 
                        userId={(user as any).id}
                        userTeamId={activeTeam.id}
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
                            const userTeam = game.homeTeam?.id === activeTeam?.id ? game.homeTeam : game.awayTeam;
                            if (userTeam && activeTeam) {
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

      {/* Add Event Dialog */}
      <Dialog open={showAddEventDialog} onOpenChange={setShowAddEventDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-add-event">
          <DialogHeader>
            <DialogTitle data-testid="text-add-event-title">Add Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              onClick={() => {
                setEventType('reminder');
                setShowAddEventDialog(false);
              }}
              variant="outline"
              className="w-full h-auto py-4 px-6 justify-start text-left"
              data-testid="button-select-reminder"
            >
              <div>
                <div className="font-semibold">Personal Reminder</div>
                <div className="text-sm text-muted-foreground">Add a personal note or reminder to your calendar</div>
              </div>
            </Button>
            <Button
              onClick={() => {
                setEventType('game');
                setShowAddEventDialog(false);
              }}
              variant="outline"
              className="w-full h-auto py-4 px-6 justify-start text-left"
              data-testid="button-select-game"
            >
              <div>
                <div className="font-semibold">Team Game</div>
                <div className="text-sm text-muted-foreground">Schedule a game for your team</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Personal Reminder Form Dialog */}
      <Dialog open={eventType === 'reminder'} onOpenChange={(open) => !open && setEventType(null)}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-reminder">
          <DialogHeader>
            <DialogTitle data-testid="text-create-reminder-title">Create Personal Reminder</DialogTitle>
          </DialogHeader>
          <Form {...reminderForm}>
            <form onSubmit={reminderForm.handleSubmit((data) => createReminderMutation.mutate(data))} className="space-y-4">
              <FormField
                control={reminderForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Reminder title" {...field} data-testid="input-reminder-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Add more details..." {...field} data-testid="input-reminder-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-reminder-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-reminder"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createReminderMutation.isPending}
                  data-testid="button-submit-reminder"
                >
                  {createReminderMutation.isPending ? "Creating..." : "Create Reminder"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Team Game Form Dialog */}
      <Dialog open={eventType === 'game'} onOpenChange={(open) => !open && setEventType(null)}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-game">
          <DialogHeader>
            <DialogTitle data-testid="text-create-game-title">Create Team Game</DialogTitle>
          </DialogHeader>
          <Form {...gameForm}>
            <form onSubmit={gameForm.handleSubmit((data) => createGameMutation.mutate(data))} className="space-y-4">
              <FormField
                control={gameForm.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-game-team">
                          <SelectValue placeholder="Select your team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(userTeams) && userTeams.map((team: any) => (
                          <SelectItem key={team.id} value={team.id} data-testid={`option-team-${team.id}`}>
                            {team.leagueId && team.league ? `${team.league.name}: ${team.name}` : team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="opponentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opponent Team</FormLabel>
                    <FormControl>
                      <Input placeholder="Opponent team name" {...field} data-testid="input-game-opponent" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-game-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="venue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Game location" {...field} data-testid="input-game-venue" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes..." {...field} data-testid="input-game-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-game"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createGameMutation.isPending}
                  data-testid="button-submit-game"
                >
                  {createGameMutation.isPending ? "Creating..." : "Create Game"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}