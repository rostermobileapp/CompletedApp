import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RSVPAlertIconProps {
  gameId: string;
  teamId: string;
  className?: string;
}

export function RSVPAlertIcon({ gameId, teamId, className }: RSVPAlertIconProps) {
  const { data: rsvpSummary } = useQuery<{ attending?: any[]; notAttending?: any[] } | null>({
    queryKey: [`/api/games/${gameId}/rsvp-summary?teamId=${teamId}`],
  });

  const notAttendingCount = rsvpSummary?.notAttending?.length || 0;

  if (notAttendingCount === 0) {
    return null;
  }

  return (
    <div 
      className={cn(
        "flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 shadow-lg animate-pulse",
        className
      )} 
      data-testid={`rsvp-alert-icon-${gameId}`}
      title={`${notAttendingCount} player${notAttendingCount > 1 ? 's' : ''} not attending`}
    >
      <AlertTriangle className="w-4 h-4 text-white" />
    </div>
  );
}
