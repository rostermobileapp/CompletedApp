import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Users, Calendar, Play, CheckCircle, Trash2, Clock, MapPin, Download, Edit3, Edit } from "lucide-react";
import jsPDF from 'jspdf';
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
import { CustomBracketBuilder } from "@/components/CustomBracketBuilder";
import type { Tournament, TournamentTeam, TournamentMatch, TournamentSettings } from "@shared/schema";
import { useState } from "react";
import { format } from "date-fns";

export default function TournamentDetail() {
  const [, params] = useRoute("/tournaments/:tournamentId");
  const [, setLocation] = useLocation();
  const tournamentId = params?.tournamentId;
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [isExportingSchedule, setIsExportingSchedule] = useState(false);
  const [isEditingBracket, setIsEditingBracket] = useState(false);

  const { data: tournament, isLoading: tournamentLoading } = useQuery<Tournament>({
    queryKey: ['/api/tournaments', tournamentId],
    enabled: !!tournamentId
  });
  
  // Derive locked state from tournament data - default to unlocked if no bracket exists yet
  const isBracketLocked = tournament?.format === 'custom_bracket' 
    ? ((tournament.settings as any)?.customBracket?.locked ?? false)
    : false;

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
      three_game_guarantee: '3-Game Guarantee',
      round_robin: 'Round Robin',
      round_robin_split: 'Round Robin + Playoffs',
      custom_bracket: 'Custom Bracket Builder'
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

  // Export schedule to PDF
  const exportScheduleToPDF = async () => {
    if (!matches || matches.length === 0) {
      toast({
        title: "No matches",
        description: "There are no matches to export",
        variant: "destructive"
      });
      return;
    }

    setIsExportingSchedule(true);
    
    try {
      // Create PDF in portrait mode, 8.5x11 inches
      const pageWidth = 8.5 * 72; // 612 points
      const pageHeight = 11 * 72; // 792 points
      const margin = 0.5 * 72; // 36 points
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [pageWidth, pageHeight]
      });

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const title = `${tournament?.name || 'Tournament'} - Schedule`;
      const titleWidth = doc.getTextWidth(title);
      doc.text(title, (pageWidth - titleWidth) / 2, margin + 20);

      // Subtitle with format
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const subtitle = getFormatLabel(tournament?.format || 'single_elimination');
      const subtitleWidth = doc.getTextWidth(subtitle);
      doc.text(subtitle, (pageWidth - subtitleWidth) / 2, margin + 35);

      const availableWidth = pageWidth - (2 * margin);
      const maxPageY = pageHeight - margin;
      let currentY = margin + 60;
      let currentPage = 1;

      // Helper to add new page
      const addNewPage = () => {
        doc.addPage();
        currentPage++;
        currentY = margin + 20;
        
        // Add page number
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${currentPage}`, pageWidth - margin - 40, margin + 10);
        
        currentY = margin + 30;
      };

      // Helper to check if content fits on page
      const fitsOnPage = (height: number): boolean => {
        return (currentY + height) <= maxPageY;
      };

      // Sort matches by match number
      const sortedMatches = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);

      // Draw each match
      sortedMatches.forEach((match, index) => {
        const matchHeight = 70; // Approximate height for match card
        
        // Check if we need a new page
        if (!fitsOnPage(matchHeight + 10)) {
          addNewPage();
        }

        const team1Name = getTeamName(match.team1Id);
        const team2Name = getTeamName(match.team2Id);

        // Match card background
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(1);
        doc.rect(margin, currentY, availableWidth, matchHeight, 'FD');

        // Blue accent bar
        doc.setFillColor(59, 130, 246);
        doc.rect(margin, currentY, availableWidth, 3, 'F');

        // Match number and round
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`Match ${match.matchNumber} - ${match.round}`, margin + 10, currentY + 20);

        // Teams
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${team1Name} vs ${team2Name}`, margin + 10, currentY + 38);

        // Date/Time
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        if (match.scheduledTime) {
          const dateStr = format(new Date(match.scheduledTime), "MMM d, yyyy 'at' h:mm a");
          doc.text(`⏰ ${dateStr}`, margin + 10, currentY + 52);
        } else {
          doc.text('⏰ Not scheduled', margin + 10, currentY + 52);
        }

        // Location
        if (match.location) {
          doc.text(`📍 ${match.location}`, margin + 10, currentY + 64);
        }

        // Status badge (top right)
        const statusX = pageWidth - margin - 80;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        
        if (match.status === 'completed') {
          doc.setTextColor(34, 197, 94); // green
          doc.text('COMPLETED', statusX, currentY + 20);
        } else if (match.status === 'pending') {
          doc.setTextColor(250, 204, 21); // yellow
          doc.text('PENDING', statusX, currentY + 20);
        } else {
          doc.setTextColor(100, 100, 100); // gray
          doc.text('SCHEDULED', statusX, currentY + 20);
        }

        currentY += matchHeight + 8; // Add spacing between matches
      });

      // Save PDF
      const filename = tournament?.name 
        ? `${tournament.name.replace(/[^a-z0-9]/gi, '_')}_schedule.pdf`
        : 'tournament_schedule.pdf';
      doc.save(filename);
      
      toast({
        title: "PDF exported",
        description: "Schedule has been downloaded successfully"
      });
      
    } catch (error) {
      console.error('Error exporting schedule PDF:', error);
      toast({
        title: "Error",
        description: "Failed to export PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExportingSchedule(false);
    }
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
                {/* Round Robin + Playoffs Seeding Button */}
                {tournament.format === 'round_robin_split' && (() => {
                  const roundRobinMatches = matches.filter(m => m.round === 'Round Robin');
                  const playoffMatches = matches.filter(m => m.round !== 'Round Robin');
                  const playoffsSeeded = playoffMatches.some(m => m.team1Id !== null && m.team2Id !== null);
                  const allRRCompleted = roundRobinMatches.length > 0 && roundRobinMatches.every(m => m.status === 'completed');
                  
                  return !playoffsSeeded && allRRCompleted && (
                    <Card className="border-primary/50">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Trophy className="h-5 w-5 text-primary" />
                          Seed Playoffs
                        </CardTitle>
                        <CardDescription>
                          All Round Robin games are complete. Seed the playoff bracket based on standings (wins/losses, with goals scored as tiebreaker).
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button 
                          onClick={async () => {
                            try {
                              await apiRequest('POST', `/api/tournaments/${tournamentId}/seed-playoffs`);
                              // Invalidate cache to refresh matches
                              queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'matches'] });
                              queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
                              toast({
                                title: "Success",
                                description: "Playoffs seeded successfully based on Round Robin standings"
                              });
                            } catch (error) {
                              console.error('Failed to seed playoffs:', error);
                              toast({
                                title: "Error",
                                description: "Failed to seed playoffs. Make sure Round Robin matches are completed.",
                                variant: "destructive"
                              });
                            }
                          }}
                          data-testid="button-seed-playoffs"
                        >
                          Seed Playoff Bracket Now
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })()}
                
                {tournament.format === 'custom_bracket' ? (
                  // Custom bracket builder embedded
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Custom Bracket</CardTitle>
                        <CardDescription>
                          {isBracketLocked && !isEditingBracket ? 'Your custom tournament structure is locked' : 'Design your own tournament bracket structure'}
                        </CardDescription>
                      </div>
                      {isBracketLocked && !isEditingBracket && (tournament.settings as any)?.customBracket?.matchups?.length > 0 && (
                        <Button
                          onClick={() => setIsEditingBracket(true)}
                          data-testid="button-unlock-bracket"
                          variant="outline"
                          className="gap-2"
                        >
                          <Edit className="h-4 w-4" />
                          Edit Bracket
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent>
                      <CustomBracketBuilder
                        teams={teams || []}
                        tournamentId={tournamentId}
                        tournament={tournament}
                        embeddable={true}
                        locked={isBracketLocked && !isEditingBracket}
                        onSave={async (bracketData) => {
                          try {
                            // Set locked to true when saving
                            const bracketWithLock = {
                              ...bracketData,
                              locked: true
                            };
                            
                            // Save bracket to backend
                            const updatedSettings = {
                              ...(tournament.settings as any || {}),
                              customBracket: bracketWithLock
                            };
                            
                            await apiRequest('PATCH', `/api/tournaments/${tournamentId}`, {
                              settings: updatedSettings
                            });
                            
                            // Refresh tournament data
                            await queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
                            
                            setIsEditingBracket(false);
                            
                            toast({
                              title: "Bracket saved",
                              description: "Your custom bracket has been saved and locked"
                            });
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: "Failed to save bracket",
                              variant: "destructive"
                            });
                          }
                        }}
                        onLock={() => setIsEditingBracket(false)}
                      />
                    </CardContent>
                  </Card>
                ) : (tournament.format === 'single_elimination' || 
                  tournament.format === 'double_elimination' || 
                  tournament.format === 'three_game_guarantee' ||
                  tournament.format === 'round_robin_split') ? (
                  // Bracket visualization for elimination formats and Round Robin + Playoffs
                  (() => {
                    // For Round Robin + Playoffs, only show playoff matches in the bracket
                    const bracketMatches = tournament.format === 'round_robin_split' 
                      ? matches.filter(m => m.round !== 'Round Robin')
                      : matches;
                    
                    const playoffRounds = tournament.format === 'round_robin_split'
                      ? rounds.filter(r => r !== 'Round Robin')
                      : rounds;

                    return (
                      <Card>
                        <CardHeader className="pt-[2px] pb-[2px]">
                          <CardTitle>
                            {tournament.format === 'round_robin_split' ? 'Playoff Bracket' : 'Tournament Bracket'}
                          </CardTitle>
                          <CardDescription>
                            {playoffRounds.length} round{playoffRounds.length !== 1 ? 's' : ''} • {bracketMatches.length} match{bracketMatches.length !== 1 ? 'es' : ''}
                            {tournament.format === 'round_robin_split' && (
                              <span className="block mt-1 text-xs">
                                Playoff seeding based on Round Robin record (wins/losses) with goals scored as tiebreaker
                              </span>
                            )}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <BracketView 
                            matches={bracketMatches} 
                            teams={teams || []} 
                            format={tournament.format}
                            settings={tournament.settings as TournamentSettings | undefined}
                            tournamentName={tournament.name}
                          />
                        </CardContent>
                      </Card>
                    );
                  })()
                ) : (
                  // Table view for pure round robin
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
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Match Schedule
                    </CardTitle>
                    <CardDescription>
                      View and manage all tournament matches
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportScheduleToPDF()}
                    disabled={isExportingSchedule}
                    data-testid="button-download-schedule-pdf"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {isExportingSchedule ? 'Exporting...' : 'Download PDF'}
                  </Button>
                </div>
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
