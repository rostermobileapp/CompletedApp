import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Search, Calendar } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";

interface SubstituteRequestModalProps {
  gameId: string;
  gameDate: string;
  leagueId: string;
  originalPlayerId: string;
  originalPlayerName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SubstituteRequestModal({ 
  gameId, 
  gameDate,
  leagueId,
  originalPlayerId,
  originalPlayerName,
  isOpen, 
  onClose 
}: SubstituteRequestModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all league players with availability status
  const { data: allPlayers = [], isLoading } = useQuery({
    queryKey: [`/api/players/all-with-availability/${gameDate}`, leagueId],
    queryFn: async () => {
      const response = await fetch(`/api/players/all-with-availability/${gameDate}?leagueId=${leagueId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch players');
      }
      return response.json();
    },
    enabled: isOpen && !!gameDate && !!leagueId,
  });

  // Create substitute request mutation
  const createRequestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer) throw new Error('No player selected');
      
      await apiRequest("POST", "/api/substitute-requests", {
        gameId,
        originalPlayerId,
        substitutePlayerId: selectedPlayer,
      });
    },
    onSuccess: () => {
      toast({
        title: "Substitute Request Sent",
        description: `Request sent for ${originalPlayerName}. The commissioner will review it.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      onClose();
      setSelectedPlayer(null);
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

  // Filter players based on search term and exclude the original player
  const filteredPlayers = allPlayers.filter((player: any) => {
    // Don't show the original player in the list
    if (player.id === originalPlayerId) return false;
    
    return `${player.firstName} ${player.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Sort players: available first, then scheduled
  const sortedPlayers = [...filteredPlayers].sort((a: any, b: any) => {
    if (a.isScheduled === b.isScheduled) return 0;
    return a.isScheduled ? 1 : -1;
  });

  const handleSubmit = () => {
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
    setSearchTerm("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" data-testid="substitute-request-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <UserPlus className="h-5 w-5" />
            Request Substitute for {originalPlayerName}
          </DialogTitle>
          <DialogDescription className="text-red-600 dark:text-red-400">
            Search and select a player to request as a substitute
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex flex-col flex-1 overflow-hidden">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for any player..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-players"
            />
          </div>

          {/* Players List */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border animate-pulse">
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
                        : "No players in this league"}
                    </p>
                  </div>
                ) : (
                  sortedPlayers.map((player: any) => (
                    <div 
                      key={player.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedPlayer === player.id 
                          ? 'border-red-400 dark:border-red-600 bg-red-100 dark:bg-red-900/50' 
                          : 'hover:bg-red-50 dark:hover:bg-red-950/30'
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
                            {player.isScheduled && (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Scheduled
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
                          <div className="h-4 w-4 rounded-full bg-red-600 flex items-center justify-center">
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
          <div className="flex justify-end gap-2 pt-4 border-t border-red-200 dark:border-red-800">
            <Button
              variant="outline"
              onClick={handleClose}
              className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedPlayer || createRequestMutation.isPending}
              className="bg-[#000000] text-[#fcfcfc] hover:bg-[#000000] hover:opacity-90"
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