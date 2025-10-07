import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MapPin, Calendar, LogOut, Home, UserCircle } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type FacilityMembershipWithDetails = {
  id: string;
  userId: string;
  facilityId: string;
  startDate: string;
  endDate: string | null;
  membershipType: string;
  facility: {
    id: string;
    name: string;
    description: string | null;
    address: string | null;
    city: string;
    state: string;
    sports: string[] | null;
  };
};

export default function FacilityMemberships() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: memberships, isLoading, isError, error, refetch } = useQuery<FacilityMembershipWithDetails[]>({
    queryKey: ['/api/users/me/facility-memberships'],
    queryFn: async () => {
      const response = await fetch('/api/users/me/facility-memberships');
      if (!response.ok) throw new Error('Failed to fetch memberships');
      return response.json();
    },
  });

  const leaveFacilityMutation = useMutation({
    mutationFn: (membershipId: string) => apiRequest('DELETE', `/api/facility-memberships/${membershipId}`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "You've left the facility",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/me/facility-memberships'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to leave facility",
        variant: "destructive",
      });
    },
  });

  const activeMemberships = memberships?.filter(m => !m.endDate || new Date(m.endDate) > new Date()) || [];
  const inactiveMemberships = memberships?.filter(m => m.endDate && new Date(m.endDate) <= new Date()) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2" data-testid="heading-my-memberships">
              My Facility Memberships
            </h1>
            <p className="text-muted-foreground" data-testid="text-subtitle">
              Manage your facility memberships and access
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild data-testid="button-dashboard">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </Link>
            </Button>
            <Button asChild data-testid="button-browse-facilities">
              <Link href="/facilities">
                <MapPin className="h-4 w-4 mr-2" />
                Browse Facilities
              </Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-destructive mb-4">
                <UserCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2" data-testid="text-error-title">
                  Failed to load memberships
                </p>
                <p className="text-sm text-muted-foreground mb-6" data-testid="text-error-message">
                  {error?.message || "There was an error loading your memberships. Please try again."}
                </p>
              </div>
              <Button onClick={() => refetch()} data-testid="button-retry">
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : activeMemberships.length > 0 || inactiveMemberships.length > 0 ? (
          <div className="space-y-8">
            {activeMemberships.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold mb-4" data-testid="heading-active-memberships">
                  Active Memberships ({activeMemberships.length})
                </h2>
                <div className="grid gap-4">
                  {activeMemberships.map((membership) => (
                    <Card key={membership.id} data-testid={`card-membership-${membership.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-2xl mb-2" data-testid={`text-facility-name-${membership.id}`}>
                              <Link href={`/facilities/${membership.facilityId}`} className="hover:underline">
                                {membership.facility.name}
                              </Link>
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2" data-testid={`text-facility-location-${membership.id}`}>
                              <MapPin className="h-4 w-4" />
                              {membership.facility.city}, {membership.facility.state}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="default" data-testid={`badge-active-${membership.id}`}>
                              Active
                            </Badge>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  data-testid={`button-leave-${membership.id}`}
                                >
                                  <LogOut className="h-4 w-4 mr-2" />
                                  Leave
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Leave Facility?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to leave {membership.facility.name}? You'll lose access to all events and activities at this facility.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel data-testid={`button-cancel-leave-${membership.id}`}>
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => leaveFacilityMutation.mutate(membership.id)}
                                    data-testid={`button-confirm-leave-${membership.id}`}
                                  >
                                    Leave Facility
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {membership.facility.description && (
                            <p className="text-muted-foreground" data-testid={`text-facility-description-${membership.id}`}>
                              {membership.facility.description}
                            </p>
                          )}
                          <Separator />
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Member Since</p>
                              <p className="font-semibold" data-testid={`text-member-since-${membership.id}`}>
                                {format(new Date(membership.startDate), "PPP")}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Membership Type</p>
                              <p className="font-semibold capitalize" data-testid={`text-membership-type-${membership.id}`}>
                                {membership.membershipType}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Sports Available</p>
                              <div className="flex flex-wrap gap-1">
                                {(membership.facility.sports || []).map((sport) => (
                                  <Badge key={sport} variant="secondary" className="text-xs" data-testid={`badge-sport-${sport}`}>
                                    {sport}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Button asChild variant="outline" className="w-full" data-testid={`button-view-calendar-${membership.id}`}>
                            <Link href={`/facilities/${membership.facilityId}`}>
                              <Calendar className="h-4 w-4 mr-2" />
                              View Facility Calendar
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {inactiveMemberships.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-muted-foreground" data-testid="heading-past-memberships">
                  Past Memberships ({inactiveMemberships.length})
                </h2>
                <div className="grid gap-4">
                  {inactiveMemberships.map((membership) => (
                    <Card key={membership.id} className="opacity-60" data-testid={`card-past-membership-${membership.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-xl" data-testid={`text-past-facility-name-${membership.id}`}>
                              <Link href={`/facilities/${membership.facilityId}`} className="hover:underline">
                                {membership.facility.name}
                              </Link>
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2" data-testid={`text-past-facility-location-${membership.id}`}>
                              <MapPin className="h-4 w-4" />
                              {membership.facility.city}, {membership.facility.state}
                            </CardDescription>
                          </div>
                          <Badge variant="outline" data-testid={`badge-inactive-${membership.id}`}>
                            Inactive
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-1">Member Since</p>
                            <p className="font-semibold" data-testid={`text-past-member-since-${membership.id}`}>
                              {format(new Date(membership.startDate), "PPP")}
                            </p>
                          </div>
                          {membership.endDate && (
                            <div>
                              <p className="text-muted-foreground mb-1">Ended On</p>
                              <p className="font-semibold" data-testid={`text-ended-on-${membership.id}`}>
                                {format(new Date(membership.endDate), "PPP")}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <UserCircle className="h-16 w-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
              <p className="text-lg font-medium mb-2" data-testid="text-no-memberships">
                No facility memberships yet
              </p>
              <p className="text-sm text-muted-foreground mb-6" data-testid="text-no-memberships-description">
                Join a facility to access events and activities
              </p>
              <Button asChild data-testid="button-browse-facilities-empty">
                <Link href="/facilities">
                  <MapPin className="h-4 w-4 mr-2" />
                  Browse Facilities
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
