import { useQuery } from "@tanstack/react-query";
import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface RSVPStatusIconProps {
  gameId: string;
  userId: string;
  className?: string;
}

export function RSVPStatusIcon({ gameId, userId, className }: RSVPStatusIconProps) {
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

  const status = currentRsvp?.status || 'no_response';

  if (status === 'no_response') {
    return (
      <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 border-2 border-gray-300", className)} data-testid="rsvp-status-no-response">
        <Clock className="w-3 h-3 text-gray-500" />
      </div>
    );
  }

  if (status === 'attending') {
    return (
      <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-green-600 border-2 border-green-600 shadow-lg", className)} data-testid="rsvp-status-attending">
        <Check className="w-4 h-4 text-white font-bold" />
      </div>
    );
  }

  if (status === 'not_attending') {
    return (
      <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-red-600 border-2 border-red-600 shadow-lg", className)} data-testid="rsvp-status-not-attending">
        <X className="w-4 h-4 text-white font-bold" />
      </div>
    );
  }

  return null;
}