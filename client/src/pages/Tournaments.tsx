import { useQuery } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { useState } from "react";
import { Plus, Trophy, Calendar, Users, ChevronRight } from "lucide-react";
import { getImageUrl } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useIsMobile";
import { DesktopRequiredDialog, DESKTOP_REQUIRED_COPY } from "@/components/DesktopRequiredDialog";
import type { Tournament } from "@shared/schema";

export default function Tournaments() {
  const [, params] = useRoute("/leagues/:leagueId/tournaments");
  const [, navigate] = useLocation();
  const leagueId = params?.leagueId;
  const isMobile = useIsMobile();
  const [showMobileDialog, setShowMobileDialog] = useState(false);

  const { data: tournaments, isLoading } = useQuery<Tournament[]>({
    queryKey: ['/api/leagues', leagueId, 'tournaments'],
    enabled: !!leagueId
  });

  function handleCreateTournament() {
    if (isMobile) {
      setShowMobileDialog(true);
    } else {
      navigate('/tournaments/create');
    }
  }

  const getStatusBadge = (status: Tournament['status']) => {
    const variants: Record<Tournament['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline', text: string }> = {
      draft: { variant: 'outline', text: 'Draft' },
      active: { variant: 'default', text: 'Active' },
      completed: { variant: 'secondary', text: 'Completed' }
    };
    const config = variants[status];
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.text}</Badge>;
  };

  const getFormatLabel = (format: Tournament['format']) => {
    const labels: Record<Tournament['format'], string> = {
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      round_robin: 'Round Robin',
      round_robin_split: 'Round Robin + Playoffs',
      three_game_guarantee: '3-Game Guarantee',
      custom_bracket: 'Custom Bracket'
    };
    return labels[format];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-40" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
                <Trophy className="h-8 w-8 text-primary" />
                Tournaments
              </h1>
              <p className="text-muted-foreground">
                Create and manage playoffs and standalone tournaments
              </p>
            </div>
            <Button
              size="lg"
              className="w-full md:w-auto"
              data-testid="button-create-tournament"
              onClick={handleCreateTournament}
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Tournament
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        {!tournaments || tournaments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Trophy className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2" data-testid="text-empty-title">No Tournaments Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Create your first tournament to organize playoffs or a standalone competition
              </p>
              <Button
                data-testid="button-create-first-tournament"
                onClick={handleCreateTournament}
              >
                <Plus className="h-5 w-5 mr-2" />
                Create Your First Tournament
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((tournament) => (
              <Link
                key={tournament.id}
                href={`/tournaments/${tournament.id}`}
              >
                <Card 
                  className="h-full hover:shadow-lg transition-shadow cursor-pointer"
                  data-testid={`card-tournament-${tournament.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {tournament.logoUrl ? (
                            <img
                              src={getImageUrl(tournament.logoUrl) || undefined}
                              alt={`${tournament.name} logo`}
                              className="w-full h-full object-cover"
                              data-testid={`img-tournament-logo-${tournament.id}`}
                            />
                          ) : (
                            <Trophy className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        <CardTitle className="text-lg line-clamp-2" data-testid={`text-tournament-name-${tournament.id}`}>
                          {tournament.name}
                        </CardTitle>
                      </div>
                      {getStatusBadge(tournament.status)}
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {tournament.type === 'season_playoff' ? 'Season Playoff' : 'Standalone'}
                      </Badge>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span data-testid={`text-format-${tournament.id}`}>
                        {getFormatLabel(tournament.format)}
                      </span>
                    </div>
                    
                    {tournament.startDate && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span data-testid={`text-start-date-${tournament.id}`}>
                          {new Date(tournament.startDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {tournament.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {tournament.description}
                      </p>
                    )}

                    <div className="flex items-center text-sm text-primary pt-2">
                      <span>View Bracket</span>
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <DesktopRequiredDialog
        open={showMobileDialog}
        onOpenChange={setShowMobileDialog}
        description={DESKTOP_REQUIRED_COPY.tournament}
      />
    </div>
  );
}
