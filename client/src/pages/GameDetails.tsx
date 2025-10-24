import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Trophy, Check, X, ArrowLeft, MapPin, Clock, Target, Users, Trash2, Star } from "lucide-react";
import { RSVPButtons } from "@/components/RSVPButtons";
import { RSVPSummary } from "@/components/RSVPSummary";
import { RSVPDetailModal } from "@/components/RSVPDetailModal";
import { SubstituteRequestModal } from "@/components/SubstituteRequestModal";
import { SubstituteRequestsDashboard } from "@/components/SubstituteRequestsDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useRoute } from "wouter";
import { useState } from "react";
import * as React from "react";
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';
import type { GameWithTeams, TeamMemberWithUser, UserTeam, League, GameScoreSubmission, User } from "@shared/schema";

export default function GameDetails() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const [, params] = useRoute("/game/:id");
  const [, scrimmageParams] = useRoute("/scrimmage/:id");
  const gameId = params?.id || scrimmageParams?.id;
  const isScrimmage = location.includes('/scrimmage/');

  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [isEditingScore, setIsEditingScore] = useState(false);
  const [editHomeScore, setEditHomeScore] = useState("");
  const [editAwayScore, setEditAwayScore] = useState("");
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [substituteRequestData, setSubstituteRequestData] = useState<{ playerId: string; playerName: string; teamId?: string } | null>(null);
  const [firstStarUserId, setFirstStarUserId] = useState("");
  const [secondStarUserId, setSecondStarUserId] = useState("");
  const [thirdStarUserId, setThirdStarUserId] = useState("");

  // Fetch user's teams
  const { data: userTeams } = useQuery<UserTeam[]>({
    queryKey: ["/api/user/teams"],
  });

  // Get primary team (first team for now)
  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  // Fetch specific game details
  const { data: game, isLoading: gameLoading } = useQuery<GameWithTeams>({
    queryKey: [`/api/games/${gameId}`],
    enabled: !!gameId && !isScrimmage,
  });

  // Fetch scrimmage details and approved players
  const { data: scrimmageData, isLoading: scrimmageLoading } = useQuery({
    queryKey: [`/api/scrimmages/${gameId}/approved-players`],
    enabled: !!gameId && isScrimmage,
  });


  // Fetch team members to get names for beverage duty
  const { data: homeTeamMembers } = useQuery<TeamMemberWithUser[]>({
    queryKey: [`/api/teams/${game?.homeTeam?.id}/members`],
    enabled: !!game?.homeTeam?.id,
  });

  const { data: awayTeamMembers } = useQuery<TeamMemberWithUser[]>({
    queryKey: [`/api/teams/${game?.awayTeam?.id}/members`],
    enabled: !!game?.awayTeam?.id,
  });


  // Fetch score submissions (only for games, not scrimmages)
  const { data: scoreSubmissions } = useQuery<GameScoreSubmission[]>({
    queryKey: [`/api/games/${gameId}/score-submissions`],
    enabled: !!gameId && !isScrimmage,
  });

  // Fetch league details for commissioner check
  const { data: league } = useQuery<League>({
    queryKey: [`/api/leagues/${game?.leagueId}`],
    enabled: !!game?.leagueId,
  });




  // Claim beverage duty mutation
  const claimBeverageDutyMutation = useMutation({
    mutationFn: async ({ gameId, teamId }: { gameId: string; teamId: string }) => {
      await apiRequest("POST", `/api/games/${gameId}/beverage-duty`, { teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
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

  // Release beverage duty mutation
  const releaseBeverageDutyMutation = useMutation({
    mutationFn: async ({ gameId, teamId }: { gameId: string; teamId: string }) => {
      await apiRequest("POST", `/api/games/${gameId}/release-beverage-duty`, { teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
      toast({
        title: "Beverage Duty Released",
        description: "You've released beverage duty for this game.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to release beverage duty. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Submit score mutation
  const submitScoreMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      const response = await apiRequest("POST", `/api/games/${gameId}/submit-score`, { homeScore, awayScore });
      return await response.json();
    },
    onSuccess: (data: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/score-submissions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      
      setHomeScore("");
      setAwayScore("");
      
      toast({
        title: "Score Submitted",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit score. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete game mutation
  const deleteGameMutation = useMutation({
    mutationFn: async (gameId: string) => {
      await apiRequest("DELETE", `/api/games/${gameId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      toast({
        title: "Game Deleted",
        description: "The game has been successfully deleted.",
      });
      setPageTransitionDirection('down');
      navigate("/");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete game. You may not have permission.",
        variant: "destructive",
      });
    },
  });

  // Fetch game stars
  const { data: gameStars } = useQuery({
    queryKey: [`/api/games/${gameId}/stars`],
    enabled: !!gameId && !isScrimmage,
  });

  // Submit stars mutation
  const submitStarsMutation = useMutation({
    mutationFn: async ({ gameId, firstStarUserId, secondStarUserId, thirdStarUserId }: { 
      gameId: string; 
      firstStarUserId: string; 
      secondStarUserId: string; 
      thirdStarUserId: string; 
    }) => {
      const response = await apiRequest("POST", `/api/games/${gameId}/submit-stars`, { 
        firstStarUserId, 
        secondStarUserId, 
        thirdStarUserId 
      });
      return await response.json();
    },
    onSuccess: (data: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/stars`] });
      setFirstStarUserId("");
      setSecondStarUserId("");
      setThirdStarUserId("");
      toast({
        title: "Stars Awarded",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit stars. Please try again.",
        variant: "destructive",
      });
    },
  });

  if ((isScrimmage && (scrimmageLoading || !scrimmageData)) || (!isScrimmage && (gameLoading || !game))) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                navigate("/calendar");
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">{isScrimmage ? 'Scrimmage Details' : 'Game Details'}</h1>
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

  // Early return with scrimmage-specific UI if viewing a scrimmage
  if (isScrimmage) {
    if (scrimmageLoading) {
      return (
        <div className="min-h-screen bg-background pb-20">
          <div className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPageTransitionDirection('down');
                  navigate("/calendar");
                }}
                className="p-2"
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-xl font-semibold">Scrimmage Details</h1>
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

    if (!scrimmageData) {
      return (
        <div className="min-h-screen bg-background pb-20">
          <div className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPageTransitionDirection('down');
                  navigate("/calendar");
                }}
                className="p-2"
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-xl font-semibold">Scrimmage Details</h1>
            </div>
          </div>
          <div className="px-6 py-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <p className="text-center text-muted-foreground">Scrimmage not found</p>
            </div>
          </div>
        </div>
      );
    }

    const { scrimmage, approvedPlayers } = scrimmageData as any;
    
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                navigate("/calendar");
              }}
              className="p-2"
              data-testid="button-back-scrimmage"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Scrimmage Details</h1>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Scrimmage Info */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <Trophy className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold" data-testid="text-scrimmage-title">
                  {scrimmage.title}
                </h2>
                <p className="text-sm text-muted-foreground" data-testid="text-scrimmage-date">
                  {format(new Date(scrimmage.dateTime), 'EEEE, MMMM d • h:mm a')}
                </p>
              </div>
            </div>

            {scrimmage.location && (
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-scrimmage-location">
                  {scrimmage.location}
                </p>
              </div>
            )}

            {scrimmage.notes && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm" data-testid="text-scrimmage-notes">
                  {scrimmage.notes}
                </p>
              </div>
            )}
          </div>

          {/* Approved Players */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">
                Confirmed Players ({approvedPlayers.length}/{scrimmage.maxPlayers})
              </h3>
            </div>

            {approvedPlayers.length > 0 ? (
              <div className="space-y-2">
                {approvedPlayers.map((request: any) => (
                  <div 
                    key={request.id} 
                    className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-white text-black border"
                    data-testid={`player-${request.player?.id || 'unknown'}`}
                  >
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-black text-xs font-semibold">
                        {request.player?.firstName?.[0] || '?'}{request.player?.lastName?.[0] || ''}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-black" data-testid={`text-player-name-${request.player?.id || 'unknown'}`}>
                        {request.player?.firstName || 'Unknown'} {request.player?.lastName || 'Player'}
                      </p>
                    </div>
                    <div className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                      ✓ Confirmed
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No players confirmed yet
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Return error if not loading and no game data (invalid route)
  if (!gameLoading && !game) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                navigate("/calendar");
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Game Details</h1>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-center text-muted-foreground">Game not found</p>
          </div>
        </div>
      </div>
    );
  }

  // At this point, we know game is defined for non-scrimmage cases
  // TypeScript type guard to ensure game is defined
  if (!game) {
    throw new Error("Game should be defined at this point in the component flow");
  }

  // Find which of user's teams is playing in this game
  const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team) => team.id) : [];
  
  // Debug logging for team detection (temporary)
  console.log('GameDetails Team Debug:', {
    userTeams,
    userTeamsIsArray: Array.isArray(userTeams),
    userTeamsLength: userTeams?.length,
    userTeamIds,
    homeTeamId: game.homeTeam?.id,
    awayTeamId: game.awayTeam?.id,
    homeTeamIncluded: userTeamIds.includes(game.homeTeam?.id),
    awayTeamIncluded: userTeamIds.includes(game.awayTeam?.id)
  });
  
  const userTeam = userTeamIds.includes(game.homeTeam?.id) ? game.homeTeam : 
                   userTeamIds.includes(game.awayTeam?.id) ? game.awayTeam : null;
  const opponentTeam = userTeam?.id === game.homeTeam?.id ? game.awayTeam : game.homeTeam;
  
  // Separate beverage duty logic for each team
  const isUserOnHomeTeam = userTeam?.id === game.homeTeam?.id;
  const isUserOnAwayTeam = userTeam?.id === game.awayTeam?.id;
  
  // Home team beverage duty state
  const homeTeamHasBeverageDuty = game.homeBeverageDutyUserId === (user as User)?.id;
  const homeTeamBeverageDutyClaimed = !!game.homeBeverageDutyUserId;
  const homeTeamBeverageDutyClaimedByOther = homeTeamBeverageDutyClaimed && !homeTeamHasBeverageDuty;
  
  // Away team beverage duty state  
  const awayTeamHasBeverageDuty = game.awayBeverageDutyUserId === (user as User)?.id;
  const awayTeamBeverageDutyClaimed = !!game.awayBeverageDutyUserId;
  const awayTeamBeverageDutyClaimedByOther = awayTeamBeverageDutyClaimed && !awayTeamHasBeverageDuty;

  // Score submission logic
  const gameStartTime = new Date(game.scheduledAt).getTime();
  const oneHourAfterStart = gameStartTime + (60 * 60 * 1000); // 1 hour in milliseconds
  const now = Date.now();
  const isScoreSubmissionAvailable = now >= oneHourAfterStart;

  // Check if user is a captain or commissioner using team.captainId
  const isHomeCaptain = game.homeTeam?.captainId === (user as User)?.id;
  const isAwayCaptain = game.awayTeam?.captainId === (user as User)?.id;
  const isCaptain = isHomeCaptain || isAwayCaptain;
  
  // Derive captain team ID directly from captain status for RSVPSummary
  const captainTeamId = isHomeCaptain ? game.homeTeam?.id : isAwayCaptain ? game.awayTeam?.id : undefined;
  
  // Check if user is commissioner
  const isCommissioner = league?.commissionerId === (user as User)?.id;
  
  // Debug logging (temporary)
  console.log('UserTeam Assignment Debug:', {
    userTeam,
    userTeamId: userTeam?.id,
    gameHomeTeam: game.homeTeam,
    gameAwayTeam: game.awayTeam,
    isCommissioner,
    shouldShowRSVP: !!(userTeam || isCommissioner)
  });
  
  // Check if game is in the future for RSVP purposes
  const isUpcomingGame = new Date(game.scheduledAt) > new Date();
  
  const canSubmitScore = (isCaptain || isCommissioner) && isScoreSubmissionAvailable;

  // Check if game is already completed
  const isGameCompleted = game.isCompleted || (game.homeScore !== null && game.awayScore !== null);

  // Get existing submissions for display
  const userSubmissions = Array.isArray(scoreSubmissions) 
    ? scoreSubmissions.filter((submission) => submission.submittedBy === (user as User)?.id)
    : [];
  const latestUserSubmission = userSubmissions.length > 0 ? userSubmissions[userSubmissions.length - 1] : null;
  
  // Home team claimant logic
  const homeTeamClaimantId = game.homeBeverageDutyUserId;
  const homeTeamClaimantExists = homeTeamClaimantId ? (homeTeamMembers || []).some((member) => member.user?.id === homeTeamClaimantId) : false;
  const homeTeamClaimant = homeTeamClaimantId ? (homeTeamMembers || []).find((member) => member.user?.id === homeTeamClaimantId) : null;
  const homeTeamClaimantName = homeTeamClaimant?.user ? `${homeTeamClaimant.user.firstName} ${homeTeamClaimant.user.lastName}` : 'A teammate';
  const validHomeTeamBeverageDutyClaimed = homeTeamBeverageDutyClaimed && (homeTeamClaimantExists || homeTeamHasBeverageDuty);
  const validHomeTeamBeverageDutyClaimedByOther = validHomeTeamBeverageDutyClaimed && !homeTeamHasBeverageDuty;
  
  // Away team claimant logic
  const awayTeamClaimantId = game.awayBeverageDutyUserId;
  const awayTeamClaimantExists = awayTeamClaimantId ? (awayTeamMembers || []).some((member) => member.user?.id === awayTeamClaimantId) : false;
  const awayTeamClaimant = awayTeamClaimantId ? (awayTeamMembers || []).find((member) => member.user?.id === awayTeamClaimantId) : null;
  const awayTeamClaimantName = awayTeamClaimant?.user ? `${awayTeamClaimant.user.firstName} ${awayTeamClaimant.user.lastName}` : 'A teammate';
  const validAwayTeamBeverageDutyClaimed = awayTeamBeverageDutyClaimed && (awayTeamClaimantExists || awayTeamHasBeverageDuty);
  const validAwayTeamBeverageDutyClaimedByOther = validAwayTeamBeverageDutyClaimed && !awayTeamHasBeverageDuty;

  // Check if user can delete the game (captain of home team or commissioner)
  const canDeleteGame = isHomeCaptain || isCommissioner;

  const handleDeleteGame = () => {
    if (window.confirm('Are you sure you want to delete this game? This action cannot be undone.')) {
      deleteGameMutation.mutate(game.id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                navigate("/calendar");
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold" data-testid="text-game-details-title">
              Game Details
            </h1>
          </div>
          {canDeleteGame && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteGame}
              className="p-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={deleteGameMutation.isPending}
              data-testid="button-delete-game"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      {/* Game Info */}
      <div className="px-6 py-6 space-y-6 pt-[4px] pb-[4px] pl-[12px] pr-[12px]">
        <div className="bg-card rounded-xl border border-border p-6 pt-[2px] pb-[2px] pl-[5px] pr-[5px]">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
              {opponentTeam?.logoUrl ? (
                <img 
                  src={opponentTeam.logoUrl} 
                  alt={`${opponentTeam.name} logo`}
                  className="w-full h-full rounded-lg object-cover"
                  data-testid="img-opponent-logo"
                />
              ) : (
                <Trophy className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold" data-testid="text-game-matchup">
                vs {opponentTeam?.name}
              </h2>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Clock className="w-4 h-4" />
                <span data-testid="text-game-time">
                  {format(new Date(game.scheduledAt), 'EEEE, MMM d • h:mm a')}
                </span>
              </div>
              {game.venue && (
                <div className="flex items-center gap-2 text-muted-foreground mt-1">
                  <MapPin className="w-4 h-4" />
                  <span data-testid="text-game-venue">{game.venue}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Beverage Responsibility - Away Team */}
        {isUserOnAwayTeam && !isGameCompleted && (
          <div className="rounded-xl border border-border p-6 pl-[8px] pr-[8px] pt-[8px] pb-[8px] mt-[8px] mb-[8px] ml-[0px] mr-[0px] bg-[#212121] text-[#ffffff]">
              {awayTeamHasBeverageDuty ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary w-10 h-10 rounded-lg flex items-center justify-center">
                      <img 
                        src={beverageJarUrl}
                        alt="Beverage Duty"
                        className="h-6 w-auto"
                        style={{ aspectRatio: '9/16' }}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-primary text-[16px]" data-testid="text-beverage-assigned">{(user as User)?.firstName} {(user as User)?.lastName} has beverage duty</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (game.awayTeam) {
                        releaseBeverageDutyMutation.mutate({ gameId: game.id, teamId: game.awayTeam.id });
                      }
                    }}
                    disabled={releaseBeverageDutyMutation.isPending}
                    data-testid="button-release-beverage-duty"
                  >
                    Release Duty
                  </Button>
                </div>
              ) : validAwayTeamBeverageDutyClaimedByOther ? (
                <div className="flex items-center gap-3">
                  <div className="bg-muted w-10 h-10 rounded-lg flex items-center justify-center">
                    <img 
                      src={beverageJarUrl}
                      alt="Beverage Duty"
                      className="h-6 w-auto opacity-50"
                      style={{ aspectRatio: '9/16' }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground" data-testid="text-beverage-claimed">{awayTeamClaimantName} has beverage duty</p>
                    <p className="text-sm text-muted-foreground">{awayTeamClaimantName} is bringing beverages</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted w-10 h-10 rounded-lg flex items-center justify-center">
                      <img 
                        src={beverageJarUrl}
                        alt="Beverage Duty"
                        className="h-6 w-auto opacity-50"
                        style={{ aspectRatio: '9/16' }}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-[#ffffff]" data-testid="text-beverage-available">Beverage Duty Available</p>
                    </div>
                  </div>
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      if (game.awayTeam) {
                        claimBeverageDutyMutation.mutate({ gameId: game.id, teamId: game.awayTeam.id });
                      }
                    }}
                    disabled={claimBeverageDutyMutation.isPending}
                    data-testid="button-claim-beverage-duty"
                  >
                    <img 
                      src={beverageJarUrl}
                      alt="Claim Beverage Duty"
                      className="h-4 w-auto mr-2"
                      style={{ aspectRatio: '9/16' }}
                    />
                    Claim Responsibility
                  </Button>
                </div>
              )}
          </div>
        )}

        {/* RSVP Section */}
        {!isGameCompleted && (
          <div className="rounded-xl border border-border p-6 mt-[0px] mb-[0px] pt-[2px] pb-[2px] bg-[#212121] text-[#ffffff]">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              RSVP & Attendance
            </h3>
            
            <div className="space-y-4">
              {/* Player RSVP Buttons */}
              {user && userTeam && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Your Response:</p>
                  <RSVPButtons 
                    gameId={game.id} 
                    userId={(user as User).id}
                    userTeamId={userTeam.id}
                  />
                </div>
              )}
              
              {/* Team Attendance Summary - Show for all users with a team or commissioners */}
              {(userTeam || isCommissioner) && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Team Attendance:</p>
                  <RSVPSummary 
                    gameId={game.id}
                    teamId={userTeam?.id}
                    showTeamSeparation={isCommissioner && !userTeam}
                    onViewDetails={() => setShowRSVPModal(true)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Beverage Responsibility - Only show for user's team */}
        {isUserOnHomeTeam && !isGameCompleted && (
          <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4" data-testid="text-beverage-title">
                Beverage Responsibility
              </h3>
              
              {homeTeamHasBeverageDuty ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary w-10 h-10 rounded-lg flex items-center justify-center">
                      <img 
                        src={beverageJarUrl}
                        alt="Beverage Duty"
                        className="h-6 w-auto"
                        style={{ aspectRatio: '9/16' }}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-primary" data-testid="text-beverage-assigned">{(user as User)?.firstName} {(user as User)?.lastName} has beverage duty</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (game.homeTeam) {
                        releaseBeverageDutyMutation.mutate({ gameId: game.id, teamId: game.homeTeam.id });
                      }
                    }}
                    disabled={releaseBeverageDutyMutation.isPending}
                    data-testid="button-release-beverage-duty"
                  >
                    Release Duty
                  </Button>
                </div>
              ) : validHomeTeamBeverageDutyClaimedByOther ? (
                <div className="flex items-center gap-3">
                  <div className="bg-muted w-10 h-10 rounded-lg flex items-center justify-center">
                    <img 
                      src={beverageJarUrl}
                      alt="Beverage Duty"
                      className="h-6 w-auto opacity-50"
                      style={{ aspectRatio: '9/16' }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground" data-testid="text-beverage-claimed">{homeTeamClaimantName} has beverage duty</p>
                    <p className="text-sm text-muted-foreground">{homeTeamClaimantName} is bringing beverages</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted w-10 h-10 rounded-lg flex items-center justify-center">
                      <img 
                        src={beverageJarUrl}
                        alt="Beverage Duty"
                        className="h-6 w-auto opacity-50"
                        style={{ aspectRatio: '9/16' }}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground" data-testid="text-beverage-available">Beverage Duty Available</p>
                    </div>
                  </div>
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      if (game.homeTeam) {
                        claimBeverageDutyMutation.mutate({ gameId: game.id, teamId: game.homeTeam.id });
                      }
                    }}
                    disabled={claimBeverageDutyMutation.isPending}
                    data-testid="button-claim-beverage-duty"
                  >
                    <img 
                      src={beverageJarUrl}
                      alt="Claim Beverage Duty"
                      className="h-4 w-auto mr-2"
                      style={{ aspectRatio: '9/16' }}
                    />
                    Claim Responsibility
                  </Button>
                </div>
              )}
          </div>
        )}

        {/* Substitute Requests Dashboard for Commissioners */}
        {isCommissioner && (
          <div className="rounded-xl border border-border p-6 pt-[8px] pb-[8px] mt-[8px] mb-[8px] text-[#ffffff] bg-[#212121]">
            <h3 className="text-lg font-semibold mb-4">Substitute Requests for This Game</h3>
            <SubstituteRequestsDashboard gameId={game.id} />
          </div>
        )}

        {/* Score Submission */}
        {(canSubmitScore || isGameCompleted) && (
          <div className="bg-card rounded-xl border border-border p-6 mt-[4px] mb-[4px] pt-[4px] pb-[4px] pl-[4px] pr-[4px]">
            <h3 className="text-lg font-semibold mb-4" data-testid="text-score-title">
              <Target className="w-5 h-5 inline mr-2" />
              Game Score
            </h3>
            
            {isGameCompleted ? (
              <div className="space-y-4">
                {/* Score Management Section for Commissioners */}
                {isCommissioner && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 pt-[4px] pb-[4px] pl-[4px] pr-[4px]">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-5 h-5 text-blue-600" />
                      <h4 className="text-lg font-semibold text-blue-600">Score Management</h4>
                    </div>
                    
                    {isEditingScore ? (
                      <div className="space-y-4">
                        <div className="text-center text-sm text-blue-600 font-medium mb-3">
                          Final Score:
                        </div>
                        <div className="grid grid-cols-3 gap-3 items-center">
                          <div className="text-center">
                            <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                              {game.homeTeam?.name}
                            </label>
                            <Input
                              type="number"
                              min="0"
                              value={editHomeScore}
                              onChange={(e) => setEditHomeScore(e.target.value)}
                              className="text-center text-2xl font-bold"
                              placeholder="0"
                              data-testid="input-edit-final-home-score"
                            />
                          </div>
                          <div className="text-center text-2xl font-bold text-muted-foreground">
                            -
                          </div>
                          <div className="text-center">
                            <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                              {game.awayTeam?.name}
                            </label>
                            <Input
                              type="number"
                              min="0"
                              value={editAwayScore}
                              onChange={(e) => setEditAwayScore(e.target.value)}
                              className="text-center text-2xl font-bold"
                              placeholder="0"
                              data-testid="input-edit-final-away-score"
                            />
                          </div>
                        </div>
                        <div className="flex gap-3 mt-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsEditingScore(false);
                              setEditHomeScore("");
                              setEditAwayScore("");
                            }}
                            className="flex-1"
                            data-testid="button-cancel-score-edit"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              const home = parseInt(editHomeScore);
                              const away = parseInt(editAwayScore);
                              
                              if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
                                toast({
                                  title: "Invalid Score",
                                  description: "Please enter valid scores (numbers only).",
                                  variant: "destructive",
                                });
                                return;
                              }
                              
                              submitScoreMutation.mutate(
                                { gameId: game.id, homeScore: home, awayScore: away },
                                {
                                  onSuccess: () => {
                                    setIsEditingScore(false);
                                    setEditHomeScore("");
                                    setEditAwayScore("");
                                  }
                                }
                              );
                            }}
                            disabled={submitScoreMutation.isPending || !editHomeScore || !editAwayScore}
                            className="flex-1"
                            data-testid="button-save-score-changes"
                          >
                            {submitScoreMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-center text-sm text-blue-600 font-medium">
                          Final Score:
                        </div>
                        <div className="flex items-center justify-center space-x-4">
                          <div className="text-center">
                            <p className="text-sm text-blue-700 dark:text-blue-300">{game.homeTeam?.name}</p>
                            <p className="text-3xl font-bold text-blue-600">
                              {game.homeScore}
                            </p>
                          </div>
                          <div className="text-2xl font-bold text-blue-600">-</div>
                          <div className="text-center">
                            <p className="text-sm text-blue-700 dark:text-blue-300">{game.awayTeam?.name}</p>
                            <p className="text-3xl font-bold text-blue-600">
                              {game.awayScore}
                            </p>
                          </div>
                        </div>
                        <div className="text-center">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsEditingScore(true);
                              setEditHomeScore(game.homeScore?.toString() || "");
                              setEditAwayScore(game.awayScore?.toString() || "");
                            }}
                            className="flex items-center gap-2"
                            data-testid="button-edit-final-score"
                          >
                            <Target className="w-4 h-4" />
                            Edit Score
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                
              </div>
            ) : canSubmitScore ? (
              <div className="space-y-4">
                {latestUserSubmission && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-600 mb-2">Your Last Submission:</p>
                    <div className="flex items-center justify-center space-x-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">{game.homeTeam?.name}</p>
                        <p className="text-2xl font-bold">{latestUserSubmission.homeScore}</p>
                      </div>
                      <div className="text-xl font-bold text-muted-foreground">-</div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">{game.awayTeam?.name}</p>
                        <p className="text-2xl font-bold">{latestUserSubmission.awayScore}</p>
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 text-center mt-2">
                      Submitted {format(new Date(latestUserSubmission.submittedAt), 'MMM d, h:mm a')}
                      {latestUserSubmission.submitterRole === 'commissioner' && ' (Commissioner Override)'}
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="homeScore" className="text-sm font-medium">
                      {game.homeTeam?.name} Score
                    </Label>
                    <Input
                      id="homeScore"
                      type="number"
                      min="0"
                      value={homeScore}
                      onChange={(e) => setHomeScore(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                      data-testid="input-home-score"
                    />
                  </div>
                  <div>
                    <Label htmlFor="awayScore" className="text-sm font-medium">
                      {game.awayTeam?.name} Score
                    </Label>
                    <Input
                      id="awayScore"
                      type="number"
                      min="0"
                      value={awayScore}
                      onChange={(e) => setAwayScore(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                      data-testid="input-away-score"
                    />
                  </div>
                </div>
                
                <Button
                  onClick={() => {
                    const home = parseInt(homeScore);
                    const away = parseInt(awayScore);
                    if (!isNaN(home) && !isNaN(away) && home >= 0 && away >= 0) {
                      submitScoreMutation.mutate({ gameId: game.id, homeScore: home, awayScore: away });
                    }
                  }}
                  disabled={
                    submitScoreMutation.isPending || 
                    !homeScore.trim() || 
                    !awayScore.trim() ||
                    isNaN(parseInt(homeScore)) ||
                    isNaN(parseInt(awayScore))
                  }
                  className="w-full"
                  data-testid="button-submit-score"
                >
                  {submitScoreMutation.isPending ? "Submitting..." : 
                   isCommissioner ? "Submit Score (Commissioner)" : "Submit Score (Captain)"}
                </Button>
                
                {!isScoreSubmissionAvailable && (
                  <p className="text-sm text-muted-foreground text-center">
                    Score submission will be available 1 hour after game start ({format(new Date(oneHourAfterStart), 'h:mm a')})
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground">
                  Only team captains and commissioners can submit scores
                </p>
              </div>
            )}
          </div>
        )}

        {/* Game Stars Section */}
        {!isScrimmage && isGameCompleted && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-4" data-testid="text-stars-title">
              <Star className="w-5 h-5 inline mr-2 text-yellow-500" />
              Three Stars of the Game
            </h3>
            
            {gameStars ? (
              <div className="space-y-3">
                <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center gap-3">
                  <Star className="w-8 h-8 text-yellow-500 fill-yellow-500" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">1st Star (3 points)</p>
                    <p className="font-bold" data-testid="text-first-star">
                      {gameStars.firstStar?.firstName} {gameStars.firstStar?.lastName}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-4 flex items-center gap-3">
                  <Star className="w-7 h-7 text-gray-400 fill-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">2nd Star (2 points)</p>
                    <p className="font-bold" data-testid="text-second-star">
                      {gameStars.secondStar?.firstName} {gameStars.secondStar?.lastName}
                    </p>
                  </div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
                  <Star className="w-6 h-6 text-amber-600 fill-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">3rd Star (1 point)</p>
                    <p className="font-bold" data-testid="text-third-star">
                      {gameStars.thirdStar?.firstName} {gameStars.thirdStar?.lastName}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Awarded by {gameStars.awarder?.firstName} {gameStars.awarder?.lastName}
                </p>
              </div>
            ) : (
              <>
                {(() => {
                  if (!game.homeScore || !game.awayScore || game.homeScore === game.awayScore) {
                    return (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">
                          Stars can be awarded once the game has a winner
                        </p>
                      </div>
                    );
                  }
                  
                  const winningTeamId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
                  const isWinningCaptain = (winningTeamId === game.homeTeamId && game.homeTeam?.captainId === user?.id) ||
                                           (winningTeamId === game.awayTeamId && game.awayTeam?.captainId === user?.id);
                  
                  if (!isWinningCaptain) {
                    return (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">
                          Only the winning team captain can award the three stars
                        </p>
                      </div>
                    );
                  }
                  
                  // Get all players from both teams
                  const allPlayers = [
                    ...(homeTeamMembers || []),
                    ...(awayTeamMembers || [])
                  ].filter((member, index, self) => 
                    self.findIndex(m => m.user.id === member.user.id) === index
                  );
                  
                  return (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground mb-3">
                        As the winning captain, select the three stars of the game:
                      </p>
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="firstStar" className="text-sm font-medium flex items-center gap-2 mb-1">
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            1st Star (3 points)
                          </Label>
                          <Select value={firstStarUserId} onValueChange={setFirstStarUserId}>
                            <SelectTrigger id="firstStar" data-testid="select-first-star">
                              <SelectValue placeholder="Select player" />
                            </SelectTrigger>
                            <SelectContent>
                              {allPlayers.map((member) => (
                                <SelectItem key={member.user.id} value={member.user.id}>
                                  {member.user.firstName} {member.user.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="secondStar" className="text-sm font-medium flex items-center gap-2 mb-1">
                            <Star className="w-4 h-4 text-gray-400 fill-gray-400" />
                            2nd Star (2 points)
                          </Label>
                          <Select value={secondStarUserId} onValueChange={setSecondStarUserId}>
                            <SelectTrigger id="secondStar" data-testid="select-second-star">
                              <SelectValue placeholder="Select player" />
                            </SelectTrigger>
                            <SelectContent>
                              {allPlayers.map((member) => (
                                <SelectItem key={member.user.id} value={member.user.id}>
                                  {member.user.firstName} {member.user.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="thirdStar" className="text-sm font-medium flex items-center gap-2 mb-1">
                            <Star className="w-4 h-4 text-amber-600 fill-amber-600" />
                            3rd Star (1 point)
                          </Label>
                          <Select value={thirdStarUserId} onValueChange={setThirdStarUserId}>
                            <SelectTrigger id="thirdStar" data-testid="select-third-star">
                              <SelectValue placeholder="Select player" />
                            </SelectTrigger>
                            <SelectContent>
                              {allPlayers.map((member) => (
                                <SelectItem key={member.user.id} value={member.user.id}>
                                  {member.user.firstName} {member.user.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          if (firstStarUserId && secondStarUserId && thirdStarUserId) {
                            submitStarsMutation.mutate({ 
                              gameId: game.id, 
                              firstStarUserId, 
                              secondStarUserId, 
                              thirdStarUserId 
                            });
                          }
                        }}
                        disabled={
                          submitStarsMutation.isPending || 
                          !firstStarUserId || 
                          !secondStarUserId || 
                          !thirdStarUserId
                        }
                        className="w-full"
                        data-testid="button-submit-stars"
                      >
                        {submitStarsMutation.isPending ? "Submitting..." : "Award Three Stars"}
                      </Button>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
      {/* RSVP Detail Modal */}
      <RSVPDetailModal
        gameId={game.id}
        isOpen={showRSVPModal}
        onClose={() => setShowRSVPModal(false)}
        onRequestSubstitute={(playerId, playerName, teamId) => {
          setSubstituteRequestData({ playerId, playerName, teamId });
          setShowRSVPModal(false);
          setShowSubstituteModal(true);
        }}
        showSubstituteButtons={isCaptain}
        teamId={userTeam?.id}
      />
      {/* Substitute Request Modal */}
      {substituteRequestData && game && substituteRequestData.teamId && (
        <SubstituteRequestModal
          gameId={game.id}
          gameDate={format(new Date(game.scheduledAt), 'yyyy-MM-dd')}
          leagueId={game.leagueId}
          originalPlayerId={substituteRequestData.playerId}
          originalPlayerName={substituteRequestData.playerName}
          homeTeamId={game.homeTeamId}
          awayTeamId={game.awayTeamId}
          originalPlayerTeamId={substituteRequestData.teamId}
          isOpen={showSubstituteModal}
          onClose={() => {
            setShowSubstituteModal(false);
            setSubstituteRequestData(null);
          }}
        />
      )}
    </div>
  );
}