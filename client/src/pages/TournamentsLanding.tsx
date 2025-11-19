import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Trophy, ArrowRight, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type League = {
  id: number;
  name: string;
  sport: string;
  logoUrl?: string;
  tournamentCount?: number;
};

export default function TournamentsLanding() {
  const [, navigate] = useLocation();

  // Fetch leagues the user can manage
  const { data: leagues, isLoading } = useQuery<League[]>({
    queryKey: ['/api/leagues/manageable'],
  });

  // Auto-redirect if user only manages one league
  useEffect(() => {
    if (leagues && leagues.length === 1) {
      navigate(`/leagues/${leagues[0].id}/tournaments`);
    }
  }, [leagues, navigate]);

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

  if (!leagues || leagues.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
              Tournaments
            </h1>
            <p className="text-muted-foreground">
              Manage tournaments and playoffs for your leagues
            </p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Trophy className="h-8 w-8 text-muted-foreground" />
                <div>
                  <CardTitle>No Leagues Found</CardTitle>
                  <CardDescription>
                    You need to be a commissioner or secondary commissioner of a league to manage tournaments.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => navigate('/create-league')}
                data-testid="button-create-league"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create a League
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If only one league, the useEffect will redirect
  // This should rarely render, but we'll show it anyway
  if (leagues.length === 1) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-6xl mx-auto flex items-center justify-center">
          <div className="text-center">
            <Trophy className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
            <p className="text-muted-foreground">Redirecting to tournaments...</p>
          </div>
        </div>
      </div>
    );
  }

  // Multiple leagues - show selector
  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Tournaments
          </h1>
          <p className="text-muted-foreground">
            Select a league to view and manage its tournaments
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map((league) => (
            <Card
              key={league.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/leagues/${league.id}/tournaments`)}
              data-testid={`card-league-${league.id}`}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  {league.logoUrl ? (
                    <img
                      src={league.logoUrl}
                      alt={league.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Trophy className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">
                      {league.name}
                    </CardTitle>
                    <CardDescription className="capitalize">
                      {league.sport}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {league.tournamentCount !== undefined ? (
                      <>
                        {league.tournamentCount} tournament{league.tournamentCount !== 1 ? 's' : ''}
                      </>
                    ) : (
                      'View tournaments'
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
