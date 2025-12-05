import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  const { data: currentRsvp } = useQuery({
    queryKey: [`/api/games/${gameId}/rsvp`, userId, userTeamId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/games/${gameId}/rsvp?teamId=${userTeamId}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to fetch RSVP');
        return response.json();
      } catch (error) {
        return null;
      }
    },
  });

  const { data: rsvpSummary } = useQuery({
    queryKey: [`/api/games/${gameId}/rsvp-summary`, userTeamId],
    queryFn: async () => {
      const url = `/api/games/${gameId}/rsvp-summary?teamId=${userTeamId}`;
      const response = await fetch(url);
      if (!response.ok) return { attending: [], notAttending: [] };
      return response.json();
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
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/rsvp`, userId, userTeamId] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/rsvp-summary`] });
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

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  };

  return (
    <div className={cn("grid grid-cols-2 gap-4", className)} data-testid="rsvp-buttons">
      <div className="flex flex-col">
        <Button
          variant={currentStatus === 'attending' ? "default" : "outline"}
          size="sm"
          onClick={() => rsvpMutation.mutate('attending')}
          disabled={isLoading}
          className={cn(
            "flex items-center justify-center gap-1 transition-all border-2 w-full",
            currentStatus === 'attending' 
              ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-lg scale-105" 
              : "border-green-600 text-green-600 hover:bg-green-600 hover:text-white hover:shadow-md",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          data-testid="button-attending"
        >
          <Check className={cn(
            "h-4 w-4",
            currentStatus === 'attending' ? "animate-pulse" : ""
          )} />
          In ({attendingPlayers.length})
        </Button>
        
        <div className="mt-2 space-y-1">
          {attendingPlayers.map((rsvp: any) => (
            <div 
              key={rsvp.user.id} 
              className="flex items-center gap-2 p-1.5 rounded-md bg-green-50 dark:bg-green-950/30"
              data-testid={`player-attending-${rsvp.user.id}`}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={rsvp.user.profileImageUrl} />
                <AvatarFallback className="text-xs bg-green-200 dark:bg-green-800">
                  {getInitials(rsvp.user.firstName, rsvp.user.lastName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium truncate text-green-700 dark:text-green-300">
                {rsvp.user.firstName} {rsvp.user.lastName?.[0]}.
              </span>
            </div>
          ))}
          {attendingPlayers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No players yet</p>
          )}
        </div>
      </div>
      
      <div className="flex flex-col">
        <Button
          variant={currentStatus === 'not_attending' ? "default" : "outline"}
          size="sm"
          onClick={() => rsvpMutation.mutate('not_attending')}
          disabled={isLoading}
          className={cn(
            "flex items-center justify-center gap-1 transition-all border-2 w-full",
            currentStatus === 'not_attending' 
              ? "bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-lg scale-105" 
              : "border-red-600 text-red-600 hover:bg-red-600 hover:text-white hover:shadow-md",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          data-testid="button-not-attending"
        >
          <X className={cn(
            "h-4 w-4",
            currentStatus === 'not_attending' ? "animate-pulse" : ""
          )} />
          Out ({notAttendingPlayers.length})
        </Button>
        
        <div className="mt-2 space-y-1">
          {notAttendingPlayers.map((rsvp: any) => (
            <div 
              key={rsvp.user.id} 
              className="flex items-center gap-2 p-1.5 rounded-md bg-red-50 dark:bg-red-950/30"
              data-testid={`player-not-attending-${rsvp.user.id}`}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={rsvp.user.profileImageUrl} />
                <AvatarFallback className="text-xs bg-red-200 dark:bg-red-800">
                  {getInitials(rsvp.user.firstName, rsvp.user.lastName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium truncate text-red-700 dark:text-red-300">
                {rsvp.user.firstName} {rsvp.user.lastName?.[0]}.
              </span>
            </div>
          ))}
          {notAttendingPlayers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No players yet</p>
          )}
        </div>
      </div>
    </div>
  );
}