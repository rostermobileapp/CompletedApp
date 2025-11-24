import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Users, Calendar, Play, CheckCircle, Trash2, Clock, MapPin, Download, Edit3, Edit, DollarSign, Copy, CheckCheck, Upload, UserPlus, UserCheck, UserX, User, ArrowRight } from "lucide-react";
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
import TournamentMatchScoreModal from "@/components/TournamentMatchScoreModal";
import { CustomBracketBuilder } from "@/components/CustomBracketBuilder";
import type { Tournament, TournamentTeam, TournamentMatch, TournamentSettings } from "@shared/schema";
import { useState } from "react";
import { format } from "date-fns";
import { usePermissions } from "@/context/SubscriptionContext";

export default function TournamentDetail() {
  const [, params] = useRoute("/tournaments/:tournamentId");
  const [, setLocation] = useLocation();
  const tournamentId = params?.tournamentId;
  const { toast } = useToast();
  const { canManageLeagueSpecific } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [isExportingSchedule, setIsExportingSchedule] = useState(false);
  const [isEditingBracket, setIsEditingBracket] = useState(false);
  const [copiedTournamentId, setCopiedTournamentId] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TournamentTeam | null>(null);

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

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/user']
  });

  // Fetch team players when a team is selected
  const { data: teamPlayers, isLoading: teamPlayersLoading, error: teamPlayersError } = useQuery<any[]>({
    queryKey: selectedTeam ? ['/api/tournaments', tournamentId, 'teams', selectedTeam.id, 'players'] : ['no-team-selected'],
    enabled: !!tournamentId && !!selectedTeam?.id,
  });

  // Check if user can manage this tournament (creator for standalone OR league commissioner for playoffs)
  // Define this before hooks that use it
  const canManageTournament = () => {
    if (!tournament || !currentUser) return false;
    if (tournament.type === 'standalone' && tournament.createdBy === currentUser.id) return true;
    if (tournament.type === 'season_playoff' && tournament.leagueId && canManageLeagueSpecific(tournament.leagueId)) return true;
    return false;
  };

  const { data: pendingParticipants } = useQuery<any[]>({
    queryKey: ['/api/tournaments', tournamentId, 'participants', 'pending'],
    enabled: !!tournamentId && !!tournament && !!currentUser && canManageTournament()
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/tournaments/${tournamentId}`);
      // apiRequest throws on error, so if we reach here, deletion succeeded
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', tournament?.leagueId, 'tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments/all'] });
      toast({
        title: "Tournament deleted",
        description: "The tournament has been deleted successfully"
      });
      // Navigate to appropriate tournaments page based on tournament type
      const redirectPath = tournament?.leagueId 
        ? `/leagues/${tournament.leagueId}/tournaments`
        : '/tournaments';
      setLocation(redirectPath);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete tournament",
        variant: "destructive"
      });
    }
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/tournaments/${tournamentId}/create-checkout`);
      return response as { url: string };
    },
    onSuccess: (data) => {
      console.log('💳 Stripe checkout response:', data);
      
      // Validate the URL before redirecting
      if (!data || !data.url) {
        console.error('❌ Invalid checkout response:', data);
        toast({
          title: "Error",
          description: "Invalid checkout session URL received",
          variant: "destructive"
        });
        return;
      }
      
      console.log('✅ Redirecting to Stripe checkout:', data.url);
      // Redirect to Stripe checkout
      window.location.href = data.url;
    },
    onError: (error: any) => {
      console.error('❌ Payment mutation error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to initiate payment",
        variant: "destructive"
      });
    }
  });

  const approveParticipantMutation = useMutation({
    mutationFn: async ({ participantId, tournamentTeamId }: { participantId: string; tournamentTeamId?: string }) => {
      return await apiRequest('PATCH', `/api/tournament-participants/${participantId}/approve`, { tournamentTeamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'participants', 'pending'] });
      toast({
        title: "Participant approved",
        description: "The participant has been approved successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve participant",
        variant: "destructive"
      });
    }
  });

  const rejectParticipantMutation = useMutation({
    mutationFn: async (participantId: string) => {
      return await apiRequest('PATCH', `/api/tournament-participants/${participantId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'participants', 'pending'] });
      toast({
        title: "Participant rejected",
        description: "The participant request has been rejected"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to reject participant",
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

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingCsv(true);
    try {
      const formData = new FormData();
      formData.append('playerFile', file);

      const response = await fetch(`/api/tournaments/${tournamentId}/players/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload CSV');
      }

      const result = await response.json();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'teams'] });
      
      toast({
        title: "CSV imported successfully",
        description: `Imported ${result.teamsCreated || 0} teams and ${result.playersImported || 0} players`
      });

      // Reset file input
      event.target.value = '';
      setCsvFile(null);
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error?.message || "Failed to import CSV",
        variant: "destructive"
      });
    } finally {
      setIsUploadingCsv(false);
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
            onClick={() => {
              const path = tournament.leagueId 
                ? `/leagues/${tournament.leagueId}/tournaments`
                : '/tournaments';
              setLocation(path);
            }}
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
                  <Badge 
                    variant="outline" 
                    className="font-mono font-semibold text-xs cursor-pointer hover:bg-muted"
                    onClick={() => {
                      navigator.clipboard.writeText(tournament.uniqueTournamentId || '');
                      setCopiedTournamentId(true);
                      setTimeout(() => setCopiedTournamentId(false), 2000);
                      toast({
                        title: "Copied!",
                        description: "Tournament ID copied to clipboard"
                      });
                    }}
                    data-testid="badge-tournament-id"
                  >
                    {copiedTournamentId ? <CheckCheck className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    ID: {tournament.uniqueTournamentId}
                  </Badge>
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

      {/* Payment Status Section - Commissioner Only */}
      {tournament && canManageTournament() && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pb-6">
          <Card className={tournament.paymentStatus === 'paid' ? 'border-green-500/50' : 'border-amber-500/50'}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Tournament Payment
                  </CardTitle>
                  <CardDescription>
                    {tournament.paymentStatus === 'paid' 
                      ? 'Payment completed - players can now access this tournament'
                      : 'Complete payment to enable player access'}
                  </CardDescription>
                </div>
                {tournament.paymentStatus === 'paid' ? (
                  <Badge variant="default" className="bg-green-600 flex items-center gap-1" data-testid="badge-payment-paid">
                    <CheckCheck className="h-3 w-3" />
                    Paid
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500 text-amber-600 flex items-center gap-1" data-testid="badge-payment-pending">
                    <Clock className="h-3 w-3" />
                    Pending
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                  <div>
                    <p className="text-sm text-muted-foreground">Tournament ID</p>
                    <p className="text-lg font-semibold font-mono" data-testid="text-tournament-id">{tournament.uniqueTournamentId}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(tournament.uniqueTournamentId || '');
                      setCopiedTournamentId(true);
                      setTimeout(() => setCopiedTournamentId(false), 2000);
                      toast({
                        title: "Copied!",
                        description: "Tournament ID copied to clipboard"
                      });
                    }}
                    data-testid="button-copy-id"
                  >
                    {copiedTournamentId ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                  <div>
                    <p className="text-sm text-muted-foreground">Teams</p>
                    <p className="text-lg font-semibold" data-testid="text-team-count">{teams?.length || 0}</p>
                  </div>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Amount</p>
                    <p className="text-lg font-semibold" data-testid="text-payment-amount">
                      ${((tournament.paymentAmount || 0) / 100).toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              {tournament.paymentStatus !== 'paid' && (
                <div className="pt-2">
                  <Button
                    onClick={() => paymentMutation.mutate()}
                    disabled={paymentMutation.isPending || (teams?.length || 0) === 0}
                    className="w-full md:w-auto"
                    data-testid="button-pay-now"
                  >
                    {paymentMutation.isPending ? 'Processing...' : `Pay $${((tournament.paymentAmount || 0) / 100).toFixed(2)} Now`}
                  </Button>
                  {(teams?.length || 0) === 0 && (
                    <p className="text-sm text-muted-foreground mt-2">Add teams to calculate payment amount</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

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
                            throw error; // Rethrow so CustomBracketBuilder knows save failed
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
                            tournamentId={tournamentId || ''}
                            isCommissioner={tournament.leagueId ? canManageLeagueSpecific(tournament.leagueId) : false}
                            tournamentType={tournament.type}
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
          <TabsContent value="teams" className="space-y-6">
            {/* CSV Upload Section - Tournament Manager Only */}
            {tournament && canManageTournament() && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Import Teams & Players
                  </CardTitle>
                  <CardDescription>
                    Upload a CSV file to bulk import teams and players to the tournament
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-md">
                    <p className="text-sm font-medium mb-2">CSV Template Format:</p>
                    <p className="text-sm text-muted-foreground mb-1">
                      <span className="font-medium">Required:</span> Player Full Name, Team Name
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">
                      <span className="font-medium">Optional:</span> Email, Phone Number, Jersey #, Position, Skill Level, Player Type (Goalie/Skater)
                    </p>
                    <p className="text-xs text-muted-foreground italic mb-3">
                      Teams will be auto-created if they don't exist. User accounts will be created for players with emails.
                    </p>
                    <a
                      href="/player-import-template.csv"
                      download="player-import-template.csv"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      data-testid="link-download-template"
                    >
                      <Download className="h-4 w-4" />
                      Download CSV Template
                    </a>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvUpload}
                      disabled={isUploadingCsv}
                      className="hidden"
                      id="csv-upload"
                      data-testid="input-csv-upload"
                    />
                    <label htmlFor="csv-upload">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploadingCsv}
                        onClick={() => document.getElementById('csv-upload')?.click()}
                        data-testid="button-csv-upload"
                        className="w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {isUploadingCsv ? 'Uploading...' : 'Upload CSV'}
                      </Button>
                    </label>
                    {csvFile && (
                      <p className="text-sm text-muted-foreground">
                        Selected: {csvFile.name}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pending Participants - Tournament Manager Only */}
            {tournament && canManageTournament() && pendingParticipants && pendingParticipants.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Pending Join Requests
                  </CardTitle>
                  <CardDescription>
                    {pendingParticipants.length} player{pendingParticipants.length !== 1 ? 's' : ''} waiting for approval
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingParticipants.map((participant: any) => (
                      <Card key={participant.id} data-testid={`card-participant-${participant.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <div className="font-medium" data-testid={`text-participant-name-${participant.id}`}>
                                {participant.user.firstName} {participant.user.lastName}
                              </div>
                              <div className="text-sm text-muted-foreground" data-testid={`text-participant-email-${participant.id}`}>
                                {participant.user.email}
                              </div>
                              {participant.message && (
                                <div className="text-sm text-muted-foreground mt-2">
                                  Message: {participant.message}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                Requested {format(new Date(participant.joinedAt), 'MMM d, yyyy')}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveParticipantMutation.mutate({ participantId: participant.id })}
                                disabled={approveParticipantMutation.isPending}
                                data-testid={`button-approve-${participant.id}`}
                              >
                                <UserCheck className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectParticipantMutation.mutate(participant.id)}
                                disabled={rejectParticipantMutation.isPending}
                                data-testid={`button-reject-${participant.id}`}
                              >
                                <UserX className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Teams List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {selectedTeam ? selectedTeam.teamName : 'Participating Teams'}
                    </CardTitle>
                    <CardDescription>
                      {selectedTeam 
                        ? `${teamPlayers?.length || 0} player${teamPlayers?.length !== 1 ? 's' : ''}`
                        : `${teams?.length || 0} team${teams?.length !== 1 ? 's' : ''} registered`
                      }
                    </CardDescription>
                  </div>
                  {selectedTeam && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTeam(null)}
                      data-testid="button-back-to-teams"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back to Teams
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedTeam ? (
                  // Teams List View
                  teams && teams.length > 0 ? (
                    <div className="space-y-3">
                      {teams.map((team, index) => {
                        // Count players for this team (we don't have this data in teams list, but we can show seed)
                        return (
                          <div
                            key={team.id}
                            className="flex items-center justify-between p-4 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => setSelectedTeam(team)}
                            data-testid={`team-${team.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="font-medium text-base" data-testid={`text-team-name-${team.id}`}>
                                  {team.teamName}
                                </p>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <p>Seed: #{team.seed || index + 1}</p>
                                <p>Click to view players</p>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No teams added yet</p>
                      {tournament && canManageTournament() && (
                        <p className="text-sm mt-1">Upload a CSV file to add teams and players</p>
                      )}
                    </div>
                  )
                ) : (
                  // Team Detail View - Show Players in Selected Team
                  teamPlayersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-sm text-muted-foreground">Loading players...</p>
                      </div>
                    </div>
                  ) : teamPlayersError ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                      <p className="text-destructive font-medium">Error loading players</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {(teamPlayersError as any)?.message || "Failed to fetch team players"}
                      </p>
                    </div>
                  ) : teamPlayers && teamPlayers.length > 0 ? (
                    <div className="space-y-3">
                      {teamPlayers.map((player: any) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-3 bg-background rounded-lg border hover:bg-muted/50 transition-colors"
                          data-testid={`team-player-${player.userId}`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            {/* Profile Picture */}
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                              {player.profileImageUrl ? (
                                <img
                                  src={player.profileImageUrl}
                                  alt={`${player.lastName}, ${player.firstName}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-6 h-6 text-muted-foreground" />
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">
                                  {player.lastName && player.firstName 
                                    ? `${player.lastName}, ${player.firstName}`
                                    : player.fullName || player.email
                                  }
                                </p>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <p>{player.email}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No players assigned to this team yet</p>
                      <p className="text-sm text-muted-foreground mt-2">Players will appear here once they join the tournament</p>
                    </div>
                  )
                )}
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
                                    {tournament && tournament.leagueId && canManageLeagueSpecific(tournament.leagueId) && (
                                      <Button 
                                        size="sm" 
                                        variant="default" 
                                        onClick={() => setScoringMatchId(match.id)}
                                        data-testid={`button-score-match-${match.matchNumber}`}
                                      >
                                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                                        Score
                                      </Button>
                                    )}
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

      {/* Tournament Match Score Modal */}
      {scoringMatchId && tournamentId && (
        <TournamentMatchScoreModal
          tournamentId={tournamentId}
          matchId={scoringMatchId}
          open={!!scoringMatchId}
          onOpenChange={(open) => !open && setScoringMatchId(null)}
          isCommissioner={!!tournament && !!tournament.leagueId && canManageLeagueSpecific(tournament.leagueId)}
        />
      )}
    </div>
  );
}
