import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Trophy, Check, X, ArrowLeft, MapPin, Clock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useRoute } from "wouter";
import { useState } from "react";
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';

export default function GameDetails() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/game/:id");
  const gameId = params?.id;

  const [notes, setNotes] = useState("");

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

  // Fetch user attendance statuses
  const { data: userAttendanceStatuses } = useQuery({
    queryKey: ["/api/user/attendance-statuses"],
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

  // Get current attendance status for this game
  const currentStatus = Array.isArray(userAttendanceStatuses) ? 
    userAttendanceStatuses.find((status: any) => status.gameId === gameId)?.status : null;

  // Check in mutation
  const checkInMutation = useMutation({
    mutationFn: async ({ gameId, teamId }: { gameId: string; teamId: string }) => {
      await apiRequest("POST", `/api/games/${gameId}/check-in`, { teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/attendance-statuses"] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
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
      await apiRequest("POST", `/api/games/${gameId}/check-out`, { teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/attendance-statuses"] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
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

  if (gameLoading || !game) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/calendar")}
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

  const opponentTeam = game.homeTeam?.id === primaryTeam?.id ? game.awayTeam : game.homeTeam;
  const userTeam = game.homeTeam?.id === primaryTeam?.id ? game.homeTeam : game.awayTeam;
  const hasBeverageDuty = game.homeBeverageDutyUserId === (user as any)?.id || game.awayBeverageDutyUserId === (user as any)?.id;
  const beverageDutyClaimed = !!(game.homeBeverageDutyUserId || game.awayBeverageDutyUserId);
  const beverageDutyClaimedByOther = beverageDutyClaimed && !hasBeverageDuty;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/calendar")}
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

        {/* Attendance Status */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-4" data-testid="text-attendance-title">Attendance Status</h3>
          
          {currentStatus ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentStatus === 'checked_in' ? (
                  <>
                    <div className="bg-green-500/50 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                      <Check className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-green-600" data-testid="text-status-checked-in">Checked In</p>
                      <p className="text-sm text-muted-foreground">You're attending this game</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-red-500/50 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                      <X className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-red-600" data-testid="text-status-checked-out">Checked Out</p>
                      <p className="text-sm text-muted-foreground">You're not attending this game</p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="bg-green-500/50 text-white hover:bg-green-600/50 border-green-500/50"
                  onClick={() => {
                    if (userTeam && primaryTeam) {
                      checkInMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                    }
                  }}
                  disabled={checkInMutation.isPending || currentStatus === 'checked_in'}
                  data-testid="button-check-in"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Check In
                </Button>
                <Button
                  variant="outline"
                  className="bg-red-500/50 text-white hover:bg-red-600/50 border-red-500/50"
                  onClick={() => {
                    if (userTeam && primaryTeam) {
                      checkOutMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                    }
                  }}
                  disabled={checkOutMutation.isPending || currentStatus === 'checked_out'}
                  data-testid="button-check-out"
                >
                  <X className="w-4 h-4 mr-2" />
                  Check Out
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-muted w-10 h-10 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-muted-foreground" data-testid="text-status-pending">Status Pending</p>
                  <p className="text-sm text-muted-foreground">Please confirm your attendance</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="bg-green-500/50 text-white hover:bg-green-600/50 border-green-500/50"
                  onClick={() => {
                    if (userTeam && primaryTeam) {
                      checkInMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                    }
                  }}
                  disabled={checkInMutation.isPending}
                  data-testid="button-check-in"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Check In
                </Button>
                <Button
                  variant="outline"
                  className="bg-red-500/50 text-white hover:bg-red-600/50 border-red-500/50"
                  onClick={() => {
                    if (userTeam && primaryTeam) {
                      checkOutMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                    }
                  }}
                  disabled={checkOutMutation.isPending}
                  data-testid="button-check-out"
                >
                  <X className="w-4 h-4 mr-2" />
                  Check Out
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Beverage Responsibility */}
        {currentStatus !== 'checked_out' && (
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
                    if (userTeam && primaryTeam) {
                      releaseBeverageDutyMutation.mutate({ gameId: game.id, teamId: userTeam.id });
                    }
                  }}
                  disabled={releaseBeverageDutyMutation.isPending}
                  data-testid="button-release-beverage-duty"
                >
                  Release Duty
                </Button>
              </div>
            ) : beverageDutyClaimedByOther ? (
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
                    if (userTeam && primaryTeam) {
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
        )}

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
      </div>
    </div>
  );
}