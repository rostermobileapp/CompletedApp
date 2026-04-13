import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle, Trophy, Users, Info, Upload, Plus, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import Papa from "papaparse";

const formSchema = z.object({
  type: z.enum(["season_playoff", "standalone"]),
  leagueId: z.string().optional(),
  seasonId: z.string().optional(),
  name: z.string().min(1, "Tournament name is required"),
  format: z.enum(["single_elimination", "double_elimination", "three_game_guarantee", "round_robin", "round_robin_split", "custom_bracket"]),
  description: z.string().optional(),
  accessStartDate: z.string().optional(),
  accessEndDate: z.string().optional(),
  teams: z.array(z.object({
    name: z.string().min(1, "Team name is required")
  })).optional(),
  teamIds: z.array(z.string()).optional()
}).refine((data) => {
  // Season playoffs require leagueId and seasonId
  if (data.type === "season_playoff") {
    return data.leagueId && data.seasonId;
  }
  return true;
}, {
  message: "Please select a league and season for playoff tournaments",
  path: ["leagueId"]
}).refine((data) => {
  // Validate teams based on type
  if (data.type === "season_playoff") {
    // For season playoffs, need teamIds with min 3
    return data.teamIds && data.teamIds.length >= 3 && data.teamIds.length <= 128;
  } else {
    // For standalone, need teams with min 3
    return data.teams && data.teams.length >= 3 && data.teams.length <= 128;
  }
}, {
  message: "Please select at least 3 teams (maximum 128)",
  path: ["teams"]
});

type FormData = z.infer<typeof formSchema>;

type Team = {
  name: string;
  playerCount?: number;
};

export default function TournamentCreateStandalone() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [csvPlayerData, setCsvPlayerData] = useState<any[] | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "standalone",
      leagueId: undefined,
      seasonId: undefined,
      name: "",
      format: "single_elimination",
      description: "",
      accessStartDate: "",
      accessEndDate: "",
      teams: [],
      teamIds: []
    }
  });

  const watchedType = form.watch("type");
  const watchedLeagueId = form.watch("leagueId");
  const watchedFormat = form.watch("format");

  // Fetch leagues the user can manage (for season playoffs)
  const { data: leagues } = useQuery<any[]>({
    queryKey: ['/api/leagues/manageable'],
    enabled: watchedType === "season_playoff"
  });

  // Fetch seasons for selected league
  const { data: seasons } = useQuery<any[]>({
    queryKey: ['/api/leagues', watchedLeagueId, 'seasons'],
    enabled: !!watchedLeagueId && watchedType === "season_playoff"
  });

  // Fetch teams for selected league
  const { data: leagueTeams } = useQuery<any[]>({
    queryKey: ['/api/leagues', watchedLeagueId, 'teams'],
    enabled: !!watchedLeagueId && watchedType === "season_playoff"
  });

  // Create tournament mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Determine team count and prepare payload
      const isSeasonPlayoff = data.type === "season_playoff";
      const numTeams = isSeasonPlayoff 
        ? (data.teamIds?.length || 0)
        : (data.teams?.length || 0);

      // Step 1: Create tournament
      const response = await apiRequest('POST', `/api/tournaments`, {
        leagueId: isSeasonPlayoff ? (data.leagueId || null) : null,
        name: data.name,
        type: data.type,
        seasonId: isSeasonPlayoff ? (data.seasonId || null) : null,
        format: data.format,
        numTeams: numTeams,
        description: data.description || null,
        accessStartDate: data.accessStartDate || null,
        accessEndDate: data.accessEndDate || null,
        settings: {
          bracketType: "seeded",
          showSeedNumbers: true,
          showGameNumbers: false
        }
      });

      const tournament = await response.json();

      // Step 2: Add teams and generate bracket
      let teamData;
      if (isSeasonPlayoff && data.teamIds && leagueTeams) {
        // Season playoff: use selected team IDs from league
        teamData = data.teamIds.map((teamId, index) => {
          const team = leagueTeams.find((t: any) => t.id === teamId);
          return {
            teamId: team?.id,
            teamName: team?.name,
            seed: index + 1,
            wins: 0,
            losses: 0
          };
        });
      } else {
        // Standalone: use manually entered teams
        teamData = (data.teams || []).map((team, index) => ({
          teamName: team.name,
          seed: index + 1,
          wins: 0,
          losses: 0
        }));
      }

      try {
        await apiRequest('POST', `/api/tournaments/${tournament.id}/generate-bracket`, {
          teams: teamData,
          format: data.format,
          settings: {
            byePolicy: numTeams % 2 === 1 ? 'play_in_game' : 'top_seed_bye'
          }
        });
      } catch (bracketError: any) {
        let errorMsg = 'Unknown error';
        try {
          if (bracketError instanceof Response) {
            const errorData = await bracketError.json();
            errorMsg = errorData.message || errorMsg;
          } else if (bracketError.message) {
            errorMsg = bracketError.message;
          }
        } catch {
          // Error parsing failed, use default
        }
        throw new Error(`Bracket generation failed: ${errorMsg}`);
      }

      // Step 3: Import players if CSV data was uploaded (standalone only)
      console.log('🔍 Player import check:', {
        csvPlayerData,
        hasData: csvPlayerData && csvPlayerData.length > 0,
        isSeasonPlayoff
      });
      
      if (csvPlayerData && csvPlayerData.length > 0 && !isSeasonPlayoff) {
        try {
          console.log('📤 Starting player import for', csvPlayerData.length, 'players');
          
          // Get auth token
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            console.error('❌ No authentication token available');
            throw new Error('Not authenticated');
          }
          
          // Convert CSV data back to CSV format for upload
          const csvContent = Papa.unparse(csvPlayerData);
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const formData = new FormData();
          formData.append('playerFile', blob, 'players.csv');

          const response = await fetch(`/api/tournaments/${tournament.id}/players/import`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            },
            body: formData,
            credentials: 'include'
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Player import failed:', errorData);
            // Don't throw - tournament was created successfully, just log the error
          } else {
            console.log('✅ Player import succeeded');
          }
        } catch (playerImportError) {
          console.error('❌ Player import error:', playerImportError);
          // Don't throw - tournament was created successfully
        }
      } else {
        console.log('⏭️ Skipping player import');
      }

      return tournament;
    },
    onSuccess: (tournament, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] });
      
      if (variables.format === 'custom_bracket') {
        toast({
          title: "Tournament created",
          description: "Now you can build your custom bracket"
        });
        setLocation(`/tournaments/${tournament.id}/custom-builder`);
      } else {
        toast({
          title: "Tournament created",
          description: "Your tournament has been created successfully"
        });
        setLocation(`/tournaments/${tournament.id}`);
      }
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to create tournament";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    // Ensure the React teams state is used — the form field may not be
    // registered so its value can be lost between steps.
    const dataWithTeams: FormData = {
      ...data,
      teams: data.type === "standalone" ? teams.map(t => ({ name: t.name })) : data.teams
    };
    createMutation.mutate(dataWithTeams);
  };

  const nextStep = async () => {
    if (step === 1) {
      const isValid = await form.trigger(["name", "format", "description"] as any);
      if (isValid) {
        setStep(step + 1);
      }
      return;
    }

    if (step === 2) {
      if (watchedType === "season_playoff") {
        const isValid = await form.trigger(["teamIds"] as any);
        if (!isValid) {
          toast({
            title: "Validation Error",
            description: "Please select at least 3 teams",
            variant: "destructive"
          });
          return;
        }
      } else {
        // For standalone type, validate against the React state directly
        if (teams.length < 3) {
          toast({
            title: "Not enough teams",
            description: "Please add at least 3 teams",
            variant: "destructive"
          });
          return;
        }
        if (teams.length > 128) {
          toast({
            title: "Too many teams",
            description: "Maximum 128 teams allowed",
            variant: "destructive"
          });
          return;
        }
        // Sync state to form field before advancing
        form.setValue('teams', teams.map(t => ({ name: t.name })), { shouldValidate: true });
      }
      setStep(step + 1);
    }
  };

  const getFormatLabel = (format: string) => {
    const labels: Record<string, string> = {
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      three_game_guarantee: '3-Game Guarantee',
      round_robin: 'Round Robin',
      round_robin_split: 'Round Robin + Playoffs',
      custom_bracket: 'Custom Bracket Builder'
    };
    return labels[format] || format;
  };

  // CSV Upload Handler
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const teamPlayerCount = new Map<string, number>();
        const playersData: any[] = [];
        let hasPlayerData = false;

        // Get headers and find the team name column
        const headers = results.meta.fields || [];
        
        // Find team name column (case-insensitive, flexible matching)
        const teamColumn = headers.find(h => 
          h && h.toLowerCase().replace(/[_\s]/g, '').includes('team')
        );

        // Check if CSV contains player information columns
        const hasPlayerColumns = headers.some(h => 
          h && (h.toLowerCase().includes('player') || h.toLowerCase().includes('email') || h.toLowerCase().includes('jersey'))
        );

        console.log('CSV Headers:', headers);
        console.log('Team Column:', teamColumn);

        results.data.forEach((row: any) => {
          // Try to find team name from any column containing "team"
          let teamName = '';
          if (teamColumn) {
            teamName = row[teamColumn] || '';
          } else {
            // Fallback: try common variations
            teamName = row['Team Name'] || row['team_name'] || row['TeamName'] || row['Team'] || row['team'] || '';
          }

          if (teamName && teamName.trim()) {
            const normalizedTeamName = teamName.trim();
            
            // Always ensure team exists in the map
            if (!teamPlayerCount.has(normalizedTeamName)) {
              teamPlayerCount.set(normalizedTeamName, 0);
            }
            
            // If player data exists, store it and count it
            if (hasPlayerColumns) {
              // Find player name column (flexible matching with asterisk support)
              const playerNameColumn = headers.find(h => 
                h && h.toLowerCase().replace(/[_\s*]/g, '').includes('playerfullname')
              );
              const playerName = playerNameColumn ? (row[playerNameColumn] || '') : '';
              
              if (playerName && playerName.trim()) {
                hasPlayerData = true;
                playersData.push(row);
                // Increment player count for this team
                teamPlayerCount.set(normalizedTeamName, teamPlayerCount.get(normalizedTeamName)! + 1);
              }
            }
          }
        });

        // Create teams with player counts
        const newTeams = Array.from(teamPlayerCount.entries()).map(([name, playerCount]) => ({
          name,
          playerCount
        }));
        
        setTeams(newTeams);
        form.setValue('teams', newTeams);

        // Store player data if present
        if (hasPlayerData && playersData.length > 0) {
          setCsvPlayerData(playersData);
          toast({
            title: "CSV imported",
            description: `Successfully imported ${newTeams.length} unique teams and ${playersData.length} players`
          });
        } else {
          setCsvPlayerData(null);
          toast({
            title: "CSV imported",
            description: `Successfully imported ${newTeams.length} unique teams`
          });
        }

        // Reset file input
        event.target.value = '';
      },
      error: (error) => {
        toast({
          title: "Import failed",
          description: error.message,
          variant: "destructive"
        });
      }
    });
  };

  // Manual Team Addition
  const addTeam = () => {
    if (!newTeamName.trim()) {
      toast({
        title: "Team name required",
        description: "Please enter a team name",
        variant: "destructive"
      });
      return;
    }

    // Check for duplicates
    if (teams.some(t => t.name.toLowerCase() === newTeamName.trim().toLowerCase())) {
      toast({
        title: "Duplicate team",
        description: "A team with this name already exists",
        variant: "destructive"
      });
      return;
    }

    const newTeam: Team = { name: newTeamName.trim() };
    const updatedTeams = [...teams, newTeam];
    setTeams(updatedTeams);
    form.setValue('teams', updatedTeams);
    setNewTeamName("");

    toast({
      title: "Team added",
      description: `${newTeam.name} has been added`
    });
  };

  const removeTeam = (index: number) => {
    const updatedTeams = teams.filter((_, i) => i !== index);
    setTeams(updatedTeams);
    form.setValue('teams', updatedTeams);
  };

  const downloadCsvTemplate = () => {
    const headers = ['Team Name*', 'Player Full Name', 'Email', 'Phone Number', 'Jersey #', 'Position', 'Skill Level', 'Player Type'];
    const exampleRows = [
      ['Team Alpha', 'John Smith', 'john@example.com', '555-123-4567', '10', 'Forward', 'Intermediate', 'Skater'],
      ['Team Alpha', 'Jane Doe', 'jane@example.com', '555-234-5678', '1', 'Goalie', 'Advanced', 'Goalie'],
      ['Team Beta', 'Mike Johnson', 'mike@example.com', '555-345-6789', '22', 'Defense', 'Beginner', 'Skater'],
    ];
    
    const csvContent = [headers, ...exampleRows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tournament-teams-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(`/tournaments`)}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
                <Trophy className="h-7 w-7 text-primary" />
                Create Tournament
              </h1>
              <p className="text-sm text-muted-foreground">
                Step {step} of 3
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Step 1: Basic Information */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Tournament Details
                  </CardTitle>
                  <CardDescription>
                    Set up the basic information for your tournament
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-tournament-type">
                              <SelectValue placeholder="Select tournament type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="standalone">Standalone Tournament</SelectItem>
                            <SelectItem value="season_playoff">Season Playoff</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Season playoffs are tied to your league season, standalone tournaments are independent events
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedType === "season_playoff" && (
                    <>
                      <FormField
                        control={form.control}
                        name="leagueId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>League</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-league">
                                  <SelectValue placeholder="Select a league" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {leagues && leagues.length > 0 ? (
                                  leagues.map((league: any) => (
                                    <SelectItem key={league.id} value={league.id.toString()}>
                                      {league.name}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="_none" disabled>No leagues available</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Select which league this tournament is for
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {watchedLeagueId && (
                        <FormField
                          control={form.control}
                          name="seasonId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Season</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-season">
                                    <SelectValue placeholder="Select a season" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {seasons && seasons.length > 0 ? (
                                    seasons.map((season: any) => (
                                      <SelectItem key={season.id} value={season.id}>
                                        {season.name}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="_none" disabled>No seasons available</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Select which season this playoff is for
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </>
                  )}

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Summer Showdown 2025"
                            {...field}
                            data-testid="input-tournament-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="format"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Format</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-tournament-format">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="single_elimination">Single Elimination</SelectItem>
                            <SelectItem value="double_elimination">Double Elimination</SelectItem>
                            <SelectItem value="three_game_guarantee">3-Game Guarantee</SelectItem>
                            <SelectItem value="round_robin">Round Robin</SelectItem>
                            <SelectItem value="round_robin_split">Round Robin + Playoffs</SelectItem>
                            <SelectItem value="custom_bracket">Custom Bracket Builder</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose the format for your tournament bracket
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Add details about your tournament..."
                            {...field}
                            data-testid="input-tournament-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="accessStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Access Window Start (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-access-start-date"
                            />
                          </FormControl>
                          <FormDescription>
                            When players can start joining
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="accessEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Access Window End (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-access-end-date"
                            />
                          </FormControl>
                          <FormDescription>
                            When player access closes
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Create/Import Teams */}
            {step === 2 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {watchedType === "season_playoff" ? "Select Teams" : "Add Teams"}
                    </CardTitle>
                    <CardDescription>
                      {watchedType === "season_playoff" 
                        ? "Select teams from your league to participate in the tournament"
                        : `Add teams manually or import via CSV (${teams.length} teams added)`
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {watchedType === "season_playoff" ? (
                      /* League Team Selection */
                      <div className="space-y-4">
                        <div>
                          <div className="mb-2">
                            <FormLabel>Select Teams</FormLabel>
                          </div>
                          <FormDescription className="mb-4">
                            Choose which teams will participate in this tournament (minimum 3 teams)
                          </FormDescription>
                          
                          {leagueTeams && leagueTeams.length > 0 ? (
                            <div className="space-y-2 border rounded-lg p-4">
                              {/* Select All Teams checkbox - outside FormField so it's always visible */}
                              <div className="flex items-center space-x-3 pb-3 border-b">
                                <Checkbox
                                  checked={(() => {
                                    const teamIds = form.watch("teamIds") || [];
                                    return leagueTeams.length > 0 && teamIds.length === leagueTeams.length;
                                  })()}
                                  onCheckedChange={(checked) => {
                                    // Convert to boolean to handle indeterminate state
                                    const isChecked = checked === true;
                                    if (isChecked && leagueTeams) {
                                      form.setValue('teamIds', leagueTeams.map((t: any) => t.id), { shouldValidate: true });
                                    } else {
                                      form.setValue('teamIds', [], { shouldValidate: true });
                                    }
                                  }}
                                  data-testid="checkbox-select-all-teams"
                                />
                                <label className="font-medium cursor-pointer">
                                  Select All Teams
                                </label>
                              </div>

                              <FormField
                                control={form.control}
                                name="teamIds"
                                render={() => (
                                  <FormItem>
                                    <div className="space-y-2">
                                      {leagueTeams.map((team: any) => (
                                        <FormField
                                          key={team.id}
                                          control={form.control}
                                          name="teamIds"
                                          render={({ field }) => {
                                            const teamIds = field.value || [];
                                            return (
                                              <FormItem
                                                key={team.id}
                                                className="flex flex-row items-start space-x-3 space-y-0 p-2 hover:bg-muted rounded"
                                              >
                                                <FormControl>
                                                  <Checkbox
                                                    checked={teamIds.includes(team.id)}
                                                    onCheckedChange={(checked) => {
                                                      // Convert to boolean to handle indeterminate state
                                                      const isChecked = checked === true;
                                                      const newValue = isChecked
                                                        ? [...teamIds, team.id]
                                                        : teamIds.filter((id: string) => id !== team.id);
                                                      field.onChange(newValue);
                                                    }}
                                                    data-testid={`checkbox-team-${team.id}`}
                                                  />
                                                </FormControl>
                                                <FormLabel className="font-normal cursor-pointer flex-1">
                                                  {team.name}
                                                </FormLabel>
                                              </FormItem>
                                            );
                                          }}
                                        />
                                      ))}
                                    </div>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No teams available in this league</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Standalone Team Entry */
                      <>
                        {/* CSV Upload */}
                        <div className="border rounded-lg p-4 bg-muted/50">
                          <h3 className="font-medium mb-2 flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            Import from CSV
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            Upload a CSV with teams and optionally include player information
                          </p>
                          <p className="text-xs text-muted-foreground mb-3">
                            <span className="font-medium">Required:</span> Team Name
                            <br />
                            <span className="font-medium">Optional:</span> Player Full Name, Email, Phone Number, Jersey #, Position, Skill Level, Player Type (Goalie/Skater)
                          </p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={handleCsvUpload}
                            className="hidden"
                            id="csv-upload"
                            data-testid="input-csv-upload"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={downloadCsvTemplate}
                              data-testid="button-download-template"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download Template
                            </Button>
                            <label htmlFor="csv-upload">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('csv-upload')?.click()}
                                data-testid="button-csv-upload"
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Upload CSV
                              </Button>
                            </label>
                          </div>
                        </div>

                        {/* Manual Team Entry */}
                        <div className="border rounded-lg p-4">
                          <h3 className="font-medium mb-2 flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Add Team Manually
                          </h3>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Team name"
                              value={newTeamName}
                              onChange={(e) => setNewTeamName(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTeam())}
                              data-testid="input-new-team-name"
                            />
                            <Button
                              type="button"
                              onClick={addTeam}
                              data-testid="button-add-team"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Teams List */}
                        {teams.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="font-medium">Teams ({teams.length})</h3>
                            <div className="grid gap-2">
                              {teams.map((team, teamIndex) => (
                                <div
                                  key={teamIndex}
                                  className="flex items-center justify-between p-3 border rounded-lg bg-card"
                                  data-testid={`team-${teamIndex}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{team.name}</span>
                                    {team.playerCount !== undefined && team.playerCount > 0 && (
                                      <span className="text-sm text-muted-foreground">
                                        ({team.playerCount} {team.playerCount === 1 ? 'player' : 'players'})
                                      </span>
                                    )}
                                  </div>
                                  <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTeam(teamIndex)}
                                data-testid={`button-remove-team-${teamIndex}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        {csvPlayerData && csvPlayerData.length > 0 && (
                          <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                            ✓ {csvPlayerData.length} players ready to be imported after tournament creation
                          </p>
                        )}
                      </div>
                    )}
                      </>
                    )}

                    {form.formState.errors.teams && watchedType !== "season_playoff" && (
                      <p className="text-sm text-destructive">{form.formState.errors.teams.message}</p>
                    )}
                    {form.formState.errors.teamIds && watchedType === "season_playoff" && (
                      <p className="text-sm text-destructive">{form.formState.errors.teamIds.message}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Review & Create
                  </CardTitle>
                  <CardDescription>
                    Review your tournament settings before creating
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Tournament Name</p>
                      <p className="text-lg font-semibold" data-testid="text-review-name">{form.getValues("name")}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Format</p>
                      <p className="text-lg font-semibold" data-testid="text-review-format">
                        {getFormatLabel(watchedFormat)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Teams</p>
                      <p className="text-lg font-semibold" data-testid="text-review-teams">
                        {watchedType === "season_playoff" 
                          ? `${form.watch("teamIds")?.length || 0} teams`
                          : `${teams.length} teams`
                        }
                      </p>
                    </div>
                    {form.getValues("description") && (
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium text-muted-foreground">Description</p>
                        <p className="text-sm" data-testid="text-review-description">{form.getValues("description")}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  data-testid="button-previous"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              )}
              <div className="ml-auto">
                {step < 3 ? (
                  <Button
                    type="button"
                    onClick={nextStep}
                    data-testid="button-next"
                  >
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    data-testid="button-create-tournament"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Tournament"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
