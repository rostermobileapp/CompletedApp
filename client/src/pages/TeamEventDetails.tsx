import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Trophy, Calendar, ArrowLeft, MapPin, Clock, Users, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useRoute } from "wouter";
import type { User } from "@shared/schema";
import DutiesSection from "@/components/DutiesSection";

interface TeamEventData {
  id: string;
  teamId: string;
  creatorId: string;
  eventType: 'general_event' | 'scrimmage';
  title: string;
  description?: string | null;
  scheduledAt: string;
  endTime?: string | null;
  location?: string | null;
  opponentName?: string | null;
  isInternalScrimmage?: boolean;
  notes?: string | null;
  maxParticipants?: number | null;
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
          <div className="bg-card rounded-xl border border-border p-4 animate-pulse">
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-background pb-20">
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
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-center text-muted-foreground">Event not found</p>
          </div>
        </div>
      </div>
    );
  }

  const isScrimmage = eventData.eventType === 'scrimmage';
  const attendingCount = eventData.rsvps.filter(r => r.status === 'attending').length;
  const notAttendingCount = eventData.rsvps.filter(r => r.status === 'not_attending').length;
  const noResponseCount = eventData.teamMembers.length - attendingCount - notAttendingCount;
  const userStatus = eventData.userRsvp?.status || 'no_response';

  return (
    <div className="min-h-screen bg-background pb-20">
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
        <div className="bg-card rounded-xl border border-border p-6">
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
                <p className="text-sm text-muted-foreground">{eventData.location}</p>
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
            <div className="flex gap-2">
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
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
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
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#e2e2e2] dark:bg-[#212121] border"
                  >
                    <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                      <span className="text-black dark:text-white text-xs font-semibold">
                        {rsvp.firstName?.[0] || '?'}{rsvp.lastName?.[0] || ''}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-black dark:text-white">
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
    </div>
  );
}
