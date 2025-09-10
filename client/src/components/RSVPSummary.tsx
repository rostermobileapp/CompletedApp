import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RSVPSummaryProps {
  gameId: string;
  onViewDetails?: () => void;
  className?: string;
}

export function RSVPSummary({ gameId, onViewDetails, className }: RSVPSummaryProps) {
  const { data: rsvpSummary, isLoading } = useQuery({
    queryKey: [`/api/games/${gameId}/rsvp-summary`],
    queryFn: async () => {
      const response = await fetch(`/api/games/${gameId}/rsvp-summary`);
      if (!response.ok) {
        throw new Error('Failed to fetch RSVP summary');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader className="pb-2">
          <div className="h-4 bg-muted rounded w-24"></div>
        </CardHeader>
        <CardContent>
          <div className="h-3 bg-muted rounded w-32"></div>
        </CardContent>
      </Card>
    );
  }

  if (!rsvpSummary) {
    return null;
  }

  const attendingCount = rsvpSummary.attending?.length || 0;
  const notAttendingCount = rsvpSummary.notAttending?.length || 0;
  const noResponseCount = rsvpSummary.noResponse?.length || 0;
  const totalPlayers = attendingCount + notAttendingCount + noResponseCount;

  return (
    <Card className={cn("cursor-pointer transition-all hover:shadow-md", className)} data-testid="rsvp-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          RSVP Status
        </CardTitle>
        <CardDescription className="text-xs">
          {totalPlayers} total player{totalPlayers !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge 
            variant="secondary" 
            className="bg-green-100 text-green-700 hover:bg-green-200 flex items-center gap-1"
            data-testid="badge-attending"
          >
            <UserCheck className="h-3 w-3" />
            {attendingCount} attending
          </Badge>
          <Badge 
            variant="secondary" 
            className="bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1"
            data-testid="badge-not-attending"
          >
            <UserX className="h-3 w-3" />
            {notAttendingCount} not attending
          </Badge>
          {noResponseCount > 0 && (
            <Badge 
              variant="outline" 
              className="flex items-center gap-1"
              data-testid="badge-no-response"
            >
              <Users className="h-3 w-3" />
              {noResponseCount} no response
            </Badge>
          )}
        </div>
        
        {onViewDetails && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onViewDetails}
            className="w-full text-xs"
            data-testid="button-view-details"
          >
            View Details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}