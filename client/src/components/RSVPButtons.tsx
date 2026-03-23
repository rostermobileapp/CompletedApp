import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, UserCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { setPageTransitionDirection } from "@/components/PageTransition";
import { SubstituteRequestDetailsModal } from "./SubstituteRequestDetailsModal";

interface Substitute {
  requestId: string;
  substitutePlayer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
  originalPlayer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  };
  requestingTeamId: string;
  teamName: string;
}

interface RSVPButtonsProps {
  gameId: string;
  userId: string;
  userTeamId?: string;
  className?: string;
  onRequestSubstitute?: (playerId: string, playerName: string) => void;
  isCaptain?: boolean;
  isCommissioner?: boolean;
}

export function RSVPButtons({ gameId, userId, userTeamId, className, onRequestSubstitute, isCaptain, isCommissioner }: RSVPButtonsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [detailsModalPlayer, setDetailsModalPlayer] = useState<string | null>(null);

  if (!userTeamId) {
    return null;
  }

  const { data: currentRsvp } = useQuery<{ status?: string } | null>({
    queryKey: [`/api/games/${gameId}/rsvp?teamId=${userTeamId}`],
  });

  const { data: rsvpSummary } = useQuery<{ attending?: any[]; notAttending?: any[]; noResponse?: any[] } | null>({
    queryKey: [`/api/games/${gameId}/rsvp-summary?teamId=${userTeamId}`],
  });

  // Fetch approved substitutes for this game
  const { data: approvedSubstitutes = [] } = useQuery<Substitute[]>({
    queryKey: ['/api/games', gameId, 'substitutes'],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/games/${gameId}/substitutes`, {
        headers: authHeaders
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  // Filter substitutes for this specific team
  const teamSubstitutes = approvedSubstitutes.filter(sub => sub.requestingTeamId === userTeamId);

  // Get set of substitute player IDs to avoid duplicates in the regular attending list
  const substitutePlayerIds = new Set(teamSubstitutes.map(sub => sub.substitutePlayer.id));

  // Fetch existing substitute requests for this game
  const { data: existingRequests = [] } = useQuery({
    queryKey: ["/api/substitute-requests", gameId],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const response = await fetch("/api/substitute-requests", {
        headers: authHeaders
      });
      if (!response.ok) return [];
      const allRequests = await response.json();
      return allRequests.filter((req: any) => 
        req.gameId === gameId && 
        ['pending_opponent_approval', 'pending_commissioner_approval', 'pending_substitute_approval'].includes(req.status)
      );
    },
  });

  // Create a set of player IDs who already have pending substitute requests
  const playersWithPendingRequests = new Set(
    existingRequests.map((req: any) => req.originalPlayerId)
  );

  // Mutation to revoke a substitute
  const revokeSubMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiRequest("DELETE", `/api/games/${gameId}/substitutes/${requestId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'substitutes'] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/rsvp-summary?teamId=${userTeamId}`] });
      toast({
        title: "Substitute Removed",
        description: "The substitute player has been removed from this game.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove substitute. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rsvpMutation = useMutation({
    mutationFn: async (status: 'attending' | 'not_attending') => {
      await apiRequest("POST", `/api/games/${gameId}/rsvp`, { 
        status, 
        teamId: userTeamId 
      });
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/rsvp?teamId=${userTeamId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/rsvp-summary?teamId=${userTeamId}`] });
      toast({
        title: "RSVP Updated",
        description: status === 'attending' 
          ? "You're attending this game" 
          : "You're not attending this game",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update RSVP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const currentStatus = currentRsvp?.status || 'no_response';
  const isLoading = rsvpMutation.isPending;

  // Filter out substitute players from regular attending list to avoid duplicates
  const attendingPlayers = (rsvpSummary?.attending || []).filter(
    (rsvp: any) => !substitutePlayerIds.has(rsvp.user.id)
  );
  const notAttendingPlayers = rsvpSummary?.notAttending || [];

  const canManageSubstitutes = isCaptain || isCommissioner;

  const [, navigate] = useLocation();

  const handlePlayerClick = (playerId: string) => {
    setPageTransitionDirection('up');
    navigate(`/user/${playerId}`);
  };

  const formatPlayerName = (firstName?: string, lastName?: string) => {
    if (lastName && firstName) {
      return `${lastName}, ${firstName.charAt(0)}.`;
    }
    return lastName || firstName || 'Unknown';
  };

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)} data-testid="rsvp-buttons">
      {/* In Column */}
      <div className="flex flex-col">
        <Button
          variant={currentStatus === 'attending' ? "default" : "outline"}
          size="sm"
          onClick={() => rsvpMutation.mutate('attending')}
          disabled={isLoading}
          className={cn(
            "flex items-center justify-center gap-1 transition-all border-2 w-full text-xs px-2",
            currentStatus === 'attending' 
              ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-lg scale-105" 
              : "border-green-600 text-green-600 hover:bg-green-600 hover:text-white hover:shadow-md",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          data-testid="button-attending"
        >
          <Check className={cn(
            "h-3 w-3",
            currentStatus === 'attending' ? "animate-pulse" : ""
          )} />
          In ({attendingPlayers.length + teamSubstitutes.length})
        </Button>
        
        <div className="mt-2 space-y-1">
          {/* Display regular attending players */}
          {attendingPlayers.map((rsvp: any) => (
            <button
              key={rsvp.user.id}
              onClick={() => handlePlayerClick(rsvp.user.id)}
              className="flex items-center gap-2 p-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors w-full text-left cursor-pointer"
              data-testid={`player-attending-${rsvp.user.id}`}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={rsvp.user.profileImageUrl || undefined} alt={rsvp.user.firstName || 'User'} />
                <AvatarFallback className="text-xs">
                  {rsvp.user.firstName?.[0]}{rsvp.user.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium truncate text-zinc-900 dark:text-white">
                {formatPlayerName(rsvp.user.firstName, rsvp.user.lastName)}
              </span>
            </button>
          ))}
          
          {/* Display approved substitutes with Sub badge */}
          {teamSubstitutes.map((sub) => (
            <div
              key={sub.requestId}
              className="flex items-center gap-2 p-1.5 rounded-md bg-purple-100/60 border border-purple-400/40 dark:bg-purple-900/40 dark:border-purple-500/30 w-full"
              data-testid={`player-substitute-${sub.substitutePlayer.id}`}
            >
              <button
                onClick={() => handlePlayerClick(sub.substitutePlayer.id)}
                className="flex items-center gap-2 flex-1 text-left cursor-pointer min-w-0"
              >
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarImage src={sub.substitutePlayer.profileImageUrl || undefined} alt={sub.substitutePlayer.firstName || 'User'} />
                  <AvatarFallback className="text-xs">
                    {sub.substitutePlayer.firstName?.[0]}{sub.substitutePlayer.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium truncate text-purple-700 dark:text-purple-300 flex-1 min-w-0">
                  {formatPlayerName(sub.substitutePlayer.firstName || undefined, sub.substitutePlayer.lastName || undefined)}
                </span>
              </button>
              <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0 flex-shrink-0">
                Sub
              </Badge>
              {canManageSubstitutes && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Remove ${sub.substitutePlayer.firstName} ${sub.substitutePlayer.lastName} as substitute?`)) {
                      revokeSubMutation.mutate(sub.requestId);
                    }
                  }}
                  className="p-1 rounded hover:bg-red-900/50 text-red-400 hover:text-red-300 flex-shrink-0"
                  disabled={revokeSubMutation.isPending}
                  data-testid={`button-remove-substitute-${sub.requestId}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          
          {attendingPlayers.length === 0 && teamSubstitutes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">—</p>
          )}
        </div>
      </div>
      
      {/* Out Column */}
      <div className="flex flex-col">
        <Button
          variant={currentStatus === 'not_attending' ? "default" : "outline"}
          size="sm"
          onClick={() => rsvpMutation.mutate('not_attending')}
          disabled={isLoading}
          className={cn(
            "flex items-center justify-center gap-1 transition-all border-2 w-full text-xs px-2",
            currentStatus === 'not_attending' 
              ? "bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-lg scale-105" 
              : "border-red-600 text-red-600 hover:bg-red-600 hover:text-white hover:shadow-md",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          data-testid="button-not-attending"
        >
          <X className={cn(
            "h-3 w-3",
            currentStatus === 'not_attending' ? "animate-pulse" : ""
          )} />
          Out ({notAttendingPlayers.length})
        </Button>
        
        <div className="mt-2 space-y-1">
          {notAttendingPlayers.map((rsvp: any) => {
            const hasPendingRequest = playersWithPendingRequests.has(rsvp.user.id);
            return (
              <button
                key={rsvp.user.id}
                onClick={() => {
                  if (hasPendingRequest) {
                    setDetailsModalPlayer(rsvp.user.id);
                  } else {
                    handlePlayerClick(rsvp.user.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 p-1.5 rounded-md transition-colors w-full text-left cursor-pointer",
                  hasPendingRequest 
                    ? "bg-green-100/60 hover:bg-green-100/80 border border-green-600/30 dark:bg-green-900/30 dark:hover:bg-green-900/40" 
                    : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                )}
                data-testid={`player-not-attending-${rsvp.user.id}`}
              >
                <div className="relative">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={rsvp.user.profileImageUrl || undefined} alt={rsvp.user.firstName || 'User'} />
                    <AvatarFallback className="text-xs">
                      {rsvp.user.firstName?.[0]}{rsvp.user.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  {hasPendingRequest && (
                    <div className="absolute -bottom-0.5 -right-0.5 bg-green-600 rounded-full p-0.5">
                      <UserCheck className="h-2 w-2 text-white" />
                    </div>
                  )}
                </div>
                <span className={cn(
                  "text-xs font-medium truncate",
                  hasPendingRequest ? "text-green-700 dark:text-green-400" : "text-zinc-900 dark:text-white"
                )}>
                  {formatPlayerName(rsvp.user.firstName, rsvp.user.lastName)}
                </span>
              </button>
            );
          })}
          {notAttendingPlayers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">—</p>
          )}
        </div>
      </div>

      {/* Substitute Request Details Modal */}
      {detailsModalPlayer && (
        <SubstituteRequestDetailsModal
          gameId={gameId}
          originalPlayerId={detailsModalPlayer}
          isOpen={!!detailsModalPlayer}
          onClose={() => setDetailsModalPlayer(null)}
          onRequestNewSub={onRequestSubstitute ? () => {
            const player = notAttendingPlayers.find((p: any) => p.user.id === detailsModalPlayer);
            if (player) {
              onRequestSubstitute(player.user.id, `${player.user.firstName} ${player.user.lastName}`);
            }
          } : undefined}
        />
      )}
    </div>
  );
}