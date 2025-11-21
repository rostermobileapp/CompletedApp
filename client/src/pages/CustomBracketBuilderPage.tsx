import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomBracketBuilder } from "@/components/CustomBracketBuilder";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tournament } from "@shared/schema";

export default function CustomBracketBuilderPage() {
  const [, params] = useRoute("/tournaments/:tournamentId/custom-builder");
  const [, setLocation] = useLocation();
  const tournamentId = params?.tournamentId;

  const { data: tournament, isLoading } = useQuery<Tournament>({
    queryKey: ['/api/tournaments', tournamentId],
    enabled: !!tournamentId
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center">Tournament not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(`/tournaments/${tournamentId}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{tournament.name}</h1>
            <p className="text-sm text-muted-foreground">Custom Bracket Builder</p>
          </div>
        </div>
      </div>

      {/* Builder */}
      <div className="flex-1">
        <CustomBracketBuilder />
      </div>
    </div>
  );
}
