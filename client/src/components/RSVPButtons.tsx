import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface RSVPButtonsProps {
  gameId: string;
  userId: string;
  className?: string;
}

export function RSVPButtons({ gameId, userId, className }: RSVPButtonsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current RSVP status
  const { data: currentRsvp } = useQuery({
    queryKey: [`/api/games/${gameId}/rsvp`, userId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/games/${gameId}/rsvp?userId=${userId}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to fetch RSVP');
        return response.json();
      } catch (error) {
        return null;
      }
    },
  });

  // RSVP mutation
  const rsvpMutation = useMutation({
    mutationFn: async (status: 'attending' | 'not_attending') => {
      await apiRequest("POST", `/api/games/${gameId}/rsvp`, { status });
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/rsvp`, userId] });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/rsvp-summary`] });
      toast({
        title: "RSVP Updated",
        description: status === 'attending' 
          ? "You're attending this game" 
          : "You're not attending this game",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update RSVP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const currentStatus = currentRsvp?.status || 'no_response';
  const isLoading = rsvpMutation.isPending;

  return (
    <div className={cn("flex gap-2", className)} data-testid="rsvp-buttons">
      <Button
        variant={currentStatus === 'attending' ? "default" : "outline"}
        size="sm"
        onClick={() => rsvpMutation.mutate('attending')}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1 transition-all",
          currentStatus === 'attending' 
            ? "bg-green-600 hover:bg-green-700 text-white" 
            : "border-green-600 text-green-600 hover:bg-green-50"
        )}
        data-testid="button-attending"
      >
        <Check className="h-4 w-4" />
        {currentStatus === 'attending' ? 'Attending' : 'Going'}
      </Button>
      
      <Button
        variant={currentStatus === 'not_attending' ? "default" : "outline"}
        size="sm"
        onClick={() => rsvpMutation.mutate('not_attending')}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1 transition-all",
          currentStatus === 'not_attending' 
            ? "bg-red-600 hover:bg-red-700 text-white" 
            : "border-red-600 text-red-600 hover:bg-red-50"
        )}
        data-testid="button-not-attending"
      >
        <X className="h-4 w-4" />
        {currentStatus === 'not_attending' ? 'Not Going' : 'Can\'t Go'}
      </Button>
    </div>
  );
}