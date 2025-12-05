import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, UserCheck, Users, Calendar, MapPin, X } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";

interface SubstituteRequestDetailsModalProps {
  gameId: string;
  originalPlayerId: string;
  isOpen: boolean;
  onClose: () => void;
  onRequestNewSub?: () => void;
}

export function SubstituteRequestDetailsModal({
  gameId,
  originalPlayerId,
  isOpen,
  onClose,
  onRequestNewSub,
}: SubstituteRequestDetailsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch the substitute request for this player and game
  const { data: request, isLoading } = useQuery({
    queryKey: ["/api/substitute-requests", gameId, originalPlayerId],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const response = await fetch("/api/substitute-requests", {
        headers: authHeaders,
      });
      if (!response.ok) return null;
      const allRequests = await response.json();
      return allRequests.find(
        (req: any) =>
          req.gameId === gameId &&
          req.originalPlayerId === originalPlayerId &&
          ["pending_opponent_approval", "pending_commissioner_approval", "pending_substitute_approval"].includes(req.status)
      );
    },
    enabled: isOpen && !!gameId && !!originalPlayerId,
  });

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "pending_opponent_approval":
        return { label: "Awaiting opponent approval", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
      case "pending_commissioner_approval":
        return { label: "Awaiting commissioner approval", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
      case "pending_substitute_approval":
        return { label: "Awaiting sub confirmation", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
      default:
        return { label: "Pending", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" };
    }
  };

  const formatPlayerName = (firstName?: string, lastName?: string) => {
    if (lastName && firstName) {
      return `${lastName}, ${firstName.charAt(0)}.`;
    }
    return lastName || firstName || "Unknown";
  };

  const formatGameDateTime = (scheduledAt: string) => {
    const date = new Date(scheduledAt);
    return format(date, "EEE, MMM d 'at' h:mm a");
  };

  if (!request && !isLoading) {
    return null;
  }

  const statusInfo = request ? getStatusInfo(request.status) : null;
  const originalPlayer = request?.originalPlayer;
  const substitutePlayer = request?.substitutePlayer;
  const game = request?.game;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-[#1a1a1a] border-border" data-testid="substitute-request-details-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4 text-green-500" />
            Substitute Request
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-12 bg-zinc-800 rounded-lg" />
            <div className="h-8 bg-zinc-800 rounded-lg" />
            <div className="h-16 bg-zinc-800 rounded-lg" />
          </div>
        ) : request ? (
          <div className="space-y-4">
            {/* Status Badge */}
            {statusInfo && (
              <div className={`${statusInfo.color} border text-xs cursor-default inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold`}>
                <Clock className="h-3 w-3 mr-1" />
                {statusInfo.label}
              </div>
            )}

            {/* Original Player */}
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <p className="text-xs text-muted-foreground mb-2">Player Out</p>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={originalPlayer?.profileImageUrl} />
                  <AvatarFallback>
                    {originalPlayer?.firstName?.[0]}{originalPlayer?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-white">
                    {originalPlayer?.firstName} {originalPlayer?.lastName}
                  </p>
                </div>
              </div>
            </div>

            {/* Substitute Player */}
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <p className="text-xs text-muted-foreground mb-2">Substitute</p>
              {substitutePlayer ? (
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={substitutePlayer.profileImageUrl} />
                    <AvatarFallback>
                      {substitutePlayer.firstName?.[0]}{substitutePlayer.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-white">
                      {substitutePlayer.firstName} {substitutePlayer.lastName}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="h-10 w-10 rounded-full bg-zinc-700 flex items-center justify-center">
                    <Users className="h-5 w-5" />
                  </div>
                  <p className="text-sm">Not yet assigned</p>
                </div>
              )}
            </div>

            {/* Game Info */}
            {game && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  <span>{formatGameDateTime(game.scheduledAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-3 w-3" />
                  <span>
                    {game.homeTeam?.name} vs {game.awayTeam?.name}
                  </span>
                </div>
                {game.facility?.name && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    <span>{game.facility.name}</span>
                  </div>
                )}
              </div>
            )}

            {/* Request timestamp */}
            {request.createdAt && (
              <p className="text-xs text-muted-foreground">
                Requested {format(new Date(request.createdAt), "MMM d 'at' h:mm a")}
              </p>
            )}

            {/* Actions */}
            {onRequestNewSub && (
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => {
                  onClose();
                  onRequestNewSub();
                }}
                data-testid="button-change-substitute"
              >
                Change Substitute
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No pending request found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
