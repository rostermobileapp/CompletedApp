import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { ClickableAvatar } from "@/components/ClickableAvatar";
import { useLocation } from "wouter";
import { setPageTransitionDirection } from "@/components/PageTransition";

interface RSVPButtonsProps {
  gameId: string;
  userId: string;
  userTeamId?: string;
  className?: string;
}

export function RSVPButtons({ gameId, userId, userTeamId, className }: RSVPButtonsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!userTeamId) {
    return null;
  }

  const { data: currentRsvp } = useQuery<{ status?: string } | null>({
    queryKey: [`/api/games/${gameId}/rsvp?teamId=${userTeamId}`],
  });

  const { data: rsvpSummary } = useQuery<{ attending?: any[]; notAttending?: any[]; noResponse?: any[] } | null>({
    queryKey: [`/api/games/${gameId}/rsvp-summary?teamId=${userTeamId}`],
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

  const attendingPlayers = rsvpSummary?.attending || [];
  const notAttendingPlayers = rsvpSummary?.notAttending || [];
  const noResponsePlayers = rsvpSummary?.noResponse || [];

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
    <div className={cn("grid grid-cols-3 gap-3", className)} data-testid="rsvp-buttons">
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
          In ({attendingPlayers.length})
        </Button>
        
        <div className="mt-2 space-y-1">
          {attendingPlayers.map((rsvp: any) => (
            <div
              key={rsvp.user.id}
              onClick={() => handlePlayerClick(rsvp.user.id)}
              className="flex items-center gap-2 p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors w-full text-left cursor-pointer"
              data-testid={`player-attending-${rsvp.user.id}`}
            >
              <ClickableAvatar
                userId={rsvp.user.id}
                profileImageUrl={rsvp.user.profileImageUrl}
                firstName={rsvp.user.firstName}
                lastName={rsvp.user.lastName}
                size="xs"
              />
              <span className="text-xs font-medium truncate text-white">
                {formatPlayerName(rsvp.user.firstName, rsvp.user.lastName)}
              </span>
            </div>
          ))}
          {attendingPlayers.length === 0 && (
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
          {notAttendingPlayers.map((rsvp: any) => (
            <div
              key={rsvp.user.id}
              onClick={() => handlePlayerClick(rsvp.user.id)}
              className="flex items-center gap-2 p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors w-full text-left cursor-pointer"
              data-testid={`player-not-attending-${rsvp.user.id}`}
            >
              <ClickableAvatar
                userId={rsvp.user.id}
                profileImageUrl={rsvp.user.profileImageUrl}
                firstName={rsvp.user.firstName}
                lastName={rsvp.user.lastName}
                size="xs"
              />
              <span className="text-xs font-medium truncate text-white">
                {formatPlayerName(rsvp.user.firstName, rsvp.user.lastName)}
              </span>
            </div>
          ))}
          {notAttendingPlayers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">—</p>
          )}
        </div>
      </div>
      
      {/* No Response Column */}
      <div className="flex flex-col">
        <div className="flex items-center justify-center gap-1 h-9 rounded-md border-2 border-zinc-600 bg-zinc-800 text-zinc-400 text-xs px-2">
          <HelpCircle className="h-3 w-3" />
          ? ({noResponsePlayers.length})
        </div>
        
        <div className="mt-2 space-y-1">
          {noResponsePlayers.map((player: any) => (
            <div
              key={player.id}
              onClick={() => handlePlayerClick(player.id)}
              className="flex items-center gap-2 p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors w-full text-left cursor-pointer"
              data-testid={`player-no-response-${player.id}`}
            >
              <ClickableAvatar
                userId={player.id}
                profileImageUrl={player.profileImageUrl}
                firstName={player.firstName}
                lastName={player.lastName}
                size="xs"
              />
              <span className="text-xs font-medium truncate text-zinc-400">
                {formatPlayerName(player.firstName, player.lastName)}
              </span>
            </div>
          ))}
          {noResponsePlayers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">—</p>
          )}
        </div>
      </div>
    </div>
  );
}