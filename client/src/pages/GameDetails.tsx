import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Trophy, Check, X, ArrowLeft, MapPin, Clock, MessageSquare, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useRoute } from "wouter";
import { useState } from "react";
import * as React from "react";
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';

export default function GameDetails() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/game/:id");
  const gameId = params?.id;

  const [notes, setNotes] = useState("");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");

  // Fetch user's teams
  const { data: userTeams } = useQuery({
    queryKey: ["/api/user/teams"],
  });

  // Get primary team (first team for now)
  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  // Fetch specific game details
  const { data: game, isLoading: gameLoading } = useQuery({
    queryKey: [`/api/games/${gameId}`],
    enabled: !!gameId,
  });


  // Fetch team members to get names for beverage duty
  const { data: homeTeamMembers } = useQuery({
    queryKey: [`/api/teams/${game?.homeTeam?.id}/members`],
    enabled: !!game?.homeTeam?.id,
  });

  const { data: awayTeamMembers } = useQuery({
    queryKey: [`/api/teams/${game?.awayTeam?.id}/members`],
    enabled: !!game?.awayTeam?.id,
  });


  // Fetch score submissions
  const { data: scoreSubmissions } = useQuery({
    queryKey: [`/api/games/${gameId}/score-submissions`],
    enabled: !!gameId,
  });

  // Fetch league details for commissioner check
  const { data: league } = useQuery({
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

  // Save notes mutation
  const saveNotesMutation = useMutation({
    mutationFn: async ({ gameId, teamId, notes }: { gameId: string; teamId: string; notes: string }) => {
      await apiRequest("POST", `/api/games/${gameId}/notes`, { teamId, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
      toast({
        title: "Notes Saved",
        description: "Your notes have been saved for the captain to see.",
      });
      // Don't clear notes after saving - keep them visible
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save notes. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Submit score mutation
  const submitScoreMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      return await apiRequest("POST", `/api/games/${gameId}/submit-score`, { homeScore, awayScore });
    },
    onSuccess: (data) => {
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

  if (gameLoading || !game) {
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
            <h1 className="text-xl font-semibold">Game Details</h1>
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

  // Find which of user's teams is playing in this game
  const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
  const userTeam = userTeamIds.includes(game.homeTeam?.id) ? game.homeTeam : 
                   userTeamIds.includes(game.awayTeam?.id) ? game.awayTeam : null;
  const opponentTeam = userTeam?.id === game.homeTeam?.id ? game.awayTeam : game.homeTeam;
  const hasBeverageDuty = game.homeBeverageDutyUserId === (user as any)?.id || game.awayBeverageDutyUserId === (user as any)?.id;
  const beverageDutyClaimed = !!(game.homeBeverageDutyUserId || game.awayBeverageDutyUserId);
  const beverageDutyClaimedByOther = beverageDutyClaimed && !hasBeverageDuty;

  // Score submission logic
  const gameStartTime = new Date(game.scheduledAt).getTime();
  const oneHourAfterStart = gameStartTime + (60 * 60 * 1000); // 1 hour in milliseconds
  const now = Date.now();
  const isScoreSubmissionAvailable = now >= oneHourAfterStart;

  // Check if user is a captain or commissioner
  const isHomeCaptain = homeTeamMembers?.some((member: any) => member.userId === (user as any)?.id && member.isCaptain);
  const isAwayCaptain = awayTeamMembers?.some((member: any) => member.userId === (user as any)?.id && member.isCaptain);
  const isCaptain = isHomeCaptain || isAwayCaptain;
  
  // Check if user is commissioner
  const isCommissioner = league?.commissionerId === (user as any)?.id;
  
  const canSubmitScore = (isCaptain || isCommissioner) && isScoreSubmissionAvailable;

  // Check if game is already completed
  const isGameCompleted = game.isCompleted || (game.homeScore !== null && game.awayScore !== null);

  // Get existing submissions for display
  const userSubmissions = Array.isArray(scoreSubmissions) 
    ? scoreSubmissions.filter((submission: any) => submission.submittedBy === (user as any)?.id)
    : [];
  const latestUserSubmission = userSubmissions.length > 0 ? userSubmissions[userSubmissions.length - 1] : null;
  
  // Check if the claimed user actually exists in team members
  const allTeamMembers = [...(homeTeamMembers || []), ...(awayTeamMembers || [])];
  const beverageDutyClaimantId = game.homeBeverageDutyUserId || game.awayBeverageDutyUserId;
  const claimantExists = beverageDutyClaimantId ? allTeamMembers.some((member: any) => member.user?.id === beverageDutyClaimantId) : false;
  
  // If duty is claimed but claimant doesn't exist in team members, treat as unclaimed
  const validBeverageDutyClaimed = beverageDutyClaimed && (claimantExists || beverageDutyClaimantId === (user as any)?.id);
  const validBeverageDutyClaimedByOther = validBeverageDutyClaimed && !hasBeverageDuty;


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
      </div>

      {/* Game Info */}
      <div className="px-6 py-6 space-y-6">
        <div className="bg-card rounded-xl border border-border p-6">
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


        {/* Beverage Responsibility */}
        <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-4" data-testid="text-beverage-title">Beverage Responsibility</h3>
            
            {hasBeverageDuty ? (
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
                    <p className="font-medium text-primary" data-testid="text-beverage-assigned">You Have Beverage Duty</p>
                    <p className="text-sm text-muted-foreground">You're responsible for bringing beverages</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (userTeam) {
                      releaseBeverageDutyMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                    }
                  }}
                  disabled={releaseBeverageDutyMutation.isPending}
                  data-testid="button-release-beverage-duty"
                >
                  Release Duty
                </Button>
              </div>
            ) : validBeverageDutyClaimedByOther ? (
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
                  <p className="font-medium text-muted-foreground" data-testid="text-beverage-claimed">Beverage Duty Claimed by Teammate</p>
                  <p className="text-sm text-muted-foreground">A teammate is bringing beverages</p>
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
                    <p className="text-sm text-muted-foreground">No one has claimed beverage responsibility yet</p>
                  </div>
                </div>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    if (userTeam) {
                      claimBeverageDutyMutation.mutate({ gameId: game.id, teamId: userTeam.id });
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

        {/* Notes for Captain */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-4" data-testid="text-notes-title">
            <MessageSquare className="w-5 h-5 inline mr-2" />
            Notes for Captain
          </h3>
          <div className="space-y-4">
            <Textarea
              placeholder="Add any notes or messages for your team captain (injuries, late arrival, equipment needs, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px]"
              data-testid="textarea-notes"
            />
            <Button
              onClick={() => {
                if (userTeam && primaryTeam) {
                  saveNotesMutation.mutate({ gameId: game.id, teamId: userTeam.id, notes });
                }
              }}
              disabled={saveNotesMutation.isPending || !notes.trim()}
              data-testid="button-save-notes"
            >
              Save Notes
            </Button>
          </div>
        </div>

        {/* Score Submission */}
        {(canSubmitScore || isGameCompleted) && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-4" data-testid="text-score-title">
              <Target className="w-5 h-5 inline mr-2" />
              Game Score
            </h3>
            
            {isGameCompleted ? (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center justify-center space-x-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">{game.homeTeam?.name}</p>
                    <p className="text-3xl font-bold text-green-600" data-testid="text-final-home-score">
                      {game.homeScore}
                    </p>
                  </div>
                  <div className="text-2xl font-bold text-muted-foreground">-</div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">{game.awayTeam?.name}</p>
                    <p className="text-3xl font-bold text-green-600" data-testid="text-final-away-score">
                      {game.awayScore}
                    </p>
                  </div>
                </div>
                <p className="text-center text-sm text-green-600 mt-2 font-medium">
                  Game Complete
                </p>
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
      </div>
    </div>
  );
}