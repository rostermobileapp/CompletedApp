import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Trophy, Calendar, ArrowLeft, MapPin, Clock, Users, Check, X, UserPlus, Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useLocation, useRoute } from "wouter";
import { useState, useRef } from "react";
import type { User } from "@shared/schema";
import DutiesSection from "@/components/DutiesSection";
import LocationLink from "@/components/LocationLink";
import { SubstituteRequestModal } from "@/components/SubstituteRequestModal";

interface TeamEventData {
  id: string;
  teamId: string;
  creatorId: string;
  eventType: 'general' | 'practice' | 'scrimmage' | 'social';
  title: string;
  description?: string | null;
  scheduledAt: string;
  endTime?: string | null;
  location?: string | null;
  opponentName?: string | null;
  isInternalScrimmage?: boolean;
  notes?: string | null;
  maxParticipants?: number | null;
  photoUrl?: string | null;
  rsvps: Array<{
    id: string;
    userId: string;
    status: 'attending' | 'not_attending' | 'no_response';
    respondedAt?: string | null;
    firstName: string;
    lastName: string;
    profileImageUrl?: string | null;
  }>;
  team: {
    id: string;
    name: string;
    captainId?: string | null;
    leagueId?: string | null;
  };
  teamMembers: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string | null;
    isCaptain?: boolean;
  }>;
  isCaptain: boolean;
  userRsvp: {
    id: string;
    userId: string;
    status: 'attending' | 'not_attending' | 'no_response';
  } | null;
}

export default function TeamEventDetails() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/team-event/:id");
  const eventId = params?.id;
  const [substituteModalOpen, setSubstituteModalOpen] = useState(false);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: eventData, isLoading } = useQuery<TeamEventData>({
    queryKey: [`/api/team-events/${eventId}`],
    enabled: !!eventId,
  });

  const rsvpMutation = useMutation({
    mutationFn: async (status: 'attending' | 'not_attending') => {
      await apiRequest("POST", `/api/team-events/${eventId}/rsvp`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/team-events/${eventId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
      toast({
        title: "RSVP Updated",
        description: "Your attendance status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update RSVP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updatePhotoMutation = useMutation({
    mutationFn: async (photoUrl: string | null) => {
      await apiRequest("PATCH", `/api/team-events/${eventId}`, { photoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/team-events/${eventId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
      setEditPhotoPreview(null);
      toast({ title: "Photo updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update photo.", variant: "destructive" });
    },
  });

  async function cropImageTo3x5(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const targetRatio = 3 / 5;
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) { sw = img.height * targetRatio; sx = (img.width - sw) / 2; }
        else { sh = img.width / targetRatio; sy = (img.height - sh) / 2; }
        const canvas = document.createElement('canvas');
        canvas.width = sw; canvas.height = sh;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not available'));
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), file.type || 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
      img.src = url;
    });
  }

  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const cropped = await cropImageTo3x5(file);
      const previewUrl = URL.createObjectURL(cropped);
      setEditPhotoPreview(previewUrl);
      const formData = new FormData();
      formData.append('photo', cropped, file.name);
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/event-photos/upload', {
        method: 'POST',
        body: formData,
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { path } = await res.json();
      updatePhotoMutation.mutate(path);
    } catch {
      toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
      setEditPhotoPreview(null);
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                navigate("/calendar");
              }}
              className="p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Event Details</h1>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-4 animate-pulse">
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-background pb-36">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                navigate("/calendar");
              }}
              className="p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Event Details</h1>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6">
            <p className="text-center text-muted-foreground">Event not found</p>
          </div>
        </div>
      </div>
    );
  }

  const isScrimmage = eventData.eventType === 'scrimmage';
  const isGeneralEvent = eventData.eventType === 'general';
  const showSubstituteButton = !isGeneralEvent && eventData.isCaptain && !!eventData.team.leagueId;

  const attendingCount = eventData.rsvps.filter(r => r.status === 'attending').length;
  const notAttendingCount = eventData.rsvps.filter(r => r.status === 'not_attending').length;
  const noResponseCount = eventData.teamMembers.length - attendingCount - notAttendingCount;
  const userStatus = eventData.userRsvp?.status || 'no_response';

  const notAttendingPlayers = eventData.rsvps
    .filter(r => r.status === 'not_attending')
    .map(r => ({
      user: {
        id: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        profileImageUrl: r.profileImageUrl,
      }
    }));

  const gameDate = format(new Date(eventData.scheduledAt), 'yyyy-MM-dd');
  const canEditPhoto = isGeneralEvent && (eventData.isCaptain || eventData.creatorId === (user as User | null)?.id);
  const displayPhotoUrl = editPhotoPreview || eventData.photoUrl;

  return (
    <div className="min-h-screen bg-background pb-36">
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPageTransitionDirection('down');
              navigate("/calendar");
            }}
            className="p-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold">
            {isScrimmage ? 'Scrimmage Details' : 'Event Details'}
          </h1>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] overflow-hidden">
          {/* Hidden file input for photo editing */}
          {canEditPhoto && (
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handlePhotoFileChange}
            />
          )}

          {/* Photo display / edit area */}
          {displayPhotoUrl ? (
            <div className="relative w-full" style={{ aspectRatio: '3/5' }}>
              <img
                src={displayPhotoUrl}
                alt={eventData.title}
                className="w-full h-full object-cover"
              />
              {isUploadingPhoto && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <p className="text-white text-sm font-medium">Uploading…</p>
                </div>
              )}
              {canEditPhoto && !isUploadingPhoto && (
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => updatePhotoMutation.mutate(null)}
                    disabled={updatePhotoMutation.isPending}
                    className="bg-black/60 hover:bg-red-600 text-white rounded-full p-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : canEditPhoto ? (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-6 border-b border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span className="text-sm">Add cover photo</span>
            </button>
          ) : null}

          <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              isScrimmage ? 'bg-orange-500' : 'bg-blue-500'
            }`}>
              {isScrimmage ? (
                <Trophy className="w-6 h-6 text-white" />
              ) : (
                <Calendar className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{eventData.title}</h2>
                <span className={`text-xs text-white px-2 py-0.5 rounded ${
                  isScrimmage ? 'bg-orange-500' : 'bg-blue-500'
                }`}>
                  {isScrimmage ? 'Scrimmage' : 'Team Event'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{eventData.team.name}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm">
                {format(new Date(eventData.scheduledAt), 'EEEE, MMMM d • h:mm a')}
                {eventData.endTime && ` - ${format(new Date(eventData.endTime), 'h:mm a')}`}
              </p>
            </div>

            {eventData.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <LocationLink location={eventData.location} />
                </p>
              </div>
            )}

            {isScrimmage && !eventData.isInternalScrimmage && eventData.opponentName && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">vs {eventData.opponentName}</p>
              </div>
            )}
          </div>

          {(eventData.description || eventData.notes) && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm">{eventData.description || eventData.notes}</p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="font-medium mb-3">Your RSVP</h3>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={userStatus === 'attending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => rsvpMutation.mutate('attending')}
                disabled={rsvpMutation.isPending}
                className={userStatus === 'attending' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                <Check className="w-4 h-4 mr-1" />
                Attending
              </Button>
              <Button
                variant={userStatus === 'not_attending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => rsvpMutation.mutate('not_attending')}
                disabled={rsvpMutation.isPending}
                className={userStatus === 'not_attending' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                <X className="w-4 h-4 mr-1" />
                Not Attending
              </Button>
              {showSubstituteButton && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubstituteModalOpen(true)}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Find Substitutes
                </Button>
              )}
            </div>
          </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Attendance</h3>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{attendingCount}</p>
              <p className="text-xs text-muted-foreground">Attending</p>
            </div>
            <div className="text-center p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{notAttendingCount}</p>
              <p className="text-xs text-muted-foreground">Not Attending</p>
            </div>
            <div className="text-center p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{noResponseCount}</p>
              <p className="text-xs text-muted-foreground">No Response</p>
            </div>
          </div>

          {eventData.rsvps.filter(r => r.status === 'attending').length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">Confirmed Attendees</h4>
              {eventData.rsvps
                .filter(r => r.status === 'attending')
                .map((rsvp) => (
                  <div 
                    key={rsvp.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                      <span className="text-foreground text-xs font-semibold">
                        {rsvp.firstName?.[0] || '?'}{rsvp.lastName?.[0] || ''}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {rsvp.firstName} {rsvp.lastName}
                      </p>
                    </div>
                    <div className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                      Confirmed
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {isScrimmage && user && (
          <DutiesSection
            gameId={eventData.id}
            teamId={eventData.teamId}
            userId={(user as User).id}
            isCaptain={eventData.isCaptain}
            isTeamMember={true}
          />
        )}
      </div>

      {showSubstituteButton && (
        <SubstituteRequestModal
          teamEventId={eventData.id}
          gameDate={gameDate}
          leagueId={eventData.team.leagueId || ''}
          homeTeamId={eventData.teamId}
          awayTeamId=""
          originalPlayerTeamId={eventData.teamId}
          isOpen={substituteModalOpen}
          onClose={() => setSubstituteModalOpen(false)}
          notAttendingPlayers={notAttendingPlayers}
        />
      )}
    </div>
  );
}
