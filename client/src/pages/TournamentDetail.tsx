import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Users, Calendar, Play, CheckCircle, Trash2, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import BracketView from "@/components/BracketView";
import MatchEditDialog from "@/components/MatchEditDialog";
import type { Tournament, TournamentTeam, TournamentMatch } from "@shared/schema";
import { useState } from "react";
import { format } from "date-fns";

export default function TournamentDetail() {
  const [, params] = useRoute("/tournaments/:tournamentId");
  const [, setLocation] = useLocation();
  const tournamentId = params?.tournamentId;
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);

  const { data: tournament, isLoading: tournamentLoading } = useQuery<Tournament>({
    queryKey: ['/api/tournaments', tournamentId],
    enabled: !!tournamentId
  });

  const { data: teams, isLoading: teamsLoading } = useQuery<TournamentTeam[]>({
    queryKey: ['/api/tournaments', tournamentId, 'teams'],
    enabled: !!tournamentId
  });

  const { data: matches, isLoading: matchesLoading } = useQuery<TournamentMatch[]>({
    queryKey: ['/api/tournaments', tournamentId, 'matches'],
    enabled: !!tournamentId
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/tournaments/${tournamentId}`);
      // apiRequest throws on error, so if we reach here, deletion succeeded
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', tournament?.leagueId, 'tournaments'] });
      toast({
        title: "Tournament deleted",
        description: "The tournament has been deleted successfully"
      });
      setLocation(`/leagues/${tournament?.leagueId}/tournaments`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete tournament",
        variant: "destructive"
      });
    }
  });

  const isLoading = tournamentLoading || teamsLoading || matchesLoading;

  const getFormatLabel = (format: Tournament['format']) => {
    const labels: Record<Tournament['format'], string> = {
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      triple_elimination: 'Triple Elimination',
      three_game_guarantee: '3-Game Guarantee',
      consolation: 'Consolation Tournament',
      compass_draw: 'Compass Draw',
      round_robin: 'Round Robin',
      round_robin_split: 'Round Robin + Playoffs'
    };
    return labels[format];
  };

  const getStatusBadge = (status: Tournament['status']) => {
    const variants: Record<Tournament['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline', text: string, icon: any }> = {
      draft: { variant: 'outline', text: 'Draft', icon: Calendar },
      active: { variant: 'default', text: 'Active', icon: Play },
      completed: { variant: 'secondary', text: 'Completed', icon: CheckCircle }
    };
    const config = variants[status];
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1" data-testid={`badge-status-${status}`}>
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  // Group matches by round
  const matchesByRound = matches?.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<string, TournamentMatch[]>) || {};

  const rounds = Object.keys(matchesByRound).sort();

  // Get team name by ID (teamId here is actually tournamentTeams.id)
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "TBD";
    const team = teams?.find(t => t.id === teamId);
    return team?.teamName || "TBD";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="p-12 text-center">
              <h3 className="text-xl font-semibold mb-2">Tournament Not Found</h3>
              <p className="text-muted-foreground">This tournament could not be found.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/leagues/${tournament.leagueId}/tournaments`)}
            className="mb-2 -ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Button>
          
          <div className="space-y-2">
            {/* Title, Badges, and Actions - Single Row */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-tournament-name">
                  <Trophy className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                  {tournament.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(tournament.status)}
                  <Badge variant="outline" className="font-normal text-xs">
                    {tournament.type === 'season_playoff' ? 'Season Playoff' : 'Standalone'}
                  </Badge>
                  <Badge variant="outline" className="font-normal text-xs">
                    {getFormatLabel(tournament.format)}
                  </Badge>
                  {teams && teams.length > 0 && (
                    <Badge variant="secondary" className="font-normal text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {teams.length} {teams.length === 1 ? 'team' : 'teams'}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                {tournament.status === 'draft' && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLocation(`/tournaments/${tournamentId}/edit`)}
                      data-testid="button-edit"
                    >
                      Edit Settings
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      data-testid="button-delete"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Description - Optional Second Line */}
            {tournament.description && (
              <p className="text-sm text-muted-foreground max-w-3xl" data-testid="text-tournament-description">
                {tournament.description}
              </p>
            )}
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 pt-[2px] pb-[2px] pl-[8px] pr-[8px]">
        <Tabs defaultValue="bracket" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 md:w-auto">
            <TabsTrigger value="bracket" data-testid="tab-bracket">Bracket</TabsTrigger>
            <TabsTrigger value="teams" data-testid="tab-teams">Teams</TabsTrigger>
            <TabsTrigger value="schedule" data-testid="tab-schedule">Schedule</TabsTrigger>
          </TabsList>

          {/* Bracket Tab */}
          <TabsContent value="bracket" className="space-y-4">
            {matches && matches.length > 0 ? (
              <div className="space-y-6">
                {(tournament.format === 'single_elimination' || 
                  tournament.format === 'double_elimination' || 
                  tournament.format === 'triple_elimination' || 
                  tournament.format === 'three_game_guarantee' ||
                  tournament.format === 'consolation' ||
                  tournament.format === 'compass_draw') ? (
                  // Bracket visualization for elimination formats
                  (<Card>
                    <CardHeader className="pt-[2px] pb-[2px]">
                      <CardTitle>Tournament Bracket</CardTitle>
                      <CardDescription>
                        {rounds.length} round{rounds.length !== 1 ? 's' : ''} • {matches.length} match{matches.length !== 1 ? 'es' : ''}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BracketView 
                        matches={matches} 
                        teams={teams || []} 
                        format={tournament.format}
                        settings={tournament.settings || { bracketType: 'seeded', showSeedNumbers: true, showGameNumbers: false }}
                      />
                    </CardContent>
                  </Card>)
                ) : (
                  // Table view for round robin
                  (<Card>
                    <CardHeader>
                      <CardTitle>Round Robin Schedule</CardTitle>
                      <CardDescription>
                        {matches.length} match{matches.length !== 1 ? 'es' : ''}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {matches.map((match) => (
                          <Card key={match.id} data-testid={`card-match-${match.matchNumber}`}>
                            <CardContent className="p-4">
                              <div className="flex flex-col md:flex-row md:items-center gap-4">
                                <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                                  <div className="text-right font-medium" data-testid={`text-team1-${match.matchNumber}`}>
                                    {getTeamName(match.team1Id)}
                                  </div>
                                  <div className="text-center">
                                    {match.team1Score !== null && match.team2Score !== null ? (
                                      <span className="font-bold text-lg">
                                        {match.team1Score} - {match.team2Score}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">vs</span>
                                    )}
                                  </div>
                                  <div className="font-medium" data-testid={`text-team2-${match.matchNumber}`}>
                                    {getTeamName(match.team2Id)}
                                  </div>
                                </div>
                                <Badge variant={match.status === 'completed' ? 'default' : 'outline'}>
                                  {match.status}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>)
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Trophy className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Matches Yet</h3>
                  <p className="text-muted-foreground">
                    Matches will appear here once the tournament bracket is generated
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Participating Teams
                </CardTitle>
                <CardDescription>
                  {teams?.length || 0} team{teams?.length !== 1 ? 's' : ''} registered
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {teams?.map((team, index) => (
                    <Card key={team.id} data-testid={`card-team-${team.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                              {team.seed || index + 1}
                            </div>
                            <span className="font-medium" data-testid={`text-team-name-${team.id}`}>
                              {team.teamName}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Match Schedule
                </CardTitle>
                <CardDescription>
                  View and manage all tournament matches
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {matches && matches.length > 0 ? (
                    matches
                      .sort((a, b) => a.matchNumber - b.matchNumber)
                      .map((match) => {
                        const team1Name = getTeamName(match.team1Id);
                        const team2Name = getTeamName(match.team2Id);
                        
                        return (
                          <Card key={match.id} data-testid={`card-schedule-${match.matchNumber}`}>
                            <CardContent className="p-4">
                              <div className="flex flex-col gap-3">
                                {/* Header Row */}
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="font-semibold">
                                      Match {match.matchNumber} - {match.round}
                                    </div>
                                    <div className="text-sm font-medium">
                                      {team1Name} vs {team2Name}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={match.status === 'completed' ? 'default' : 'outline'}>
                                      {match.status}
                                    </Badge>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => setEditingMatch(match)}
                                      data-testid={`button-edit-match-${match.matchNumber}`}
                                    >
                                      Edit
                                    </Button>
                                  </div>
                                </div>
                                
                                {/* Schedule Info Row */}
                                <div className="flex flex-col md:flex-row gap-3 text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-4 w-4" />
                                    {match.scheduledTime ? (
                                      <span data-testid={`text-scheduled-time-${match.matchNumber}`}>
                                        {format(new Date(match.scheduledTime), "MMM d, yyyy 'at' h:mm a")}
                                      </span>
                                    ) : (
                                      <span className="italic">Not scheduled</span>
                                    )}
                                  </div>
                                  {match.location && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="h-4 w-4" />
                                      <span data-testid={`text-location-${match.matchNumber}`}>{match.location}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No matches scheduled yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tournament?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{tournament?.name}"? This action cannot be undone.
              All matches, teams, and tournament data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Tournament"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Match Edit Dialog */}
      {editingMatch && (
        <MatchEditDialog
          match={editingMatch}
          open={!!editingMatch}
          onOpenChange={(open) => !open && setEditingMatch(null)}
          team1Name={getTeamName(editingMatch.team1Id)}
          team2Name={getTeamName(editingMatch.team2Id)}
        />
      )}
    </div>
  );
}
