import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Trophy, Users, Info, AlertTriangle, Calendar, Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getImageUrl } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { Tournament, Team, TournamentTeam } from "@shared/schema";

type FormatRecommendation = {
  format: string;
  recommended: boolean;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedGames: number;
};

// Parse a "YYYY-MM-DD" date input as a local-midnight Date.
// Avoids UTC-offset bugs and rejects impossible calendar dates (e.g. Feb 31).
function parseLocalDate(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

const formSchema = z.object({
  name: z.string().min(1, "Tournament name is required"),
  type: z.enum(["season_playoff", "standalone"]),
  seasonId: z.string().optional(),
  format: z.enum(["single_elimination", "double_elimination", "round_robin", "round_robin_split", "three_game_guarantee", "custom_bracket"]),
  description: z.string().optional(),
  firstGameDate: z.string().optional(),
  teamIds: z.array(z.string()).min(2, "Select at least 2 teams"),
  byePolicy: z.enum(["top_seed_bye", "play_in_game"]).optional()
}).refine((data) => {
  if (data.type === "season_playoff") {
    return data.seasonId && data.seasonId.trim() !== "";
  }
  return true;
}, {
  message: "Please select a season for this playoff tournament",
  path: ["seasonId"]
}).refine((data) => {
  // Standalone tournaments require a first game date
  if (data.type === "standalone") {
    return !!data.firstGameDate;
  }
  return true;
}, {
  message: "First game date is required for standalone tournaments",
  path: ["firstGameDate"]
}).refine((data) => {
  // First game date must be a valid calendar date when provided
  if (data.type === "standalone" && data.firstGameDate) {
    return parseLocalDate(data.firstGameDate) !== null;
  }
  return true;
}, {
  message: "Please enter a valid first game date",
  path: ["firstGameDate"]
}).refine((data) => {
  // First game date cannot be in the past (compared at local midnight)
  if (data.type === "standalone" && data.firstGameDate) {
    const first = parseLocalDate(data.firstGameDate);
    if (!first) return true; // already caught by previous refine
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return first.getTime() >= today.getTime();
  }
  return true;
}, {
  message: "First game date cannot be in the past",
  path: ["firstGameDate"]
});

type FormData = z.infer<typeof formSchema>;

export default function TournamentEdit() {
  const [, params] = useRoute("/tournaments/:tournamentId/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const tournamentId = params?.tournamentId;
  const [step, setStep] = useState(1);
  const [shiftDialog, setShiftDialog] = useState<{
    open: boolean;
    dayDelta: number;
    pendingData: FormData | null;
  }>({ open: false, dayDelta: 0, pendingData: null });

  const { data: tournament, isLoading: tournamentLoading } = useQuery<Tournament>({
    queryKey: ['/api/tournaments', tournamentId],
    enabled: !!tournamentId
  });

  const { data: currentTeams } = useQuery<TournamentTeam[]>({
    queryKey: ['/api/tournaments', tournamentId, 'teams'],
    enabled: !!tournamentId
  });

  const matchesQuery = useQuery<{ id: string; scheduledTime: string | null }[]>({
    queryKey: ['/api/tournaments', tournamentId, 'matches'],
    enabled: !!tournamentId
  });
  const matches = matchesQuery.data;

  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/leagues', tournament?.leagueId, 'teams'],
    enabled: !!tournament?.leagueId
  });

  const { data: seasons } = useQuery<any[]>({
    queryKey: ['/api/leagues', tournament?.leagueId, 'seasons'],
    enabled: !!tournament?.leagueId
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "season_playoff",
      seasonId: undefined,
      format: "single_elimination",
      description: "",
      firstGameDate: "",
      teamIds: [],
      byePolicy: "top_seed_bye"
    }
  });

  // Format a Date as the local-midnight "YYYY-MM-DD" string the date input expects.
  const toDateInputValue = (value: Date | string | null | undefined): string => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Pre-fill form when data loads
  useEffect(() => {
    if (tournament && currentTeams) {
      const settings = tournament.settings as any;
      form.reset({
        name: tournament.name,
        type: tournament.type,
        seasonId: tournament.seasonId || undefined,
        format: tournament.format,
        description: tournament.description || "",
        firstGameDate: toDateInputValue(tournament.startDate),
        teamIds: currentTeams.map(t => t.teamId).filter((id): id is string => id !== null),
        byePolicy: settings?.byePolicy || "top_seed_bye"
      });
    }
  }, [tournament, currentTeams, form]);

  const watchedTeamIds = form.watch("teamIds");
  const watchedFormat = form.watch("format");
  const watchedType = form.watch("type");

  const originalTeamIds = currentTeams?.map(t => t.teamId).filter((id): id is string => id !== null) || [];
  const formatChanged = tournament ? watchedFormat !== tournament.format : false;
  const teamsRemoved = originalTeamIds.some(id => !watchedTeamIds.includes(id));
  const teamsAdded = watchedTeamIds.filter(id => !originalTeamIds.includes(id));
  const willRegenerateBracket = formatChanged || teamsRemoved;
  const isAddOnly = !formatChanged && !teamsRemoved && teamsAdded.length > 0;

  const { data: recommendations } = useQuery<FormatRecommendation[]>({
    queryKey: ['/api/tournaments/format-recommendations', watchedTeamIds.length],
    enabled: watchedTeamIds.length > 0
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { data: FormData; shiftScheduledMatches?: boolean }) => {
      const { data, shiftScheduledMatches } = payload;
      if (!teams) {
        throw new Error("Teams data not loaded");
      }

      const teamData = data.teamIds.map((teamId, index) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) throw new Error(`Team ${teamId} not found`);
        
        return {
          teamId: team.id,
          teamName: team.name,
          seed: index + 1,
          wins: 0,
          losses: 0
        };
      });

      const settings: any = {};
      if (data.byePolicy) {
        settings.byePolicy = data.byePolicy;
      }

      const response = await apiRequest('PATCH', `/api/tournaments/${tournamentId}`, {
        name: data.name,
        type: data.type,
        seasonId: data.type === "season_playoff" ? (data.seasonId || null) : null,
        format: data.format,
        description: data.description || null,
        firstGameDate: data.type === "standalone" ? (data.firstGameDate || null) : undefined,
        shiftScheduledMatches: shiftScheduledMatches ?? false,
        teams: teamData,
        settings: Object.keys(settings).length > 0 ? settings : undefined
      });

      return await response.json();
    },
    onSuccess: (tournament) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', tournament.leagueId, 'tournaments'] });
      toast({
        title: "Tournament updated",
        description: "Your tournament has been updated successfully"
      });
      setLocation(`/tournaments/${tournamentId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update tournament",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    // For standalone tournaments, if the user changed the first game date and
    // there are scheduled matches, ask whether to shift the whole schedule.
    if (data.type === "standalone" && data.firstGameDate && tournament?.startDate) {
      // Make sure we know whether matches exist before deciding whether to
      // prompt — otherwise a slow query could silently skip the dialog.
      if (matchesQuery.isLoading || matchesQuery.isError || matches === undefined) {
        toast({
          title: matchesQuery.isError ? "Could not load match schedule" : "Loading match schedule…",
          description: matchesQuery.isError
            ? "Please refresh the page and try again."
            : "Please try again in a moment.",
          variant: matchesQuery.isError ? "destructive" : "default",
        });
        return;
      }

      const newDate = parseLocalDate(data.firstGameDate);
      const oldDate = (() => {
        const d = new Date(tournament.startDate);
        if (Number.isNaN(d.getTime())) return null;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      })();

      if (newDate && oldDate) {
        const dayDelta = Math.round(
          (newDate.getTime() - oldDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        const scheduledCount = matches.filter(m => m.scheduledTime).length;
        if (dayDelta !== 0 && scheduledCount > 0) {
          setShiftDialog({ open: true, dayDelta, pendingData: data });
          return;
        }
      }
    }

    updateMutation.mutate({ data, shiftScheduledMatches: false });
  };

  const handleShiftDecision = (shouldShift: boolean) => {
    const pending = shiftDialog.pendingData;
    setShiftDialog({ open: false, dayDelta: 0, pendingData: null });
    if (pending) {
      updateMutation.mutate({ data: pending, shiftScheduledMatches: shouldShift });
    }
  };

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["name", "type", "seasonId", "format", "description", "firstGameDate"] as const
      : ["teamIds"] as const;
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setStep(step + 1);
    }
  };

  // Derive access-window-open date as 14 days before the first game date
  const watchedFirstGameDate = form.watch("firstGameDate");
  const computedAccessOpenDate = (() => {
    const first = parseLocalDate(watchedFirstGameDate || "");
    if (!first) return null;
    const d = new Date(first);
    d.setDate(d.getDate() - 14);
    return d;
  })();

  const getFormatLabel = (format: string) => {
    const labels: Record<string, string> = {
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      three_game_guarantee: '3-Game Guarantee',
      custom_bracket: 'Custom Bracket',
      round_robin: 'Round Robin',
      round_robin_split: 'Round Robin + Playoffs'
    };
    return labels[format] || format;
  };

  if (tournamentLoading || teamsLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
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

  if (tournament.status !== 'draft') {
    if (tournament.type === 'standalone') {
      return (
        <DateOnlyEditor
          tournament={tournament}
          onCancel={() => setLocation(`/tournaments/${tournamentId}`)}
          onSaved={() => setLocation(`/tournaments/${tournamentId}`)}
        />
      );
    }

    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/tournaments/${tournamentId}`)}
            className="-ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournament
          </Button>

          <Card>
            <CardContent className="p-12 text-center">
              <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Cannot Edit Active Tournament</h3>
              <p className="text-muted-foreground mb-4">
                This tournament has already started and cannot be edited to preserve bracket integrity.
              </p>
              <Button onClick={() => setLocation(`/tournaments/${tournamentId}`)}>
                View Tournament
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(`/tournaments/${tournamentId}`)}
          className="-ml-2"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tournament
        </Button>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" />
            Edit Tournament
          </h1>
          <p className="text-muted-foreground">
            Modify tournament settings and participating teams.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                s === step ? 'bg-primary text-primary-foreground' :
                s < step ? 'bg-primary/20 text-primary' :
                'bg-muted text-muted-foreground'
              }`}>
                {s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Tournament Details</CardTitle>
                  <CardDescription>Basic information about your tournament</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {formatChanged && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Warning:</strong> Changing the format will regenerate the entire bracket and reset all match data.
                      </AlertDescription>
                    </Alert>
                  )}

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Spring 2024 Playoffs" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="season_playoff">Season Playoff</SelectItem>
                            <SelectItem value="standalone">Standalone Tournament</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Season playoffs are linked to a specific season
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedType === "season_playoff" && (
                    <FormField
                      control={form.control}
                      name="seasonId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Season</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-season">
                                <SelectValue placeholder="Select a season..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {seasons?.map((season) => (
                                <SelectItem key={season.id} value={season.id}>
                                  {season.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="format"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Format</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-format">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="single_elimination">Single Elimination</SelectItem>
                            <SelectItem value="double_elimination">Double Elimination (Beta)</SelectItem>
                            <SelectItem value="round_robin">Round Robin</SelectItem>
                            <SelectItem value="round_robin_split">Round Robin + Playoffs</SelectItem>
                            <SelectItem value="three_game_guarantee">3-Game Guarantee</SelectItem>
                            <SelectItem value="custom_bracket">Custom Bracket</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Determines how teams compete and advance
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
                            data-testid="textarea-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedType === "standalone" && (
                    <FormField
                      control={form.control}
                      name="firstGameDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            First Game Date
                            <span className="text-destructive ml-1">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-first-game-date"
                            />
                          </FormControl>
                          <FormDescription>
                            {computedAccessOpenDate ? (
                              <>
                                Access opens{" "}
                                <span className="font-medium">
                                  {computedAccessOpenDate.toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })}
                                </span>{" "}
                                (2 weeks before the first game). Access closes 1 week after the final game.
                              </>
                            ) : (
                              <>The access window opens 2 weeks before the first game and closes 1 week after the final game.</>
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {watchedType === "standalone" && tournamentId && (
                    <TournamentLogoField tournamentId={tournamentId} currentLogoUrl={tournament?.logoUrl ?? null} />
                  )}
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Teams</CardTitle>
                  <CardDescription>Choose which teams will participate (minimum 2)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Teams will be seeded in the order you select them. You can reorder by deselecting and reselecting.
                    </AlertDescription>
                  </Alert>

                  {teamsRemoved && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Removing teams will regenerate the bracket and clear existing match data.
                      </AlertDescription>
                    </Alert>
                  )}

                  <FormField
                    control={form.control}
                    name="teamIds"
                    render={() => (
                      <FormItem>
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 pb-3 border-b">
                            <Checkbox
                              checked={watchedTeamIds.length === teams?.length}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  form.setValue("teamIds", teams?.map(t => t.id) || []);
                                } else {
                                  form.setValue("teamIds", []);
                                }
                              }}
                              data-testid="checkbox-select-all"
                            />
                            <span className="font-medium">Select All Teams</span>
                          </div>

                          {teams?.map((team, index) => (
                            <FormField
                              key={team.id}
                              control={form.control}
                              name="teamIds"
                              render={({ field }) => {
                                const isSelected = field.value.includes(team.id);
                                const seedNumber = field.value.indexOf(team.id) + 1;
                                
                                return (
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            field.onChange([...field.value, team.id]);
                                          } else {
                                            field.onChange(field.value.filter(id => id !== team.id));
                                          }
                                        }}
                                        data-testid={`checkbox-team-${team.id}`}
                                      />
                                    </FormControl>
                                    <div className="flex items-center gap-3 flex-1">
                                      {isSelected && (
                                        <Badge variant="secondary" className="font-mono">
                                          #{seedNumber}
                                        </Badge>
                                      )}
                                      <span className="font-medium" data-testid={`text-team-name-${team.id}`}>
                                        {team.name}
                                      </span>
                                    </div>
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

                  {watchedTeamIds.length > 0 && (
                    <Alert>
                      <Users className="h-4 w-4" />
                      <AlertDescription>
                        {watchedTeamIds.length} {watchedTeamIds.length === 1 ? 'team' : 'teams'} selected
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bye Policy - Show for single elimination (odd teams only) or double elimination (all teams) */}
            {step === 2 &&
             ((watchedFormat === "single_elimination" && watchedTeamIds.length % 2 === 1) || 
              watchedFormat === "double_elimination") && 
             watchedTeamIds.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {watchedTeamIds.length % 2 === 1 ? "Bye Week Policy" : "Play-In Game Option"}
                  </CardTitle>
                  <CardDescription>
                    {watchedTeamIds.length % 2 === 1 
                      ? `With ${watchedTeamIds.length} teams (odd number), choose how to handle the extra team`
                      : `With ${watchedTeamIds.length} teams, optionally add a play-in game for the lowest 2 seeds`
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="byePolicy"
                    render={({ field }) => (
                      <FormItem>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-bye-policy">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {watchedTeamIds.length % 2 === 1 ? (
                              <>
                                <SelectItem value="top_seed_bye">Top Seed Gets Bye to Round 2</SelectItem>
                                <SelectItem value="play_in_game">Bottom 2 Seeds Play Play-In Game</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="top_seed_bye">No Play-In Game (Standard Bracket)</SelectItem>
                                <SelectItem value="play_in_game">Lowest 2 Seeds Play Play-In Game</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {watchedTeamIds.length % 2 === 1
                            ? "Either the top seed advances automatically or the bottom 2 teams play for the final spot."
                            : "Add an extra game where the bottom 2 seeds compete for entry into the main bracket."
                          }
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Review & Confirm</CardTitle>
                  <CardDescription>Verify your tournament settings before saving</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Tournament Name</div>
                      <div className="text-lg font-semibold" data-testid="text-review-name">{form.getValues("name")}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Type</div>
                        <div className="font-medium">
                          {form.getValues("type") === "season_playoff" ? "Season Playoff" : "Standalone Tournament"}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Format</div>
                        <div className="font-medium">{getFormatLabel(form.getValues("format"))}</div>
                      </div>
                    </div>

                    {form.getValues("description") && (
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Description</div>
                        <div className="text-sm">{form.getValues("description")}</div>
                      </div>
                    )}

                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-2">
                        Participating Teams ({watchedTeamIds.length})
                      </div>
                      <div className="space-y-2">
                        {watchedTeamIds.map((teamId, index) => {
                          const team = teams?.find(t => t.id === teamId);
                          return (
                            <div key={teamId} className="flex items-center gap-2 p-2 bg-muted rounded">
                              <Badge variant="secondary" className="font-mono">#{index + 1}</Badge>
                              <span className="font-medium">{team?.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {willRegenerateBracket ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Warning:</strong> Updating this tournament will regenerate the bracket and clear all existing match data.
                      </AlertDescription>
                    </Alert>
                  ) : isAddOnly ? (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        {teamsAdded.length} new {teamsAdded.length === 1 ? 'team' : 'teams'} will be added as {teamsAdded.length === 1 ? 'a participant' : 'participants'}. The existing bracket and match data will not be affected.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => step > 1 ? setStep(step - 1) : setLocation(`/tournaments/${tournamentId}`)}
                data-testid="button-back-step"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {step > 1 ? 'Previous' : 'Cancel'}
              </Button>

              {step < 3 ? (
                <Button type="button" onClick={nextStep} data-testid="button-next">
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {updateMutation.isPending ? "Updating..." : "Update Tournament"}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>

      <AlertDialog
        open={shiftDialog.open}
        onOpenChange={(open) => {
          if (!open) setShiftDialog({ open: false, dayDelta: 0, pendingData: null });
        }}
      >
        <AlertDialogContent data-testid="dialog-shift-matches">
          <AlertDialogHeader>
            <AlertDialogTitle>Shift the rest of the schedule too?</AlertDialogTitle>
            <AlertDialogDescription>
              You moved the first game date by{" "}
              <span className="font-semibold">
                {Math.abs(shiftDialog.dayDelta)} day{Math.abs(shiftDialog.dayDelta) === 1 ? "" : "s"}{" "}
                {shiftDialog.dayDelta > 0 ? "later" : "earlier"}
              </span>
              . Would you like to move every already-scheduled match by the same amount, keeping
              the time of day the same? You can also save the date change without touching the
              existing match schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => handleShiftDecision(false)}
              data-testid="button-keep-schedule"
            >
              Keep current match times
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleShiftDecision(true)}
              data-testid="button-shift-schedule"
            >
              Shift all matches by {Math.abs(shiftDialog.dayDelta)} day
              {Math.abs(shiftDialog.dayDelta) === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const dateOnlyFormSchema = z.object({
  firstGameDate: z
    .string()
    .min(1, "First game date is required")
    .refine((value) => parseLocalDate(value) !== null, {
      message: "Please enter a valid first game date",
    })
    .refine((value) => {
      const first = parseLocalDate(value);
      if (!first) return true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return first.getTime() >= today.getTime();
    }, {
      message: "First game date cannot be in the past",
    }),
});

type DateOnlyFormData = z.infer<typeof dateOnlyFormSchema>;

// Reusable logo upload + preview + remove control. PATCHes the tournament
// immediately on upload/remove (the tournament row already exists when this
// is rendered). Use only on standalone tournaments; the backend rejects others.
function TournamentLogoField({
  tournamentId,
  currentLogoUrl,
}: {
  tournamentId: string;
  currentLogoUrl: string | null;
}) {
  const { toast } = useToast();

  const setLogo = useMutation({
    mutationFn: async (logoUrl: string | null) => {
      const res = await apiRequest('PATCH', `/api/tournaments/${tournamentId}/logo`, { logoUrl });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] });
    },
    onError: (error: any) => {
      toast({
        title: "Logo update failed",
        description: error?.message || "Could not update logo",
        variant: "destructive",
      });
    },
  });

  return (
    <FormItem>
      <FormLabel className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        Tournament Logo (optional)
      </FormLabel>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
          {currentLogoUrl ? (
            <img
              src={getImageUrl(currentLogoUrl) || undefined}
              alt="Tournament logo"
              className="w-full h-full object-cover"
              data-testid="img-current-logo"
            />
          ) : (
            <Trophy className="h-8 w-8 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <ObjectUploader
            maxNumberOfFiles={1}
            maxFileSize={10 * 1024 * 1024}
            buttonClassName="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 text-sm"
            onGetUploadParameters={async () => {
              const res = await apiRequest('POST', '/api/tournament-logos/upload');
              const json = await res.json();
              return { method: 'PUT', url: json.uploadURL, path: json.path };
            }}
            onComplete={(result) => {
              const uploaded = result.successful?.[0];
              if (uploaded?.path) {
                setLogo.mutate(uploaded.path, {
                  onSuccess: () => {
                    toast({
                      title: "Logo updated",
                      description: "The new logo is now visible on this tournament.",
                    });
                  },
                });
              }
            }}
          >
            <Upload className="h-4 w-4 mr-2" />
            {currentLogoUrl ? "Replace Logo" : "Upload Logo"}
          </ObjectUploader>
          {currentLogoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLogo.mutate(null)}
              disabled={setLogo.isPending}
              className="text-destructive hover:text-destructive h-8 px-2 text-xs"
              data-testid="button-remove-logo"
            >
              <X className="h-3 w-3 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </div>
      <FormDescription>
        Square images work best. Max 10MB. Used on the tournament header and countdown screen.
      </FormDescription>
    </FormItem>
  );
}

function DateOnlyEditor({
  tournament,
  onCancel,
  onSaved,
}: {
  tournament: Tournament;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();

  const initialDate = (() => {
    if (!tournament.startDate) return "";
    const d = tournament.startDate instanceof Date ? tournament.startDate : new Date(tournament.startDate);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  const form = useForm<DateOnlyFormData>({
    resolver: zodResolver(dateOnlyFormSchema),
    defaultValues: { firstGameDate: initialDate },
  });

  const watched = form.watch("firstGameDate");
  const computedAccessOpenDate = (() => {
    const first = parseLocalDate(watched || "");
    if (!first) return null;
    const d = new Date(first);
    d.setDate(d.getDate() - 14);
    return d;
  })();

  const updateDate = useMutation({
    mutationFn: async (data: DateOnlyFormData) => {
      const response = await apiRequest('PATCH', `/api/tournaments/${tournament.id}`, {
        firstGameDate: data.firstGameDate,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournament.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournament.id, 'matches'] });
      if (tournament.leagueId) {
        queryClient.invalidateQueries({ queryKey: ['/api/leagues', tournament.leagueId, 'tournaments'] });
      }
      toast({
        title: "First game date updated",
        description: "The tournament's start date has been updated.",
      });
      onSaved();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update first game date",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="-ml-2"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tournament
        </Button>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8 text-primary" />
            Edit First Game Date
          </h1>
          <p className="text-muted-foreground">
            Adjust the start date for {tournament.name}. Teams, format, and bracket will not change.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This tournament has already started, so only the first game date can be changed here.
            Other settings are locked to preserve bracket integrity.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Tournament Logo</CardTitle>
            <CardDescription>Upload, replace, or remove the logo shown on this tournament.</CardDescription>
          </CardHeader>
          <CardContent>
            <TournamentLogoField tournamentId={tournament.id} currentLogoUrl={tournament.logoUrl ?? null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>First Game Date</CardTitle>
            <CardDescription>The access window opens 2 weeks before the first game.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => updateDate.mutate(data))}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="firstGameDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        First Game Date
                        <span className="text-destructive ml-1">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-first-game-date"
                        />
                      </FormControl>
                      <FormDescription>
                        {computedAccessOpenDate ? (
                          <>
                            Access opens{" "}
                            <span className="font-medium">
                              {computedAccessOpenDate.toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>{" "}
                            (2 weeks before the first game). Access closes 1 week after the final game.
                          </>
                        ) : (
                          <>The access window opens 2 weeks before the first game and closes 1 week after the final game.</>
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateDate.isPending}
                    data-testid="button-submit"
                  >
                    {updateDate.isPending ? "Saving..." : "Save Date"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
