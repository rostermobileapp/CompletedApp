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
  viable: boolean;
  note: string;
};

const formSchema = z.object({
  name: z.string().min(1, "Tournament name is required"),
  type: z.enum(["season_playoff", "standalone"]),
  format: z.enum(["single_elimination", "double_elimination", "round_robin", "round_robin_split"]),
  description: z.string().optional(),
  teamIds: z.array(z.string()).min(2, "Select at least 2 teams")
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
      format: "single_elimination",
      description: "",
      teamIds: []
    }
  });

  const watchedTeamIds = form.watch("teamIds");
  const watchedFormat = form.watch("format");

  // Fetch league teams
  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/leagues', leagueId, 'teams'],
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
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/tournaments`, {
        leagueId: leagueId!,
        name: data.name,
        type: data.type,
        format: data.format,
        description: data.description || null,
        status: 'draft'
      });

      const tournament = await response.json();

      // Add teams to tournament
      await apiRequest('POST', `/api/tournaments/${tournament.id}/teams`, {
        teamIds: data.teamIds
      });

      return tournament;
    },
    onSuccess: (tournament) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'tournaments'] });
      toast({
        title: "Tournament created",
        description: "Your tournament has been created successfully"
      });
      setLocation(`/tournaments/${tournament.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create tournament",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["name", "type", "format", "description"] as const
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
    } else if (rec.viable) {
      return <Badge variant="outline" className="ml-2">Viable</Badge>;
    }
    return <Badge variant="secondary" className="ml-2">Not Recommended</Badge>;
  };

  const getRecommendationNote = (format: string) => {
    if (!recommendations) return null;
    const rec = recommendations.find(r => r.format === format);
    return rec?.note || null;
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
                            <SelectItem value="round_robin">Round Robin</SelectItem>
                            <SelectItem value="round_robin_split">Round Robin + Playoffs</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose the format that best fits your tournament structure
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

                {/* Format Recommendations */}
                {recommendations && recommendations.length > 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-semibold mb-2">Format Recommendations for {watchedTeamIds.length} teams:</p>
                      <div className="space-y-1">
                        {recommendations.map((rec) => (
                          <div key={rec.format} className="flex items-center gap-2">
                            <span className={rec.format === watchedFormat ? "font-semibold" : ""}>
                              {getFormatLabel(rec.format)}:
                            </span>
                            {getRecommendationBadge(rec.format)}
                            {rec.note && (
                              <span className="text-sm text-muted-foreground">- {rec.note}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
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
