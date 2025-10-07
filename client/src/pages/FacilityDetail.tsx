import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { MapPin, Users, Calendar as CalendarIcon, Clock, UserPlus, ArrowLeft, Home } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Facility, CalendarEvent, FacilityMembership } from "@shared/schema";

export default function FacilityDetail() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [, params] = useRoute("/facilities/:id");
  const facilityId = params?.id;

  const { data: facility, isLoading: facilityLoading } = useQuery<Facility>({
    queryKey: ['/api/facilities', facilityId],
    queryFn: async () => {
      const response = await fetch(`/api/facilities/${facilityId}`);
      if (!response.ok) throw new Error('Failed to fetch facility');
      return response.json();
    },
    enabled: !!facilityId,
  });

  const { data: events, isLoading: eventsLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['/api/facilities', facilityId, 'calendar'],
    queryFn: async () => {
      const response = await fetch(`/api/facilities/${facilityId}/calendar`);
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
    enabled: !!facilityId,
  });

  const { data: membership } = useQuery<{ hasActiveMembership: boolean }>({
    queryKey: ['/api/facilities', facilityId, 'memberships', 'check'],
    queryFn: async () => {
      if (!isAuthenticated) return { hasActiveMembership: false };
      const response = await fetch(`/api/facilities/${facilityId}/memberships/check`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) return { hasActiveMembership: false };
        throw new Error('Failed to check membership');
      }
      return response.json();
    },
    enabled: !!facilityId,
  });

  const { data: members } = useQuery<FacilityMembership[]>({
    queryKey: ['/api/facilities', facilityId, 'members'],
    queryFn: async () => {
      const response = await fetch(`/api/facilities/${facilityId}/members`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) return [];
        throw new Error('Failed to fetch members');
      }
      return response.json();
    },
    enabled: !!facilityId,
  });

  const joinFacilityMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/facilities/${facilityId}/memberships`, {}),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "You've joined the facility!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/facilities', facilityId, 'memberships', 'check'] });
      queryClient.invalidateQueries({ queryKey: ['/api/facilities', facilityId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/me/facility-memberships'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join facility",
        variant: "destructive",
      });
    },
  });

  const joinEventMutation = useMutation({
    mutationFn: (eventId: string) => apiRequest('POST', `/api/calendar-events/${eventId}/participants`, {}),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "You've joined the event!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/facilities', facilityId, 'calendar'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join event",
        variant: "destructive",
      });
    },
  });

  if (facilityLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="loading-facility">
        <div className="animate-pulse text-center">
          <div className="text-2xl font-bold text-primary">Loading...</div>
        </div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium mb-4" data-testid="text-facility-not-found">Facility not found</p>
            <Button asChild data-testid="button-back-to-facilities">
              <Link href="/facilities">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Facilities
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const upcomingEvents = events?.filter(e => new Date(e.startTime) > new Date()) || [];
  const pastEvents = events?.filter(e => new Date(e.startTime) <= new Date()) || [];
  const hasMembership = membership?.hasActiveMembership || false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" asChild data-testid="button-back">
            <Link href="/facilities">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Facilities
            </Link>
          </Button>
          {isAuthenticated && (
            <Button variant="outline" asChild data-testid="button-dashboard">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </Link>
            </Button>
          )}
        </div>

        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-3xl mb-2" data-testid="text-facility-name">
                  {facility.name}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 text-base" data-testid="text-facility-location">
                  <MapPin className="h-4 w-4" />
                  {facility.address && `${facility.address}, `}
                  {facility.city}, {facility.state}
                </CardDescription>
              </div>
              {isAuthenticated && !hasMembership && (
                <Button
                  onClick={() => joinFacilityMutation.mutate()}
                  disabled={joinFacilityMutation.isPending}
                  size="lg"
                  data-testid="button-join-facility"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {joinFacilityMutation.isPending ? "Joining..." : "Join Facility"}
                </Button>
              )}
              {isAuthenticated && hasMembership && (
                <Badge variant="default" className="text-base px-4 py-2" data-testid="badge-member">
                  <Users className="h-4 w-4 mr-2" />
                  Member
                </Badge>
              )}
              {!isAuthenticated && (
                <Button variant="outline" asChild data-testid="button-login-to-join">
                  <Link href="/">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Login to Join
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Sports Offered</h3>
                <div className="flex flex-wrap gap-2">
                  {(facility.sports || []).map((sport) => (
                    <Badge key={sport} variant="secondary" data-testid={`badge-sport-${sport}`}>
                      {sport}
                    </Badge>
                  ))}
                </div>
              </div>
              {facility.description && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">About</h3>
                    <p className="text-muted-foreground" data-testid="text-facility-description">
                      {facility.description}
                    </p>
                  </div>
                </>
              )}
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Members</p>
                    <p className="font-semibold" data-testid="text-member-count">
                      {members?.length || 0}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Upcoming Events</p>
                    <p className="font-semibold" data-testid="text-upcoming-events-count">
                      {upcomingEvents.length}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-semibold" data-testid="text-facility-city-state">
                      {facility.city}, {facility.state}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="upcoming" data-testid="tab-upcoming">
              Upcoming Events
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="tab-past">
              Past Events
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {eventsLoading ? (
              <div className="grid gap-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                      <div className="h-4 bg-muted rounded w-1/3" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : upcomingEvents.length > 0 ? (
              <div className="grid gap-4">
                {upcomingEvents.map((event) => (
                  <Card key={event.id} data-testid={`card-event-${event.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl" data-testid={`text-event-title-${event.id}`}>
                            {event.title}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-4 mt-2">
                            <span className="flex items-center gap-1" data-testid={`text-event-date-${event.id}`}>
                              <CalendarIcon className="h-4 w-4" />
                              {format(new Date(event.startTime), "PPP")}
                            </span>
                            <span className="flex items-center gap-1" data-testid={`text-event-time-${event.id}`}>
                              <Clock className="h-4 w-4" />
                              {format(new Date(event.startTime), "p")} - {format(new Date(event.endTime), "p")}
                            </span>
                          </CardDescription>
                        </div>
                        {isAuthenticated && hasMembership && (
                          <Button
                            onClick={() => joinEventMutation.mutate(event.id)}
                            disabled={joinEventMutation.isPending}
                            data-testid={`button-join-event-${event.id}`}
                          >
                            {joinEventMutation.isPending ? "Joining..." : "Join Event"}
                          </Button>
                        )}
                        {isAuthenticated && !hasMembership && event.requiresMembership && (
                          <Button
                            variant="outline"
                            onClick={() => joinFacilityMutation.mutate()}
                            disabled={joinFacilityMutation.isPending}
                            data-testid={`button-join-facility-for-event-${event.id}`}
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            {joinFacilityMutation.isPending ? "Joining..." : "Join Facility to Participate"}
                          </Button>
                        )}
                        {!isAuthenticated && event.requiresMembership && (
                          <Button variant="outline" asChild data-testid={`button-login-for-event-${event.id}`}>
                            <Link href="/">
                              Login to Join
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    {event.description && (
                      <CardContent>
                        <p className="text-muted-foreground" data-testid={`text-event-description-${event.id}`}>
                          {event.description}
                        </p>
                        <div className="flex items-center gap-4 mt-4 text-sm">
                          <span data-testid={`text-event-participants-${event.id}`}>
                            <Users className="h-4 w-4 inline mr-1" />
                            {event.currentParticipantsCount}
                            {event.maxParticipants && ` / ${event.maxParticipants}`} participants
                          </span>
                          {event.requiresMembership && (
                            <Badge variant="outline" data-testid={`badge-members-only-${event.id}`}>
                              Members Only
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                  <p className="text-lg font-medium" data-testid="text-no-upcoming-events">
                    No upcoming events
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-no-upcoming-events-description">
                    Check back later for new events
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {eventsLoading ? (
              <div className="grid gap-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                      <div className="h-4 bg-muted rounded w-1/3" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : pastEvents.length > 0 ? (
              <div className="grid gap-4">
                {pastEvents.map((event) => (
                  <Card key={event.id} className="opacity-75" data-testid={`card-past-event-${event.id}`}>
                    <CardHeader>
                      <CardTitle className="text-xl" data-testid={`text-past-event-title-${event.id}`}>
                        {event.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4">
                        <span className="flex items-center gap-1" data-testid={`text-past-event-date-${event.id}`}>
                          <CalendarIcon className="h-4 w-4" />
                          {format(new Date(event.startTime), "PPP")}
                        </span>
                        <span className="flex items-center gap-1" data-testid={`text-past-event-time-${event.id}`}>
                          <Clock className="h-4 w-4" />
                          {format(new Date(event.startTime), "p")} - {format(new Date(event.endTime), "p")}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    {event.description && (
                      <CardContent>
                        <p className="text-muted-foreground" data-testid={`text-past-event-description-${event.id}`}>
                          {event.description}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                  <p className="text-lg font-medium" data-testid="text-no-past-events">
                    No past events
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
