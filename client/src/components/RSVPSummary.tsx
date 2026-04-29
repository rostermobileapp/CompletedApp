import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/queryClient";

interface RSVPSummaryProps {
  gameId: string;
  teamId?: string; // If specified, show only this team's RSVP data
  showTeamSeparation?: boolean; // If true, show both teams separately
  onViewDetails?: () => void;
  className?: string;
}

export function RSVPSummary({ gameId, teamId, showTeamSeparation, onViewDetails, className }: RSVPSummaryProps) {
  const { data: rsvpSummary, isLoading } = useQuery({
    queryKey: teamId
      ? [`/api/games/${gameId}/rsvp-summary?teamId=${teamId}`]
      : [`/api/games/${gameId}/rsvp-summary`, showTeamSeparation],
    queryFn: async () => {
      let url = `/api/games/${gameId}/rsvp-summary`;
      if (teamId) {
        url += `?teamId=${teamId}`;
      }
      const authHeaders = await getAuthHeaders();
      const response = await fetch(url, { headers: authHeaders });
      if (!response.ok) {
        throw new Error('Failed to fetch RSVP summary');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader className="pt-[4px] pb-[4px]">
          <div className="h-4 bg-muted rounded w-24"></div>
        </CardHeader>
        <CardContent className="pt-[4px] pb-[4px]">
          <div className="h-3 bg-muted rounded w-32"></div>
        </CardContent>
      </Card>
    );
  }

  if (!rsvpSummary) {
    return null;
  }

  // Handle team-separated data
  if (showTeamSeparation && rsvpSummary.homeTeam && rsvpSummary.awayTeam) {
    return (
      <div className={cn("space-y-3", className)} data-testid="rsvp-summary-teams">
        <div className="text-sm font-medium">RSVP Status by Team</div>
        
        {/* Home Team */}
        <Card className="">
          <CardHeader className="pt-[4px] pb-[4px]">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Home Team
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-[4px] pb-[4px]">
            <div className="flex gap-2">
              <Badge variant="secondary" className="hover:bg-green-200 flex items-center gap-1 text-[#ffffff] bg-[#16a34a]">
                <UserCheck className="h-3 w-3" />
                {rsvpSummary.homeTeam.attending?.length || 0} In
              </Badge>
              <Badge variant="secondary" className="hover:bg-red-200 flex items-center gap-1 text-[#ffffff] bg-[#dc2626]">
                <UserX className="h-3 w-3" />
                {rsvpSummary.homeTeam.notAttending?.length || 0} Out
              </Badge>
              {(rsvpSummary.homeTeam.noResponse?.length || 0) > 0 && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {rsvpSummary.homeTeam.noResponse?.length || 0} no response
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Away Team */}
        <Card className="">
          <CardHeader className="pt-[4px] pb-[4px]">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Away Team
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-[4px] pb-[4px]">
            <div className="flex gap-2">
              <Badge variant="secondary" className="hover:bg-green-200 flex items-center gap-1 text-[#ffffff] bg-[#16a34a]">
                <UserCheck className="h-3 w-3" />
                {rsvpSummary.awayTeam.attending?.length || 0} In
              </Badge>
              <Badge variant="secondary" className="hover:bg-red-200 flex items-center gap-1 text-[#ffffff] bg-[#dc2626]">
                <UserX className="h-3 w-3" />
                {rsvpSummary.awayTeam.notAttending?.length || 0} Out
              </Badge>
              {(rsvpSummary.awayTeam.noResponse?.length || 0) > 0 && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {rsvpSummary.awayTeam.noResponse?.length || 0} no response
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle single team or legacy data
  const attendingCount = rsvpSummary.attending?.length || 0;
  const notAttendingCount = rsvpSummary.notAttending?.length || 0;
  const noResponseCount = rsvpSummary.noResponse?.length || 0;
  const totalPlayers = attendingCount + notAttendingCount + noResponseCount;

  return (
    <Card className="rounded-lg border shadow-sm cursor-pointer transition-all hover:shadow-md bg-[212121] text-[#ffffff]" data-testid="rsvp-summary">
      <CardHeader className="pt-[4px] pb-[4px]">
        <CardTitle className="text-sm flex items-center gap-2 text-[#212121]">
          <Users className="h-4 w-4" />
          {teamId ? "Team RSVP Status" : "RSVP Status"}
        </CardTitle>
        <CardDescription className="text-xs">
          {totalPlayers} total player{totalPlayers !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-[4px] pb-[4px]">
        <div className="flex gap-2 mb-3">
          <Badge 
            variant="secondary" 
            className="hover:bg-green-200 flex items-center gap-1 text-[#ffffff] bg-[#16a34a]"
            data-testid="badge-attending"
          >
            <UserCheck className="h-3 w-3" />
            {attendingCount} In
          </Badge>
          <Badge 
            variant="secondary" 
            className="hover:bg-red-200 flex items-center gap-1 text-[#ffffff] bg-[#dc2626]"
            data-testid="badge-not-attending"
          >
            <UserX className="h-3 w-3" />
            {notAttendingCount} Out
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
            onClick={onViewDetails}
            className="w-full bg-primary text-primary-foreground hover:bg-primary"
            data-testid="button-view-details"
          >
            View Details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}