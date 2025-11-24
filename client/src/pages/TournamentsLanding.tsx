import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Trophy, ArrowRight, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

type Tournament = {
  id: string;
  name: string;
  format: string;
  status: string;
  type: 'standalone' | 'season_playoff';
  leagueId: string | null;
  leagueName: string | null;
  teamCount: number;
};

export default function TournamentsLanding() {
  const [, navigate] = useLocation();

  // Fetch all tournaments for the user
  const { data: tournaments, isLoading } = useQuery<Tournament[]>({
    queryKey: ['/api/tournaments/all'],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <Skeleton className="h-10 w-64 mb-2" />
            <Skeleton className="h-6 w-96" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Tournaments
          </h1>
          <p className="text-muted-foreground">
            Manage all your tournaments in one place
          </p>
        </div>

        {/* Create Tournament Button */}
        <div className="mb-6">
          <Button
            onClick={() => navigate('/tournaments/create')}
            data-testid="create-tournament-btn"
            size="lg"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Tournament
          </Button>
        </div>

        {/* Show all tournaments */}
        {tournaments && tournaments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((tournament) => (
              <Card
                key={tournament.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/tournaments/${tournament.id}`)}
                data-testid={`card-tournament-${tournament.id}`}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Trophy className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg truncate">
                          {tournament.name}
                        </CardTitle>
                      </div>
                      <CardDescription className="capitalize">
                        {tournament.format.replace(/_/g, ' ')}
                      </CardDescription>
                      {tournament.leagueName && (
                        <div className="mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {tournament.leagueName}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {tournament.teamCount || 0} teams
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No tournaments yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first tournament to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
