import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TournamentPhotos } from "@/components/TournamentPhotos";

export default function MediaGalleryPage() {
  const [, tournamentParams] = useRoute("/media/tournament/:id");
  const [, leagueParams] = useRoute("/media/league/:id");
  const [, navigate] = useLocation();

  // Determine entity type and ID
  const entityType = tournamentParams ? 'tournament' : leagueParams ? 'league' : null;
  const entityId = tournamentParams?.id || leagueParams?.id;

  // Fetch current user
  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/user']
  });

  // Fetch entity metadata
  const { data: tournament } = useQuery<any>({
    queryKey: ['/api/tournaments', entityId],
    enabled: !!entityId && entityType === 'tournament'
  });

  const { data: league } = useQuery<any>({
    queryKey: ['/api/leagues', entityId],
    enabled: !!entityId && entityType === 'league'
  });

  const entity = tournament || league;
  const entityName = entity?.name || 'Photos';

  if (!entityId || !entityType) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid media gallery link</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold" data-testid="text-entity-name">{entityName}</h1>
            <p className="text-sm text-muted-foreground">Photo Gallery</p>
          </div>
        </div>
      </div>

      {/* Photos Content */}
      <div className="pb-20">
        {entityType === 'tournament' && entityId && (
          <TournamentPhotos 
            tournamentId={entityId} 
            currentUserId={currentUser?.id}
          />
        )}
        {entityType === 'league' && entityId && (
          <div className="p-6 text-center">
            <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">League photo galleries coming soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}
