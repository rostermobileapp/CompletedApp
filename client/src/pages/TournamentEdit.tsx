import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tournament } from "@shared/schema";

export default function TournamentEdit() {
  const [, params] = useRoute("/tournaments/:tournamentId/edit");
  const [, setLocation] = useLocation();
  const tournamentId = params?.tournamentId;

  const { data: tournament, isLoading } = useQuery<Tournament>({
    queryKey: ['/api/tournaments', tournamentId],
    enabled: !!tournamentId
  });

  if (isLoading) {
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
          <CardHeader>
            <CardTitle>Edit Tournament Settings</CardTitle>
          </CardHeader>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">
              Tournament editing is coming soon! For now, you can delete and recreate the tournament if you need to make changes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
