import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trophy, User, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TournamentMatch } from "@shared/schema";

interface Player {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl?: string;
  jerseyNumber?: string;
  position?: string;
}

interface TournamentMatchScoreModalProps {
  tournamentId: string;
  matchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCommissioner: boolean;
}

const scoreSchema = z.object({
  team1Score: z.coerce.number().min(0).nullable(),
  team2Score: z.coerce.number().min(0).nullable(),
});

type ScoreFormValues = z.infer<typeof scoreSchema>;

export default function TournamentMatchScoreModal({
  tournamentId,
  matchId,
  open,
  onOpenChange,
  isCommissioner
}: TournamentMatchScoreModalProps) {
  const { toast } = useToast();
  const [playerStats, setPlayerStats] = useState<Record<string, { goals: number; assists: number; penaltyMinutes: number }>>({});

  // Fetch match details with rosters
  const { data: matchDetails, isLoading } = useQuery<{
    match: TournamentMatch;
    team1: { id: string; name: string; roster: Player[] };
    team2: { id: string; name: string; roster: Player[] };
    existingStats: any[];
  }>({
    queryKey: ['/api/tournaments', tournamentId, 'matches', matchId, 'details'],
    enabled: open
  });

  const form = useForm<ScoreFormValues>({
    resolver: zodResolver(scoreSchema),
    defaultValues: {
      team1Score: null,
      team2Score: null,
    }
  });

  // Initialize form when match details load
  useEffect(() => {
    if (matchDetails?.match) {
      form.reset({
        team1Score: matchDetails.match.team1Score,
        team2Score: matchDetails.match.team2Score,
      });
    }
  }, [matchDetails, form]);

  // Initialize player stats from existing data
  useEffect(() => {
    if (matchDetails?.existingStats) {
      const stats: Record<string, { goals: number; assists: number; penaltyMinutes: number }> = {};
      matchDetails.existingStats.forEach((stat: any) => {
        stats[stat.userId] = {
          goals: 0,
          assists: 0,
          penaltyMinutes: 0
        };
      });
      setPlayerStats(stats);
    }
  }, [matchDetails?.existingStats]);

  const scoreMutation = useMutation({
    mutationFn: async (data: ScoreFormValues) => {
      if (!matchDetails) return;
      
      // Build player stats array for API
      const playerStatsArray = Object.entries(playerStats)
        .filter(([_, stats]) => stats.goals > 0 || stats.assists > 0 || stats.penaltyMinutes > 0)
        .map(([userId, stats]) => {
          // Determine which team this player is on
          const team1Player = matchDetails.team1.roster.find((p: Player) => p.userId === userId);
          const teamId = team1Player ? matchDetails.team1.id : matchDetails.team2.id;

          return {
            userId,
            teamId,
            goals: stats.goals,
            assists: stats.assists,
            penaltyMinutes: stats.penaltyMinutes
          };
        });

      await apiRequest('POST', `/api/tournaments/${tournamentId}/matches/${matchId}/score`, {
        team1Score: data.team1Score,
        team2Score: data.team2Score,
        playerStats: playerStatsArray
      });
    },
    onSuccess: () => {
      toast({
        title: "Match scored",
        description: "Scores and player stats have been saved successfully"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save match scores",
        variant: "destructive"
      });
    }
  });

  const updatePlayerStat = (userId: string, field: 'goals' | 'assists' | 'penaltyMinutes', value: number) => {
    setPlayerStats(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { goals: 0, assists: 0, penaltyMinutes: 0 }),
        [field]: value
      }
    }));
  };

  const renderPlayerRow = (player: Player) => {
    const stats = playerStats[player.userId] || { goals: 0, assists: 0, penaltyMinutes: 0 };
    const displayName = player.firstName && player.lastName 
      ? `${player.firstName} ${player.lastName}`
      : player.email;

    return (
      <div key={player.userId} className="grid grid-cols-6 gap-2 items-center py-2 border-b last:border-0">
        <div className="col-span-3 flex items-center gap-2">
          {player.profileImageUrl ? (
            <img src={player.profileImageUrl} alt={displayName} className="w-6 h-6 rounded-full" />
          ) : (
            <User className="w-6 h-6 text-muted-foreground" />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium">{displayName}</span>
            {player.jerseyNumber && (
              <span className="text-xs text-muted-foreground">#{player.jerseyNumber}</span>
            )}
          </div>
        </div>
        <Input
          type="number"
          min="0"
          value={stats.goals}
          onChange={(e) => updatePlayerStat(player.userId, 'goals', parseInt(e.target.value) || 0)}
          disabled={!isCommissioner}
          className="h-8 text-center"
          placeholder="0"
          data-testid={`input-goals-${player.userId}`}
        />
        <Input
          type="number"
          min="0"
          value={stats.assists}
          onChange={(e) => updatePlayerStat(player.userId, 'assists', parseInt(e.target.value) || 0)}
          disabled={!isCommissioner}
          className="h-8 text-center"
          placeholder="0"
          data-testid={`input-assists-${player.userId}`}
        />
        <Input
          type="number"
          min="0"
          value={stats.penaltyMinutes}
          onChange={(e) => updatePlayerStat(player.userId, 'penaltyMinutes', parseInt(e.target.value) || 0)}
          disabled={!isCommissioner}
          className="h-8 text-center"
          placeholder="0"
          data-testid={`input-pim-${player.userId}`}
        />
      </div>
    );
  };

  if (isLoading || !matchDetails) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loading...</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const { match, team1, team2 } = matchDetails;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {match.round} - Game #{match.matchNumber}
          </DialogTitle>
          <DialogDescription>
            {isCommissioner ? 'Enter match scores and player statistics' : 'View match details'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => scoreMutation.mutate(data))} className="space-y-4">
            {/* Team Scores */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{team1.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="team1Score"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Score</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                            disabled={!isCommissioner}
                            className="text-2xl font-bold text-center"
                            placeholder="-"
                            data-testid="input-team1-score"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{team2.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="team2Score"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Score</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                            disabled={!isCommissioner}
                            className="text-2xl font-bold text-center"
                            placeholder="-"
                            data-testid="input-team2-score"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Player Stats */}
            {isCommissioner && (
              <>
                {team1.roster && team1.roster.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{team1.name} - Player Stats</CardTitle>
                      <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground font-medium mt-2">
                        <div className="col-span-3">Player</div>
                        <div className="text-center">G</div>
                        <div className="text-center">A</div>
                        <div className="text-center">PIM</div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {team1.roster.map(renderPlayerRow)}
                    </CardContent>
                  </Card>
                )}

                {team2.roster && team2.roster.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{team2.name} - Player Stats</CardTitle>
                      <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground font-medium mt-2">
                        <div className="col-span-3">Player</div>
                        <div className="text-center">G</div>
                        <div className="text-center">A</div>
                        <div className="text-center">PIM</div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {team2.roster.map(renderPlayerRow)}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                <X className="h-4 w-4 mr-2" />
                {isCommissioner ? 'Cancel' : 'Close'}
              </Button>
              {isCommissioner && (
                <Button
                  type="submit"
                  disabled={scoreMutation.isPending}
                  data-testid="button-save-score"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {scoreMutation.isPending ? 'Saving...' : 'Save Scores'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
