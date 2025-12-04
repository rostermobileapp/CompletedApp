import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload, Download, Trash2, Loader2, Lock, Filter, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TournamentPhotos } from "@/components/TournamentPhotos";
import { LeaguePhotos } from "@/components/LeaguePhotos";
import { TeamPhotos } from "@/components/TeamPhotos";
import { usePermissions } from "@/context/SubscriptionContext";
import { useState } from "react";

export default function MediaGalleryPage() {
  const [, tournamentParams] = useRoute("/media/tournament/:id");
  const [, leagueParams] = useRoute("/media/league/:id");
  const [, teamParams] = useRoute("/media/team/:id");
  const [, navigate] = useLocation();
  const [showUploader, setShowUploader] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [showOnlyMyPhotos, setShowOnlyMyPhotos] = useState(false);
  const { role } = usePermissions();

  // Determine entity type and ID
  const entityType = tournamentParams ? 'tournament' : leagueParams ? 'league' : teamParams ? 'team' : null;
  const entityId = tournamentParams?.id || leagueParams?.id || teamParams?.id;
  
  // Check if user has paid access (not free tier) for league photos
  const hasPaidAccess = role !== 'free_tier';

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

  // Check if current user is an approved participant (for tournaments)
  const { data: participants = [] } = useQuery<any[]>({
    queryKey: [`/api/tournaments/${entityId}/participants`],
    enabled: !!entityId && entityType === 'tournament' && !!currentUser?.id,
  });

  const isTournamentParticipant = currentUser?.id && participants.some(
    (p) => p.userId === currentUser.id && p.status === 'approved'
  );
  
  // Check if current user is a league member (for leagues)
  const { data: leagueMembership } = useQuery<any>({
    queryKey: [`/api/leagues/${entityId}/membership`],
    enabled: !!entityId && entityType === 'league' && !!currentUser?.id,
  });
  
  const isLeagueMember = leagueMembership?.status === 'approved';
  
  // Check if user is the league commissioner (commissioners always have access)
  const isLeagueCommissioner = league && currentUser?.id && league.commissionerId === currentUser.id;
  
  // Check if user is a secondary commissioner of this league
  const isSecondaryCommissioner = role === 'secondary_commissioner' && isLeagueMember;
  
  // User has access to league photos if they are:
  // 1. The league commissioner (always has access), OR
  // 2. A secondary commissioner with membership, OR
  // 3. An approved member with paid subscription
  const hasLeaguePhotoAccess = isLeagueCommissioner || isSecondaryCommissioner || (isLeagueMember && hasPaidAccess);
  
  // Fetch team data
  const { data: team } = useQuery<any>({
    queryKey: ['/api/teams', entityId],
    enabled: !!entityId && entityType === 'team'
  });

  // Check if current user is a team member (for team photos)
  const { data: teamMembership } = useQuery<any>({
    queryKey: [`/api/teams/${entityId}/membership`],
    enabled: !!entityId && entityType === 'team' && !!currentUser?.id,
  });

  const isTeamMember = teamMembership?.status === 'approved' || !!currentUser?.id;
  const isTeamCaptain = team && currentUser?.id && team.captainId === currentUser.id;

  // Determine if user can upload based on entity type
  const canUpload = entityType === 'tournament' ? isTournamentParticipant : entityType === 'team' ? isTeamMember : (entityType === 'league' && hasLeaguePhotoAccess);

  const entity = tournament || league || team;
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
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
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

          {/* Filters Section */}
          <div className="flex items-center gap-2">
            {/* Team Filter - Show when available */}
            {availableTeams.length > 0 && (
              <>
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
                  <SelectTrigger className="w-[140px] md:w-[180px]" data-testid="select-team-filter-header">
                    <SelectValue placeholder="Filter by team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {availableTeams.map((team: any) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name || team.teamName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {/* Uploaded by Me Toggle */}
            <Button
              variant={showOnlyMyPhotos ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOnlyMyPhotos(!showOnlyMyPhotos)}
              className="flex items-center gap-1.5"
              data-testid="button-filter-my-photos"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">My Photos</span>
            </Button>
          </div>

          {canUpload && (
            <Button
              onClick={() => setShowUploader(true)}
              disabled={isUploading}
              size="default"
              data-testid="button-upload-photos"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Photos Content */}
      <div className="pb-20">
        {entityType === 'tournament' && entityId && (
          <TournamentPhotos 
            tournamentId={entityId} 
            currentUserId={currentUser?.id}
            showUploader={showUploader}
            onShowUploaderChange={setShowUploader}
            onUploadStart={() => setIsUploading(true)}
            onUploadComplete={() => setIsUploading(false)}
            selectedTeamFilter={selectedTeamFilter}
            onTeamsLoaded={setAvailableTeams}
            showOnlyMyPhotos={showOnlyMyPhotos}
          />
        )}
        {entityType === 'league' && entityId && (
          !hasLeaguePhotoAccess ? (
            <div className="p-12 text-center max-w-md mx-auto">
              <div className="rounded-full bg-muted w-20 h-20 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
              <p className="text-muted-foreground mb-6">
                League photo galleries are available for paid subscribers and league commissioners. Upgrade your account to access this feature.
              </p>
              <Button 
                onClick={() => navigate('/payments')}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-upgrade-now"
              >
                Upgrade Now
              </Button>
            </div>
          ) : (
            <LeaguePhotos 
              leagueId={entityId} 
              currentUserId={currentUser?.id}
              showUploader={showUploader}
              onShowUploaderChange={setShowUploader}
              onUploadStart={() => setIsUploading(true)}
              onUploadComplete={() => setIsUploading(false)}
              selectedTeamFilter={selectedTeamFilter}
              onTeamsLoaded={setAvailableTeams}
              showOnlyMyPhotos={showOnlyMyPhotos}
            />
          )
        )}
        {entityType === 'team' && entityId && (
          <TeamPhotos 
            teamId={entityId} 
            currentUserId={currentUser?.id}
            showUploader={showUploader}
            onShowUploaderChange={setShowUploader}
            onUploadStart={() => setIsUploading(true)}
            onUploadComplete={() => setIsUploading(false)}
            showOnlyMyPhotos={showOnlyMyPhotos}
          />
        )}
      </div>
    </div>
  );
}
