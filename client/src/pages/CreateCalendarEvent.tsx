import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar, ArrowLeft, Plus, Search, MapPin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { createCalendarEventRequestSchema } from "@shared/schema";
import { z } from "zod";
import type { Facility } from "@shared/schema";

const formSchema = z.object({
  facilityId: z.string().min(1, "Facility is required"),
  sportId: z.enum(["basketball", "soccer", "baseball", "softball", "football", "volleyball", "tennis", "hockey", "other"]),
  eventType: z.enum(["league_game", "scrimmage", "tournament", "open_play"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endDate: z.string().min(1, "End date is required"),
  endTime: z.string().min(1, "End time is required"),
  maxParticipants: z.preprocess(
    (val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      return Number(val);
    },
    z.number().int().positive().optional()
  ),
  requiresMembership: z.boolean(),
  requiresTeamRoster: z.boolean().optional(),
  visibility: z.enum(["public", "private", "member_only"]).optional(),
  locationDetail: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateCalendarEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

  const { data: facilities, isLoading: facilitiesLoading } = useQuery<Facility[]>({
    queryKey: ['/api/facilities', { search: committedSearch }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (committedSearch) params.append('search', committedSearch);
      
      const response = await fetch(`/api/facilities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch facilities');
      return response.json();
    },
    enabled: committedSearch.trim().length > 0,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      facilityId: "",
      sportId: "basketball",
      eventType: "open_play",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      maxParticipants: undefined,
      requiresMembership: true,
      requiresTeamRoster: false,
      visibility: "public",
      locationDetail: "",
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      // Send datetime strings directly without timezone conversion
      const payload = {
        title: data.title,
        description: data.description || undefined,
        facilityId: data.facilityId,
        sportId: data.sportId,
        eventType: data.eventType,
        startTime: `${data.startDate}T${data.startTime}`,
        endTime: `${data.endDate}T${data.endTime}`,
        maxParticipants: data.maxParticipants || undefined,
        requiresMembership: data.requiresMembership,
        requiresTeamRoster: data.requiresTeamRoster || false,
        visibility: data.visibility || "public",
        locationDetail: data.locationDetail || undefined,
      };

      const response = await apiRequest('POST', '/api/calendar-events', payload);
      return response.json();
    },
    onSuccess: (event) => {
      toast({
        title: "Success",
        description: "Calendar event created successfully!",
      });
      navigate(`/facilities/${event.facilityId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create event",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    createEventMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/facilities')} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Facilities
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl" data-testid="heading-create-event">
                  Create Calendar Event
                </CardTitle>
                <CardDescription>
                  Schedule a new event at a facility
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="facilityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Facility *</FormLabel>
                      {selectedFacility ? (
                        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted" data-testid="selected-facility">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" data-testid="text-facility-name">
                              {selectedFacility.name}
                            </p>
                            <p className="text-sm text-muted-foreground truncate" data-testid="text-facility-location">
                              {selectedFacility.city}, {selectedFacility.state}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedFacility(null);
                              field.onChange('');
                              setSearch('');
                            }}
                            data-testid="button-clear-facility"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Search facilities by name or location..."
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setCommittedSearch(search.trim()); } }}
                              data-testid="input-facility-search"
                              className="flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => setCommittedSearch(search.trim())}
                              disabled={!search.trim()}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                              data-testid="button-find-facility"
                            >
                              FIND
                            </button>
                          </div>
                          {committedSearch.trim().length > 0 && (
                            <div className="mt-2 border rounded-lg max-h-64 overflow-y-auto" data-testid="facility-search-results">
                              {facilitiesLoading ? (
                                <div className="p-4 text-center text-muted-foreground" data-testid="loading-facilities">
                                  <Search className="w-6 h-6 mx-auto mb-2 animate-pulse" />
                                  <p>Searching facilities...</p>
                                </div>
                              ) : facilities && facilities.length > 0 ? (
                                <div className="divide-y">
                                  {facilities.map((facility) => (
                                    <button
                                      key={facility.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedFacility(facility);
                                        field.onChange(facility.id);
                                        setSearch('');
                                      }}
                                      className="w-full p-3 text-left hover:bg-muted transition-colors flex items-center gap-3"
                                      data-testid={`button-facility-${facility.id}`}
                                    >
                                      <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{facility.name}</p>
                                        <p className="text-sm text-muted-foreground truncate">
                                          {facility.city}, {facility.state}
                                        </p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-4 text-center text-muted-foreground" data-testid="no-facilities">
                                  <Search className="w-6 h-6 mx-auto mb-2" />
                                  <p>No facilities found</p>
                                  <p className="text-sm mt-1">Try a different search term</p>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Title *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g., Sunday Basketball Pickup"
                          data-testid="input-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Event details, requirements, etc."
                          className="min-h-[100px]"
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormDescription>
                        Provide details about the event
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="locationDetail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Detail</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          placeholder="e.g., Court 1, Field 2"
                          data-testid="input-location-detail"
                        />
                      </FormControl>
                      <FormDescription>
                        Specific location within the facility
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sportId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sport *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sport">
                              <SelectValue placeholder="Select a sport" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="basketball" data-testid="option-basketball">Basketball</SelectItem>
                            <SelectItem value="soccer" data-testid="option-soccer">Soccer</SelectItem>
                            <SelectItem value="volleyball" data-testid="option-volleyball">Volleyball</SelectItem>
                            <SelectItem value="tennis" data-testid="option-tennis">Tennis</SelectItem>
                            <SelectItem value="hockey" data-testid="option-hockey">Hockey</SelectItem>
                            <SelectItem value="baseball" data-testid="option-baseball">Baseball</SelectItem>
                            <SelectItem value="softball" data-testid="option-softball">Softball</SelectItem>
                            <SelectItem value="football" data-testid="option-football">Football</SelectItem>
                            <SelectItem value="other" data-testid="option-other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="eventType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-event-type">
                              <SelectValue placeholder="Select event type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="league_game" data-testid="option-league-game">League Game</SelectItem>
                            <SelectItem value="scrimmage" data-testid="option-scrimmage">Scrimmage</SelectItem>
                            <SelectItem value="tournament" data-testid="option-tournament">Tournament</SelectItem>
                            <SelectItem value="open_play" data-testid="option-open-play">Open Play</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="date"
                            data-testid="input-start-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="time"
                            data-testid="input-start-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="date"
                            data-testid="input-end-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="time"
                            data-testid="input-end-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="maxParticipants"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Participants</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          placeholder="Leave empty for unlimited"
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          value={field.value || ""}
                          data-testid="input-max-participants"
                        />
                      </FormControl>
                      <FormDescription>
                        Optional limit on number of participants
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requiresMembership"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Require Facility Membership
                        </FormLabel>
                        <FormDescription>
                          Only facility members can join this event
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-requires-membership"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/facilities')}
                    className="flex-1"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createEventMutation.isPending}
                    className="flex-1"
                    data-testid="button-create"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {createEventMutation.isPending ? "Creating..." : "Create Event"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
