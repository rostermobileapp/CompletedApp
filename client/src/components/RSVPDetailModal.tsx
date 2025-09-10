import { useQuery } from "@tanstack/react-query";
import { UserCheck, UserX, Users, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface RSVPDetailModalProps {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
  onRequestSubstitute?: (playerId: string, playerName: string) => void;
  showSubstituteButtons?: boolean;
}

export function RSVPDetailModal({ 
  gameId, 
  isOpen, 
  onClose, 
  onRequestSubstitute,
  showSubstituteButtons = false 
}: RSVPDetailModalProps) {
  const { data: rsvpSummary, isLoading } = useQuery({
    queryKey: [`/api/games/${gameId}/rsvp-summary`],
    queryFn: async () => {
      const response = await fetch(`/api/games/${gameId}/rsvp-summary`);
      if (!response.ok) {
        throw new Error('Failed to fetch RSVP summary');
      }
      return response.json();
    },
    enabled: isOpen,
  });

  const PlayerListItem = ({ user, status, showSubstituteButton = false }: any) => (
    <div className="flex items-center justify-between p-3 rounded-lg border" data-testid={`player-${user.id}`}>
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.profileImageUrl} />
          <AvatarFallback className="text-xs">
            {user.firstName?.[0]}{user.lastName?.[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">
            {user.firstName} {user.lastName}
          </p>
          {user.email && (
            <p className="text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {status === 'attending' && (
          <Badge variant="secondary" className="bg-green-100 text-green-700">
            <UserCheck className="h-3 w-3 mr-1" />
            Going
          </Badge>
        )}
        {status === 'not_attending' && (
          <Badge variant="secondary" className="bg-red-100 text-red-700">
            <UserX className="h-3 w-3 mr-1" />
            Not Going
          </Badge>
        )}
        {status === 'no_response' && (
          <Badge variant="outline">
            <Mail className="h-3 w-3 mr-1" />
            No Response
          </Badge>
        )}
        
        {showSubstituteButton && status === 'not_attending' && onRequestSubstitute && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onRequestSubstitute(user.id, `${user.firstName} ${user.lastName}`)}
            data-testid={`button-request-substitute-${user.id}`}
          >
            Request Substitute
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]" data-testid="rsvp-detail-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Game RSVP Details
          </DialogTitle>
          <DialogDescription>
            View who's attending, not attending, and hasn't responded
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border animate-pulse">
                <div className="h-8 w-8 bg-muted rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-32 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-48"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Attending Section */}
              {rsvpSummary?.attending && rsvpSummary.attending.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Attending ({rsvpSummary.attending.length})
                  </h3>
                  <div className="space-y-2">
                    {rsvpSummary.attending.map((rsvp: any) => (
                      <PlayerListItem 
                        key={rsvp.user.id} 
                        user={rsvp.user} 
                        status="attending"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Not Attending Section */}
              {rsvpSummary?.notAttending && rsvpSummary.notAttending.length > 0 && (
                <div>
                  <Separator />
                  <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <UserX className="h-4 w-4" />
                    Not Attending ({rsvpSummary.notAttending.length})
                  </h3>
                  <div className="space-y-2">
                    {rsvpSummary.notAttending.map((rsvp: any) => (
                      <PlayerListItem 
                        key={rsvp.user.id} 
                        user={rsvp.user} 
                        status="not_attending"
                        showSubstituteButton={showSubstituteButtons}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No Response Section */}
              {rsvpSummary?.noResponse && rsvpSummary.noResponse.length > 0 && (
                <div>
                  <Separator />
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    No Response ({rsvpSummary.noResponse.length})
                  </h3>
                  <div className="space-y-2">
                    {rsvpSummary.noResponse.map((user: any) => (
                      <PlayerListItem 
                        key={user.id} 
                        user={user} 
                        status="no_response"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {(!rsvpSummary?.attending?.length && !rsvpSummary?.notAttending?.length && !rsvpSummary?.noResponse?.length) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No RSVP information available</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}