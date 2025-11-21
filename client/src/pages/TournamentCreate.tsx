import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle, Trophy, Users, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, InsertTournament } from "@shared/schema";

type FormatRecommendation = {
  format: string;
  recommended: boolean;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedGames: number;
};

const formSchema = z.object({
  name: z.string().min(1, "Tournament name is required"),
  type: z.enum(["season_playoff", "standalone"]),
  seasonId: z.string().optional(),
  format: z.enum(["single_elimination", "double_elimination", "three_game_guarantee", "consolation", "compass_draw", "round_robin", "round_robin_split"]),
  description: z.string().optional(),
  teamIds: z.array(z.string()).min(3, "Select at least 3 teams").max(128, "Maximum 128 teams allowed"),
  byePolicy: z.enum(["top_seed_bye", "play_in_game"]).optional(),
  bracketType: z.enum(["seeded", "blind_draw"]).default("seeded"),
  showSeedNumbers: z.boolean().default(true),
  showGameNumbers: z.boolean().default(false)
}).refine((data) => {
  // Season playoffs require a valid seasonId
  if (data.type === "season_playoff") {
    return data.seasonId && data.seasonId.trim() !== "";
  }
  return true;
}, {
  message: "Please select a season for this playoff tournament",
  path: ["seasonId"]
});

type FormData = z.infer<typeof formSchema>;

export default function TournamentCreate() {
  const [, params] = useRoute("/leagues/:leagueId/tournaments/create");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const leagueId = params?.leagueId;
  const [step, setStep] = useState(1);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "season_playoff",
      seasonId: undefined,
      format: "single_elimination",
      description: "",
      teamIds: [],
      byePolicy: "top_seed_bye",
      bracketType: "seeded",
      showSeedNumbers: true,
      showGameNumbers: false
    }
  });

  const watchedTeamIds = form.watch("teamIds");
  const watchedFormat = form.watch("format");
  const watchedType = form.watch("type");

  // Fetch league teams
  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/leagues', leagueId, 'teams'],
    enabled: !!leagueId
  });

  // Fetch league seasons
  const { data: seasons } = useQuery<any[]>({
    queryKey: ['/api/leagues', leagueId, 'seasons'],
    enabled: !!leagueId
  });

  // Fetch format recommendations
  const { data: recommendations } = useQuery<FormatRecommendation[]>({
    queryKey: ['/api/tournaments/format-recommendations', watchedTeamIds.length],
    enabled: watchedTeamIds.length > 0
  });

  // Create tournament mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!teams) {
        throw new Error("Teams data not loaded");
      }

      // Step 1: Create tournament
      const settings: any = {};
      if (data.byePolicy) {
        settings.byePolicy = data.byePolicy;
      }
      settings.bracketType = data.bracketType;
      settings.showSeedNumbers = data.showSeedNumbers;
      settings.showGameNumbers = data.showGameNumbers;
      
      const response = await apiRequest('POST', `/api/tournaments`, {
        leagueId: leagueId!,
        name: data.name,
        type: data.type,
        seasonId: data.type === "season_playoff" ? (data.seasonId || null) : null,
        format: data.format,
        numTeams: data.teamIds.length,
        description: data.description || null,
        settings: Object.keys(settings).length > 0 ? settings : null
      });

      const tournament = await response.json();

      // Step 2: Add teams and generate bracket
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

      try {
        await apiRequest('POST', `/api/tournaments/${tournament.id}/generate-bracket`, {
          teams: teamData,
          format: data.format
        });
      } catch (bracketError: any) {
        // Parse error response
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

      return tournament;
    },
    onSuccess: (tournament) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'tournaments'] });
      toast({
        title: "Tournament created",
        description: "Your tournament and bracket have been created successfully"
      });
      setLocation(`/tournaments/${tournament.id}`);
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
    createMutation.mutate(data);
  };

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["name", "type", "seasonId", "format", "description"] as const
      : ["teamIds"] as const;
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setStep(step + 1);
    }
  };

  const getFormatLabel = (format: string) => {
    const labels: Record<string, string> = {
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      three_game_guarantee: '3-Game Guarantee',
      consolation: 'Consolation Tournament',
      compass_draw: 'Compass Draw',
      round_robin: 'Round Robin',
      round_robin_split: 'Round Robin + Playoffs'
    };
    return labels[format] || format;
  };

  const getRecommendationBadge = (format: string) => {
    if (!recommendations) return null;
    const rec = recommendations.find(r => r.format === format);
    if (!rec) return null;
    
    if (rec.recommended) {
      return <Badge variant="default" className="ml-2">Recommended</Badge>;
    }
    return <Badge variant="outline" className="ml-2">{rec.estimatedGames} games</Badge>;
  };

  if (teamsLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(`/leagues/${leagueId}/tournaments`)}
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
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Spring 2025 Playoffs"
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
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="season_playoff">Season Playoff</SelectItem>
                            <SelectItem value="standalone">Standalone Tournament</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Season playoffs are tied to your league season, standalone tournaments are independent
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
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-tournament-season">
                                <SelectValue placeholder="Select a season" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {seasons && seasons.length > 0 ? (
                                seasons.map((season) => (
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
                            <SelectItem value="double_elimination">Double Elimination (Beta)</SelectItem>
                            <SelectItem value="three_game_guarantee">3-Game Guarantee</SelectItem>
                            <SelectItem value="consolation">Consolation Tournament</SelectItem>
                            <SelectItem value="compass_draw">Compass Draw</SelectItem>
                            <SelectItem value="round_robin">Round Robin</SelectItem>
                            <SelectItem value="round_robin_split">Round Robin + Playoffs</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {field.value === "double_elimination" ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              Note: Double elimination creates winners bracket automatically. Losers bracket requires manual match setup.
                            </span>
                          ) : (
                            "Choose the format that best fits your tournament structure"
                          )}
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
                            placeholder="Add any additional details about this tournament..."
                            {...field}
                            data-testid="input-tournament-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 2: Select Teams */}
            {step === 2 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Select Teams
                    </CardTitle>
                    <CardDescription>
                      Choose which teams will participate ({watchedTeamIds.length} selected)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="teamIds"
                      render={() => (
                        <FormItem>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-3 pb-3 border-b">
                              <Checkbox
                                checked={teams && teams.length > 0 && watchedTeamIds.length === teams.length}
                                onCheckedChange={(checked) => {
                                  if (checked && teams) {
                                    form.setValue('teamIds', teams.map(t => t.id));
                                  } else {
                                    form.setValue('teamIds', []);
                                  }
                                }}
                                data-testid="checkbox-select-all-teams"
                              />
                              <label className="font-medium cursor-pointer">
                                Select All Teams
                              </label>
                            </div>
                            {teams?.map((team) => (
                              <FormField
                                key={team.id}
                                control={form.control}
                                name="teamIds"
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(team.id)}
                                        onCheckedChange={(checked) => {
                                          const newValue = checked
                                            ? [...field.value, team.id]
                                            : field.value.filter((id: string) => id !== team.id);
                                          field.onChange(newValue);
                                        }}
                                        data-testid={`checkbox-team-${team.id}`}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer flex-1">
                                      {team.name}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Bracket Display Settings - Show for elimination formats */}
                {(watchedFormat === "single_elimination" || watchedFormat === "double_elimination") && watchedTeamIds.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Bracket Display Settings</CardTitle>
                      <CardDescription>
                        Customize how your bracket is displayed and seeded
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="bracketType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bracket Type</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-bracket-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="seeded">Seeded (1 vs 16, 8 vs 9, etc.)</SelectItem>
                                <SelectItem value="blind_draw">Blind Draw (Random Order)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Seeded brackets use canonical matchups (top seed vs bottom seed). Blind draw randomizes team placement.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-center justify-between space-x-2 border rounded-lg p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Show Seed Numbers</FormLabel>
                          <FormDescription>
                            Display seed numbers (#1, #2, etc.) next to team names in the bracket
                          </FormDescription>
                        </div>
                        <FormField
                          control={form.control}
                          name="showSeedNumbers"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-show-seed-numbers"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex items-center justify-between space-x-2 border rounded-lg p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Show Game Numbers</FormLabel>
                          <FormDescription>
                            Display sequential game numbers (Game 1, Game 2, etc.) showing order of play
                          </FormDescription>
                        </div>
                        <FormField
                          control={form.control}
                          name="showGameNumbers"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-show-game-numbers"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Bye Policy - Show for single elimination (odd teams only) or double elimination (all teams) */}
                {((watchedFormat === "single_elimination" && watchedTeamIds.length % 2 === 1) || 
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

                {/* Format Recommendations */}
                {recommendations && recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        Format Recommendations ({watchedTeamIds.length} teams)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {recommendations.map((rec) => (
                        <div
                          key={rec.format}
                          className={`p-3 rounded-lg border ${
                            rec.format === watchedFormat
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">{rec.name}</span>
                            <div className="flex items-center gap-2">
                              {rec.recommended && (
                                <Badge variant="default">Recommended</Badge>
                              )}
                              <Badge variant="outline">{rec.estimatedGames} games</Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            {rec.pros.length > 0 && (
                              <div>
                                <span className="font-medium text-green-600 dark:text-green-400">Pros:</span>
                                <ul className="list-disc list-inside text-muted-foreground">
                                  {rec.pros.slice(0, 2).map((pro, idx) => (
                                    <li key={idx}>{pro}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {rec.cons.length > 0 && (
                              <div>
                                <span className="font-medium text-amber-600 dark:text-amber-400">Cons:</span>
                                <ul className="list-disc list-inside text-muted-foreground">
                                  {rec.cons.slice(0, 2).map((con, idx) => (
                                    <li key={idx}>{con}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
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
                      <p className="text-sm font-medium text-muted-foreground">Type</p>
                      <p className="text-lg font-semibold" data-testid="text-review-type">
                        {form.getValues("type") === "season_playoff" ? "Season Playoff" : "Standalone Tournament"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Format</p>
                      <p className="text-lg font-semibold" data-testid="text-review-format">
                        {getFormatLabel(form.getValues("format"))}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Teams</p>
                      <p className="text-lg font-semibold" data-testid="text-review-team-count">
                        {form.getValues("teamIds").length} teams
                      </p>
                    </div>
                  </div>

                  {form.getValues("description") && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Description</p>
                      <p className="text-sm mt-1" data-testid="text-review-description">{form.getValues("description")}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Participating Teams</p>
                    <div className="flex flex-wrap gap-2">
                      {teams
                        ?.filter((team) => form.getValues("teamIds").includes(team.id))
                        .map((team) => (
                          <Badge key={team.id} variant="outline" data-testid={`badge-team-${team.id}`}>
                            {team.name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => step > 1 ? setStep(step - 1) : setLocation(`/leagues/${leagueId}/tournaments`)}
                disabled={createMutation.isPending}
                data-testid="button-previous"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {step > 1 ? "Previous" : "Cancel"}
              </Button>

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
                  data-testid="button-create"
                >
                  {createMutation.isPending ? "Creating..." : "Create Tournament"}
                  <CheckCircle className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
