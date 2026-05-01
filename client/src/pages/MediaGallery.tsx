import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload, Download, Trash2, Loader2, Lock, User, Tag, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TournamentPhotos } from "@/components/TournamentPhotos";
import { LeaguePhotos } from "@/components/LeaguePhotos";
import { TeamPhotos } from "@/components/TeamPhotos";
import { usePermissions } from "@/context/SubscriptionContext";
import { useState, useRef, useEffect } from "react";
import { getImageUrl, apiRequest } from "@/lib/queryClient";
import { useSlideUpOverlay } from "@/components/SlideUpOverlay";

interface FilterUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl?: string;
}

function UserFilterSearch({
  tournamentId,
  leagueId,
  onUserSelect,
}: {
  tournamentId?: string;
  leagueId?: string;
  onUserSelect: (userId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchResults = [], isLoading } = useQuery<FilterUser[]>({
    queryKey: ['/api/users/search', searchQuery, tournamentId, leagueId],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const params = new URLSearchParams({ q: searchQuery });
      if (tournamentId) params.append('tournamentId', tournamentId);
      if (leagueId) params.append('leagueId', leagueId);
      const response = await apiRequest('GET', `/api/users/search?${params}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30000,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search for a person to filter photos..."
          className="pl-9"
          data-testid="input-search-person-filter"
        />
      </div>
      {isOpen && searchQuery.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-background hairline elev-lift rounded-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              No users found
            </div>
          ) : (
            searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onUserSelect(user.id);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 flex items-center gap-3 hover:bg-accent text-left"
                data-testid={`button-select-user-${user.id}`}
              >
                {user.profileImageUrl ? (
                  <img
                    src={getImageUrl(user.profileImageUrl)}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <span className="text-sm font-medium">
                  {user.firstName} {user.lastName}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface MediaGalleryPageProps {
  overlayEntityType?: 'tournament' | 'league' | 'team';
  overlayEntityId?: string;
}

export default function MediaGalleryPage({ overlayEntityType, overlayEntityId }: MediaGalleryPageProps = {}) {
  const [, tournamentParams] = useRoute("/media/tournament/:id");
  const [, leagueParams] = useRoute("/media/league/:id");
  const [, teamParams] = useRoute("/media/team/:id");
  const [, navigate] = useLocation();
  
  let slideOverlay: ReturnType<typeof useSlideUpOverlay> | null = null;
  try {
    slideOverlay = useSlideUpOverlay();
  } catch {
    slideOverlay = null;
  }
  
  const handleBack = () => {
    if (slideOverlay?.isOverlayRoute) {
      slideOverlay.closeWithSlideDown('/');
    } else {
      navigate('/');
    }
  };
  const [showUploader, setShowUploader] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | undefined>(undefined);
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [showOnlyMyPhotos, setShowOnlyMyPhotos] = useState(false);
  const [showUserFilter, setShowUserFilter] = useState(false);
  const { role, canAccessPremiumFeatures } = usePermissions();
  
  // FREE TIER RESTRICTION: Block access to Photos page for free tier users
  const isFreeTier = !canAccessPremiumFeatures();
  
  if (isFreeTier) {
    return (
      <div className="min-h-screen bg-background" data-page-content>
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
          <div className="flex items-center gap-4 px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Photo Gallery</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 mt-12">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Camera className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
          <p className="text-muted-foreground text-center max-w-sm mb-6">
            Access to the photo gallery is available with a Player Pro or Commissioner subscription.
          </p>
          <Button 
            onClick={() => navigate('/subscription')}
            size="lg"
            data-testid="button-upgrade-photos"
          >
            Upgrade to View Photos
          </Button>
        </div>
      </div>
    );
  }

  const entityType = overlayEntityType || (tournamentParams ? 'tournament' : leagueParams ? 'league' : teamParams ? 'team' : null);
  const entityId = overlayEntityId || tournamentParams?.id || leagueParams?.id || teamParams?.id;
  
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

  const { data: league, isLoading: leagueLoading } = useQuery<any>({
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
  const { data: userLeagueMemberships = [], isLoading: membershipLoading } = useQuery<any[]>({
    queryKey: ['/api/user/league-memberships'],
    enabled: !!currentUser?.id,
  });
  
  // Find the membership for the current league
  const leagueMembership = userLeagueMemberships.find((m: any) => m.leagueId === entityId);
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
  
  // Track if league access data is still loading
  const isLeagueAccessLoading = entityType === 'league' && (leagueLoading || membershipLoading);
  
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
    <div className="min-h-screen bg-background" data-page-content>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            {entityType !== 'league' && (
              <>
                <h1 className="text-xl font-semibold" data-testid="text-entity-name">{entityName}</h1>
                <p className="text-sm text-muted-foreground">Photo Gallery</p>
              </>
            )}
          </div>

          {/* Filters Section */}
          <div className="flex items-center gap-2">
            {/* Team Filter - Show when available */}
            {availableTeams.length > 0 && (
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

            {/* Filter by Tagged Person */}
            <Button
              variant={selectedUserFilter ? "default" : "outline"}
              size="sm"
              onClick={() => setShowUserFilter(!showUserFilter)}
              className="flex items-center gap-1.5"
              data-testid="button-filter-by-person"
            >
              <Tag className="h-4 w-4" />
              <span className="hidden sm:inline">{selectedUserFilter ? "Person" : "Find Person"}</span>
            </Button>
            {selectedUserFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUserFilter(undefined)}
                data-testid="button-clear-person-filter"
              >
                Clear
              </Button>
            )}
          </div>

          {canUpload && (
            <Button
              onClick={() => setShowUploader(true)}
              disabled={isUploading}
              size="icon"
              data-testid="button-upload-photos"
            >
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </div>
      {/* User Filter Selector */}
      {showUserFilter && (
        <div className="px-4 py-3 border-b border-border bg-muted/50">
          <UserFilterSearch
            tournamentId={entityType === 'tournament' ? entityId : undefined}
            leagueId={entityType === 'league' ? entityId : undefined}
            onUserSelect={(userId: string) => {
              setSelectedUserFilter(userId);
              setShowUserFilter(false);
            }}
          />
        </div>
      )}

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
            selectedUserFilter={selectedUserFilter}
            onTeamsLoaded={setAvailableTeams}
            showOnlyMyPhotos={showOnlyMyPhotos}
          />
        )}
        {entityType === 'league' && entityId && (
          isLeagueAccessLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !hasLeaguePhotoAccess ? (
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
                className="bg-primary hover:bg-primary"
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
              selectedUserFilter={selectedUserFilter}
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
