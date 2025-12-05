import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Calendar, UserX } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";

interface SubstituteRequestModalProps {
  gameId: string;
  gameDate: string;
  leagueId: string;
  originalPlayerId?: string;
  originalPlayerName?: string;
  homeTeamId: string;
  awayTeamId: string;
  originalPlayerTeamId: string;
  isOpen: boolean;
  onClose: () => void;
  notAttendingPlayers?: Array<{ user: any }>;
}

export function SubstituteRequestModal({ 
  gameId, 
  gameDate,
  leagueId,
  originalPlayerId,
  originalPlayerName,
  homeTeamId,
  awayTeamId,
  originalPlayerTeamId,
  isOpen, 
  onClose,
  notAttendingPlayers = []
}: SubstituteRequestModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedOriginalPlayer, setSelectedOriginalPlayer] = useState<string | null>(originalPlayerId || null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get the selected original player's name
  const getSelectedOriginalPlayerName = () => {
    if (originalPlayerName) return originalPlayerName;
    const player = notAttendingPlayers.find(p => p.user.id === selectedOriginalPlayer);
    return player ? `${player.user.firstName} ${player.user.lastName}` : '';
  };

  // Determine opposing team ID based on the original player's team
  const opposingTeamId = originalPlayerTeamId === homeTeamId ? awayTeamId : homeTeamId;

  // Fetch all league players with availability status
  const { data: allPlayers = [], isLoading } = useQuery({
    queryKey: [`/api/players/all-with-availability/${gameDate}`, leagueId],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/players/all-with-availability/${gameDate}?leagueId=${leagueId}`, {
        headers: authHeaders
      });
      if (!response.ok) {
        throw new Error('Failed to fetch players');
      }
      return response.json();
    },
    enabled: isOpen && !!gameDate && !!leagueId,
  });

  // Fetch original player's league membership to get their position
  const effectiveOriginalPlayerId = originalPlayerId || selectedOriginalPlayer;
  const { data: originalPlayerMembership } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/members`, effectiveOriginalPlayerId],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/leagues/${leagueId}/members`, {
        headers: authHeaders
      });
      if (!response.ok) {
        throw new Error('Failed to fetch league members');
      }
      const members = await response.json();
      return members.find((m: any) => m.userId === effectiveOriginalPlayerId);
    },
    enabled: isOpen && !!leagueId && !!effectiveOriginalPlayerId,
  });

  const originalPlayerIsGoalie = originalPlayerMembership?.isGoalie || false;

  // Create substitute request mutation
  const createRequestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer) throw new Error('No substitute player selected');
      const playerToReplace = originalPlayerId || selectedOriginalPlayer;
      if (!playerToReplace) throw new Error('No player to replace selected');
      
      await apiRequest("POST", "/api/substitute-requests", {
        gameId,
        originalPlayerId: playerToReplace,
        substitutePlayerId: selectedPlayer,
      });
    },
    onSuccess: () => {
      toast({
        title: "Substitute Request Sent",
        description: `Request sent for ${getSelectedOriginalPlayerName()}. The commissioner will review it.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      onClose();
      setSelectedPlayer(null);
      setSelectedOriginalPlayer(null);
      setSearchTerm("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send substitute request. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter players based on requirements
  const filteredPlayers = allPlayers.filter((player: any) => {
    // Exclude the original player (either from prop or selected in browse mode)
    if (player.id === originalPlayerId) return false;
    if (player.id === selectedOriginalPlayer) return false;
    
    // Exclude players on BOTH teams in this game (same team AND opposing team)
    if (player.teamId === originalPlayerTeamId) return false;
    if (player.teamId === opposingTeamId) return false;
    
    // Filter by position type: if goalie needs substitute, only show goalies; if skater, only show skaters
    if (originalPlayerIsGoalie && !player.isGoalie) return false;
    if (!originalPlayerIsGoalie && player.isGoalie) return false;
    
    // Filter by search term
    const searchLower = searchTerm.toLowerCase();
    if (searchTerm && !(
      `${player.firstName} ${player.lastName}`.toLowerCase().includes(searchLower) ||
      player.email?.toLowerCase().includes(searchLower)
    )) {
      return false;
    }
    
    return true;
  });

  // Sort players by the specified logic:
  // 1. Bye week players (not scheduled) at the top
  // 2. Then scheduled players sorted by game time
  const sortedPlayers = [...filteredPlayers].sort((a: any, b: any) => {
    // Bye week players (no game) first
    if (!a.isScheduled && b.isScheduled) return -1;
    if (a.isScheduled && !b.isScheduled) return 1;
    
    // Both have bye week or both are scheduled
    if (a.isScheduled && b.isScheduled && a.gameTime && b.gameTime) {
      // Sort by game time
      return new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime();
    }
    
    return 0;
  });

  const handleSubmit = () => {
    const playerToReplace = originalPlayerId || selectedOriginalPlayer;
    if (!playerToReplace) {
      toast({
        title: "Error",
        description: "Please select a player who needs a substitute.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedPlayer) {
      toast({
        title: "Error",
        description: "Please select a substitute player.",
        variant: "destructive",
      });
      return;
    }
    createRequestMutation.mutate();
  };

  const handleClose = () => {
    onClose();
    setSelectedPlayer(null);
    setSelectedOriginalPlayer(null);
    setSearchTerm("");
  };

  const showPlayerToReplaceSelection = !originalPlayerId && notAttendingPlayers.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col bg-[#e2e2e2] dark:bg-[#212121] border-border" data-testid="substitute-request-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {originalPlayerId ? `Request Substitute for ${originalPlayerName}` : 'Find Substitutes'}
          </DialogTitle>
          <DialogDescription>
            {originalPlayerId 
              ? 'Search and select a player to request as a substitute'
              : 'Select a player who needs a substitute, then find an available replacement'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex flex-col flex-1 overflow-hidden">
          {/* Players Who Need Substitutes Section */}
          {showPlayerToReplaceSelection && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2 text-red-500">
                <UserX className="h-4 w-4" />
                Players Not Attending ({notAttendingPlayers.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {notAttendingPlayers.map((rsvp: any) => (
                  <button
                    key={rsvp.user.id}
                    onClick={() => setSelectedOriginalPlayer(rsvp.user.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      selectedOriginalPlayer === rsvp.user.id
                        ? 'border-red-500 bg-red-500/20 text-red-400'
                        : 'border-border bg-[#1a1a1a] hover:bg-[#252525] text-muted-foreground'
                    }`}
                    data-testid={`player-to-replace-${rsvp.user.id}`}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={rsvp.user.profileImageUrl} />
                      <AvatarFallback className="text-xs">
                        {rsvp.user.firstName?.[0]}{rsvp.user.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{rsvp.user.firstName} {rsvp.user.lastName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Input */}
          <Input
            placeholder="Search for any player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#1a1a1a]"
            data-testid="input-search-players"
          />

          {/* Players List */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-[#1a1a1a] animate-pulse">
                  <div className="h-10 w-10 bg-muted rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-32 mb-1"></div>
                    <div className="h-3 bg-muted rounded w-48"></div>
                  </div>
                  <div className="h-8 w-16 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <ScrollArea className="flex-1 overflow-auto" style={{ height: '50vh' }}>
              <div className="space-y-2">
                {sortedPlayers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>
                      {searchTerm 
                        ? "No players found matching your search" 
                        : originalPlayerIsGoalie 
                          ? "No goalies available for substitution"
                          : "No skaters available for substitution"}
                    </p>
                  </div>
                ) : (
                  sortedPlayers.map((player: any) => (
                    <div 
                      key={player.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedPlayer === player.id 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-[#1a1a1a] hover:bg-[#252525]'
                      }`}
                      onClick={() => setSelectedPlayer(player.id)}
                      data-testid={`player-option-${player.id}`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={player.profileImageUrl} />
                          <AvatarFallback>
                            {player.firstName?.[0]}{player.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {player.firstName} {player.lastName}
                            </p>
                            {!player.isScheduled ? (
                              <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-500 border-green-500/30">
                                Bye Week
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {player.gameTime ? (() => {
                                  // Extract time from ISO string and display in local timezone
                                  const date = new Date(player.gameTime);
                                  // Format using the UTC time to avoid double conversion
                                  const hours = date.getUTCHours();
                                  const minutes = date.getUTCMinutes();
                                  const ampm = hours >= 12 ? 'PM' : 'AM';
                                  const displayHours = hours % 12 || 12;
                                  const displayMinutes = minutes.toString().padStart(2, '0');
                                  return `${displayHours}:${displayMinutes} ${ampm}`;
                                })() : 'Scheduled'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Skill: {(player as any).skillLevel || '—'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center">
                        {selectedPlayer === player.id && (
                          <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-white"></div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={handleClose}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedPlayer || createRequestMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-send-request"
            >
              {createRequestMutation.isPending ? "Sending..." : "Send Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}