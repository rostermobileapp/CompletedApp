import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, MapPin, Users, Check, X, Calendar, Crown, Trash2, Eye, DollarSign, UserPlus, Shield, Pencil, ChevronLeft, ChevronRight, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format, formatDistanceToNow, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Scrimmage, ScrimmageRequest, User, ScrimmageCoHost } from '@shared/schema';
import { usePermissions } from '@/context/SubscriptionContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import LocationLink from "@/components/LocationLink";

const DEFAULT_SCRIMMAGE_COLOR = '#3b82f6';

type ScrimmageWithCreatorAndCount = Scrimmage & {
  creator: User;
  requestCount: number;
  // All fields from Scrimmage are already included (color, costPerPlayer, skillLevel, parentScrimmageId, etc.)
};

type ScrimmageRequestWithPlayer = ScrimmageRequest & {
  player: User;
};

type ScrimmageCoHostWithUser = ScrimmageCoHost & {
  user: User;
};

function getScrimmageColor(scrimmage: ScrimmageWithCreatorAndCount): string {
  return scrimmage.color || DEFAULT_SCRIMMAGE_COLOR;
}

function parseScrimmageDate(dateTime: string | Date): Date {
  if (typeof dateTime === 'string') {
    return new Date(dateTime);
  }
  return dateTime;
}

export default function ScrimmageManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // View state
  const [mainTab, setMainTab] = useState<'calendar' | 'list'>('calendar');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // List / delete mode state
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Detail expansion state
  const [selectedScrimmage, setSelectedScrimmage] = useState<string | null>(null);
  const [viewRosterScrimmage, setViewRosterScrimmage] = useState<string | null>(null);
  const [coHostDialogOpen, setCoHostDialogOpen] = useState<string | null>(null);
  const [selectedCoHostUserId, setSelectedCoHostUserId] = useState<string>('');
  const [coHostPermissions, setCoHostPermissions] = useState({
    canApproveRequests: true,
    canSendReminders: true,
    canManagePayments: true,
  });
  const { canAccessPremiumFeatures } = usePermissions();

  const handleBack = () => {
    setPageTransitionDirection('down');
    navigate('/more');
  };

  const { data: scrimmages = [], isLoading, error: scrimmagesError } = useQuery({
    queryKey: ['/api/users', 'scrimmages'],
  }) as { data: ScrimmageWithCreatorAndCount[], isLoading: boolean, error: any };

  const { data: requests = [], isLoading: requestsLoading, error: requestsError } = useQuery({
    queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'],
    enabled: !!selectedScrimmage,
  }) as { data: ScrimmageRequestWithPlayer[], isLoading: boolean, error: any };

  const { data: rosterData, isLoading: rosterLoading, error: rosterError } = useQuery({
    queryKey: ['/api/scrimmages', viewRosterScrimmage, 'approved-players'],
    enabled: !!viewRosterScrimmage,
  }) as { data: { scrimmage: any; approvedPlayers: ScrimmageRequestWithPlayer[] } | undefined, isLoading: boolean, error: any };

  const { data: coHosts = [], isLoading: coHostsLoading } = useQuery({
    queryKey: ['/api/scrimmages', selectedScrimmage, 'co-hosts'],
    enabled: !!selectedScrimmage,
  }) as { data: ScrimmageCoHostWithUser[], isLoading: boolean };

  const selectedScrimmageData = scrimmages.find(s => s.id === coHostDialogOpen);
  const { data: leagueMembers = [] } = useQuery({
    queryKey: ['/api/leagues', selectedScrimmageData?.leagueId, 'members'],
    enabled: !!selectedScrimmageData?.leagueId,
  }) as { data: { user: User; status: string }[] };

  // --- Mutations ---
  const addCoHostMutation = useMutation({
    mutationFn: async ({ scrimmageId, coHostUserId, permissions }: {
      scrimmageId: string;
      coHostUserId: string;
      permissions: { canApproveRequests: boolean; canSendReminders: boolean; canManagePayments: boolean };
    }) => {
      const response = await apiRequest('POST', `/api/scrimmages/${scrimmageId}/co-hosts`, { coHostUserId, ...permissions });
      return response.json();
    },
    onSuccess: (_, { scrimmageId }) => {
      toast({ title: 'Co-Host Added', description: 'The co-host has been added and notified.' });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', scrimmageId, 'co-hosts'] });
      setCoHostDialogOpen(null);
      setSelectedCoHostUserId('');
      setCoHostPermissions({ canApproveRequests: true, canSendReminders: true, canManagePayments: true });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to add co-host', variant: 'destructive' });
    },
  });

  const removeCoHostMutation = useMutation({
    mutationFn: async ({ scrimmageId, coHostUserId }: { scrimmageId: string; coHostUserId: string }) => {
      const response = await apiRequest('DELETE', `/api/scrimmages/${scrimmageId}/co-hosts/${coHostUserId}`, {});
      return response.json();
    },
    onSuccess: (_, { scrimmageId }) => {
      toast({ title: 'Co-Host Removed', description: 'The co-host has been removed from the scrimmage.' });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', scrimmageId, 'co-hosts'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to remove co-host', variant: 'destructive' });
    },
  });

  const manageRequestMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'approved' | 'dismissed' }) => {
      const response = await apiRequest('PUT', `/api/scrimmage-requests/${requestId}/status`, { status });
      return response.json();
    },
    onSuccess: (_, { status }) => {
      toast({
        title: status === 'approved' ? 'Request Approved' : 'Request Declined',
        description: status === 'approved' ? 'Player has been added to the scrimmage' : 'Request has been declined',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to process request', variant: 'destructive' });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      const response = await apiRequest('PUT', `/api/scrimmages/${scrimmageId}/finalize`, {});
      return response.json();
    },
    onSuccess: (_, scrimmageId) => {
      const scrimmage = scrimmages.find(s => s.id === scrimmageId);
      toast({ title: 'Roster Finalized!', description: `Confirmation notifications have been sent for "${scrimmage?.title || 'the scrimmage'}".` });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to finalize scrimmage', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      const response = await apiRequest('DELETE', `/api/scrimmages/${scrimmageId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Scrimmage Cancelled', description: 'The scrimmage has been cancelled and players have been notified.' });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
      setSelectedScrimmage(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to cancel scrimmage', variant: 'destructive' });
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest('DELETE', '/api/scrimmages/batch', { ids });
      return response.json();
    },
    onSuccess: (result) => {
      toast({ title: 'Scrimmages Deleted', description: `${result.deleted} scrimmage(s) cancelled and players notified.` });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
      setSelectedForDeletion(new Set());
      setDeleteMode(false);
      setBatchDeleteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete scrimmages', variant: 'destructive' });
    },
  });

  // --- Helpers ---
  const formatDateTime = (dateTime: string | Date) => {
    const date = parseScrimmageDate(typeof dateTime === 'string' ? dateTime : dateTime.toISOString());
    return {
      date: format(date, 'MMM d, yyyy'),
      time: format(date, 'h:mm a'),
      relative: formatDistanceToNow(date, { addSuffix: true }),
    };
  };

  const getPendingRequests = (reqs: ScrimmageRequestWithPlayer[]) => reqs.filter(r => r.status === 'pending');
  const getApprovedRequests = (reqs: ScrimmageRequestWithPlayer[]) => reqs.filter(r => r.status === 'approved');

  // --- Calendar Logic ---
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarDate);
    const end = endOfMonth(calendarDate);
    const days = eachDayOfInterval({ start, end });
    const startDayOfWeek = getDay(start); // 0 = Sunday
    const paddingDays = Array(startDayOfWeek).fill(null);
    return { days, paddingDays };
  }, [calendarDate]);

  // Map scrimmages by YYYY-MM-DD key
  const scrimmagesByDay = useMemo(() => {
    const map = new Map<string, ScrimmageWithCreatorAndCount[]>();
    for (const s of scrimmages) {
      const d = parseScrimmageDate(s.dateTime);
      const key = format(d, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [scrimmages]);

  const selectedDayScrimmages = selectedDay ? (scrimmagesByDay.get(selectedDay) || []) : [];

  // --- Recurring series grouping for mass delete ---
  const recurringGroups = useMemo(() => {
    // Group recurring scrimmages by parentScrimmageId (or by their own id if they are the parent)
    const groups = new Map<string, { label: string; ids: string[]; color: string }>();
    const nonRecurring: ScrimmageWithCreatorAndCount[] = [];

    for (const s of scrimmages) {
      if (s.isRecurring) {
        const groupKey = s.parentScrimmageId || s.id;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, { label: s.title, ids: [], color: getScrimmageColor(s) });
        }
        groups.get(groupKey)!.ids.push(s.id);
      } else {
        nonRecurring.push(s);
      }
    }

    return { groups: Array.from(groups.entries()), nonRecurring };
  }, [scrimmages]);

  const toggleGroupSelection = (ids: string[]) => {
    const newSet = new Set(selectedForDeletion);
    const allSelected = ids.every(id => newSet.has(id));
    if (allSelected) {
      ids.forEach(id => newSet.delete(id));
    } else {
      ids.forEach(id => newSet.add(id));
    }
    setSelectedForDeletion(newSet);
  };

  const toggleSingleSelection = (id: string) => {
    const newSet = new Set(selectedForDeletion);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedForDeletion(newSet);
  };

  // --- Loading/Error states ---
  if (scrimmagesError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={handleBack} className="p-0 h-auto"><ArrowLeft className="w-6 h-6" /></Button>
              <h1 className="text-lg font-semibold">Scrimmage Management</h1>
              <div className="w-6" />
            </div>
          </div>
        </div>
        <div className="max-w-md mx-auto p-4">
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <h3 className="text-lg font-semibold mb-2 text-destructive">Error Loading Scrimmages</h3>
            <p className="text-muted-foreground mb-4">{scrimmagesError?.message || 'Failed to load your scrimmages. Please try again.'}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={handleBack} className="p-0 h-auto"><ArrowLeft className="w-6 h-6" /></Button>
              <h1 className="text-lg font-semibold">Scrimmage Management</h1>
              <div className="w-6" />
            </div>
          </div>
        </div>
        <div className="max-w-md mx-auto p-4">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-6 animate-pulse">
                <div className="h-6 bg-muted rounded w-3/4 mb-4"></div>
                <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-muted rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Scrimmage detail card (shared between calendar and list views) ---
  const renderScrimmageCard = (scrimmage: ScrimmageWithCreatorAndCount) => {
    const dateTime = formatDateTime(scrimmage.dateTime);
    const pendingCount = scrimmage.requestCount;
    const isSelected = selectedScrimmage === scrimmage.id;
    const color = getScrimmageColor(scrimmage);

    return (
      <Card key={scrimmage.id} className="bg-card border border-border overflow-hidden">
        {/* Color accent bar */}
        <div className="h-1 w-full" style={{ backgroundColor: color }} />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 flex items-start gap-2">
              <div className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
              <div>
                <CardTitle className="text-lg">{scrimmage.title}</CardTitle>
                <CardDescription className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4" />
                    <span>{dateTime.date} at {dateTime.time}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4" />
                    <LocationLink location={scrimmage.location} />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4" />
                    <span>Max {scrimmage.maxPlayers} players</span>
                  </div>
                  {scrimmage.costPerPlayer && (
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4" />
                      <span>${scrimmage.costPerPlayer}/player</span>
                    </div>
                  )}
                  {scrimmage.skillLevel && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Skill: {scrimmage.skillLevel}</span>
                    </div>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={scrimmage.status === 'open' ? 'default' : 'secondary'}>{scrimmage.status}</Badge>
              {scrimmage.isRecurring && <Badge variant="outline" className="text-xs">Recurring</Badge>}
              {pendingCount > 0 && <Badge variant="destructive">{pendingCount} pending</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedScrimmage(isSelected ? null : scrimmage.id)}
              >
                {isSelected ? 'Hide Details' : 'Manage Requests'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (viewRosterScrimmage === scrimmage.id) {
                    setViewRosterScrimmage(null);
                  } else {
                    setSelectedScrimmage(null);
                    setViewRosterScrimmage(scrimmage.id);
                  }
                }}
              >
                <Eye className="w-4 h-4 mr-1" />
                {viewRosterScrimmage === scrimmage.id ? 'Hide Roster' : 'Roster'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPageTransitionDirection('up');
                  navigate(`/edit-scrimmage/${scrimmage.id}`);
                }}
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to cancel this scrimmage? All confirmed players will be notified.')) {
                    deleteMutation.mutate(scrimmage.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                className="text-destructive hover:text-destructive border-destructive/20 hover:border-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Finalize Button */}
            <div className="border-t border-border pt-3">
              <Button
                onClick={() => finalizeMutation.mutate(scrimmage.id)}
                disabled={(finalizeMutation.isPending && finalizeMutation.variables === scrimmage.id) || scrimmage.status === 'roster_confirmed'}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                {(finalizeMutation.isPending && finalizeMutation.variables === scrimmage.id) ? (
                  <><div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />Finalizing...</>
                ) : scrimmage.status === 'roster_confirmed' ? (
                  <><Check className="w-4 h-4 mr-2" />Roster Finalized</>
                ) : (
                  <><Check className="w-4 h-4 mr-2" />Finalize & Invoice</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                {scrimmage.costPerPlayer
                  ? 'Confirm roster, send notifications & create payment requests'
                  : 'Confirm roster and send notifications to approved players'}
              </p>
            </div>
          </div>

          {/* Roster View */}
          {viewRosterScrimmage === scrimmage.id && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Confirmed Players</h3>
              </div>
              {rosterLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                </div>
              ) : rosterError ? (
                <div className="text-center py-4 text-destructive">
                  <p className="text-sm mb-2">Error loading roster</p>
                  <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', viewRosterScrimmage, 'approved-players'] })}>Retry</Button>
                </div>
              ) : !rosterData?.approvedPlayers || rosterData.approvedPlayers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No players confirmed yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rosterData.approvedPlayers.map((request) => (
                    <div key={request.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#212121] border border-gray-700">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={request.player.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs">{request.player.firstName?.[0]}{request.player.lastName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-white text-[16px]">{request.player.firstName} {request.player.lastName}</p>
                      </div>
                      <Badge className="bg-green-600 text-white text-xs hover:bg-green-600">✓ Confirmed</Badge>
                    </div>
                  ))}
                  <div className="mt-4 pt-4 border-t border-gray-600 text-center">
                    <p className="text-sm text-white">{rosterData.approvedPlayers.length} of {scrimmage.maxPlayers} players confirmed</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Management / Requests View */}
          {isSelected && (
            <div className="mt-4 border-t border-border pt-4">
              {requestsLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                </div>
              ) : requestsError ? (
                <div className="text-center py-8 text-destructive">
                  <p className="font-medium mb-2">Error Loading Requests</p>
                  <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'] })}>Retry</Button>
                </div>
              ) : (
                <Tabs defaultValue="pending" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pending">Pending ({getPendingRequests(requests).length})</TabsTrigger>
                    <TabsTrigger value="approved">Approved ({getApprovedRequests(requests).length})</TabsTrigger>
                    <TabsTrigger value="cohosts"><Shield className="w-3 h-3 mr-1" />Co-Hosts ({coHosts.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="pending" className="mt-4">
                    <ScrollArea className="h-64">
                      {getPendingRequests(requests).length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No pending requests</div>
                      ) : (
                        <div className="space-y-3">
                          {getPendingRequests(requests).map((request) => (
                            <div key={request.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={request.player.profileImageUrl || undefined} />
                                <AvatarFallback>{request.player.firstName?.[0]}{request.player.lastName?.[0]}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="font-medium">{request.player.firstName} {request.player.lastName}</p>
                                <p className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}</p>
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="default" onClick={() => manageRequestMutation.mutate({ requestId: request.id, status: 'approved' })} disabled={manageRequestMutation.isPending}>
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => manageRequestMutation.mutate({ requestId: request.id, status: 'dismissed' })} disabled={manageRequestMutation.isPending}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="approved" className="mt-4">
                    <ScrollArea className="h-64">
                      {getApprovedRequests(requests).length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No approved players yet</div>
                      ) : (
                        <div className="space-y-3">
                          {getApprovedRequests(requests).map((request) => (
                            <div key={request.id} className="flex items-center gap-3 p-3 rounded-lg border bg-[#e2e2e2] dark:bg-[#212121]">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={request.player.profileImageUrl || undefined} />
                                <AvatarFallback>{request.player.firstName?.[0]}{request.player.lastName?.[0]}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="font-medium">{request.player.firstName} {request.player.lastName}</p>
                                <p className="text-sm text-muted-foreground">Approved {formatDistanceToNow(new Date(request.approvedAt!), { addSuffix: true })}</p>
                              </div>
                              <Badge variant="default" className="bg-green-600">Approved</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="cohosts" className="mt-4">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">Co-hosts can help manage this scrimmage</p>
                        <Dialog open={coHostDialogOpen === scrimmage.id} onOpenChange={(open) => {
                          if (open) setCoHostDialogOpen(scrimmage.id);
                          else {
                            setCoHostDialogOpen(null);
                            setSelectedCoHostUserId('');
                            setCoHostPermissions({ canApproveRequests: true, canSendReminders: true, canManagePayments: true });
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline"><UserPlus className="w-4 h-4 mr-1" />Add Co-Host</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Co-Host</DialogTitle>
                              <DialogDescription>Select a league member to add as a co-host with specific permissions.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="cohost-select">Select Member</Label>
                                <Select value={selectedCoHostUserId} onValueChange={setSelectedCoHostUserId}>
                                  <SelectTrigger id="cohost-select">
                                    <SelectValue placeholder="Select a member..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {leagueMembers
                                      .filter(m => m.user.id !== scrimmage.creatorId && !coHosts.some(c => c.userId === m.user.id))
                                      .map((member) => (
                                        <SelectItem key={member.user.id} value={member.user.id}>
                                          {member.user.firstName} {member.user.lastName}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-3">
                                <Label>Permissions</Label>
                                <div className="flex items-center space-x-2">
                                  <Checkbox id="perm-approve" checked={coHostPermissions.canApproveRequests} onCheckedChange={(checked) => setCoHostPermissions(p => ({ ...p, canApproveRequests: !!checked }))} />
                                  <label htmlFor="perm-approve" className="text-sm">Can approve/decline player requests</label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox id="perm-reminders" checked={coHostPermissions.canSendReminders} onCheckedChange={(checked) => setCoHostPermissions(p => ({ ...p, canSendReminders: !!checked }))} />
                                  <label htmlFor="perm-reminders" className="text-sm">Can send reminders to players</label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox id="perm-payments" checked={coHostPermissions.canManagePayments} onCheckedChange={(checked) => setCoHostPermissions(p => ({ ...p, canManagePayments: !!checked }))} />
                                  <label htmlFor="perm-payments" className="text-sm">Can collect and mark payments</label>
                                </div>
                              </div>
                              <Button className="w-full" disabled={!selectedCoHostUserId || addCoHostMutation.isPending}
                                onClick={() => addCoHostMutation.mutate({ scrimmageId: scrimmage.id, coHostUserId: selectedCoHostUserId, permissions: coHostPermissions })}>
                                {addCoHostMutation.isPending ? 'Adding...' : 'Add Co-Host'}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <ScrollArea className="h-48">
                        {coHostsLoading ? (
                          <div className="text-center py-4"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div></div>
                        ) : coHosts.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Shield className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No co-hosts assigned</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {coHosts.map((coHost) => (
                              <div key={coHost.userId} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={coHost.user?.profileImageUrl || undefined} />
                                  <AvatarFallback>{coHost.user?.firstName?.[0]}{coHost.user?.lastName?.[0]}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="font-medium">{coHost.user?.firstName} {coHost.user?.lastName}</p>
                                  <div className="flex gap-1 flex-wrap mt-1">
                                    {coHost.canApproveRequests && <Badge variant="outline" className="text-xs">Approve</Badge>}
                                    {coHost.canSendReminders && <Badge variant="outline" className="text-xs">Reminders</Badge>}
                                    {coHost.canManagePayments && <Badge variant="outline" className="text-xs">Payments</Badge>}
                                  </div>
                                </div>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => { if (confirm('Remove this co-host?')) removeCoHostMutation.mutate({ scrimmageId: scrimmage.id, coHostUserId: coHost.userId }); }}
                                  disabled={removeCoHostMutation.isPending}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // --- Calendar View ---
  const renderCalendarView = () => {
    const { days, paddingDays } = calendarDays;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();

    return (
      <div className="space-y-4">
        {/* Month navigator */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => { setCalendarDate(d => subMonths(d, 1)); setSelectedDay(null); }}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-semibold">{format(calendarDate, 'MMMM yyyy')}</h2>
          <Button variant="ghost" size="sm" onClick={() => { setCalendarDate(d => addMonths(d, 1)); setSelectedDay(null); }}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 text-center">
          {dayNames.map(d => (
            <div key={d} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {paddingDays.map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayScrimmages = scrimmagesByDay.get(key) || [];
            const isSelected = selectedDay === key;
            const isToday = isSameDay(day, today);

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                className={`
                  aspect-square flex flex-col items-center justify-start pt-1 rounded-lg text-sm transition-all relative
                  ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
                  ${isToday ? 'font-bold' : ''}
                  ${dayScrimmages.length > 0 ? 'hover:bg-muted/70 cursor-pointer' : 'cursor-default'}
                `}
              >
                <span className={`text-xs leading-none ${isToday ? 'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center' : ''}`}>
                  {format(day, 'd')}
                </span>
                {/* Color dots for scrimmages */}
                {dayScrimmages.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap justify-center mt-0.5 px-0.5">
                    {dayScrimmages.slice(0, 3).map((s) => (
                      <div
                        key={s.id}
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getScrimmageColor(s) }}
                      />
                    ))}
                    {dayScrimmages.length > 3 && (
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day detail */}
        {selectedDay && (
          <div className="mt-2 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-base">
                {format(new Date(selectedDay + 'T12:00:00'), 'EEEE, MMMM d')}
              </h3>
              <Badge variant="outline" className="ml-auto">{selectedDayScrimmages.length} scrimmage{selectedDayScrimmages.length !== 1 ? 's' : ''}</Badge>
            </div>
            {selectedDayScrimmages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No scrimmages on this day</p>
            ) : (
              <div className="space-y-3">
                {selectedDayScrimmages.map(s => renderScrimmageCard(s))}
              </div>
            )}
          </div>
        )}

        {scrimmages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No scrimmages scheduled</p>
          </div>
        )}
      </div>
    );
  };

  // --- List View with mass delete ---
  const renderListView = () => {
    if (scrimmages.length === 0) {
      return (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <Crown className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Scrimmages Created</h3>
          <p className="text-muted-foreground mb-4">
            {canAccessPremiumFeatures()
              ? "You haven't created any scrimmages yet."
              : "Creating scrimmages requires Player Pro subscription or higher."}
          </p>
          {canAccessPremiumFeatures() && (
            <Button onClick={() => navigate('/create-scrimmage')}>Create Scrimmage</Button>
          )}
        </div>
      );
    }

    if (!deleteMode) {
      return (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:border-destructive"
              onClick={() => { setDeleteMode(true); setSelectedForDeletion(new Set()); }}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Select to Delete
            </Button>
          </div>
          {scrimmages.map(s => renderScrimmageCard(s))}
        </div>
      );
    }

    // Delete mode: group recurring series
    const { groups, nonRecurring } = recurringGroups;

    return (
      <div className="space-y-4 pb-24">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Select recurring series or individual scrimmages to delete</p>
          <Button variant="ghost" size="sm" onClick={() => { setDeleteMode(false); setSelectedForDeletion(new Set()); }}>
            Cancel
          </Button>
        </div>

        {/* Recurring groups */}
        {groups.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recurring Series</h3>
            {groups.map(([groupKey, group]) => {
              const allSelected = group.ids.every(id => selectedForDeletion.has(id));
              const someSelected = group.ids.some(id => selectedForDeletion.has(id));
              return (
                <div
                  key={groupKey}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${someSelected ? 'border-destructive/60 bg-destructive/5' : 'border-border bg-card'}`}
                  onClick={() => toggleGroupSelection(group.ids)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                    <div className="flex-1">
                      <p className="font-medium">{group.label}</p>
                      <p className="text-sm text-muted-foreground">{group.ids.length} occurrence{group.ids.length !== 1 ? 's' : ''}</p>
                    </div>
                    {allSelected ? (
                      <CheckSquare className="w-5 h-5 text-destructive" />
                    ) : someSelected ? (
                      <div className="w-5 h-5 border-2 border-destructive rounded bg-destructive/20" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Individual non-recurring */}
        {nonRecurring.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Individual Scrimmages</h3>
            {nonRecurring.map((s) => {
              const isChecked = selectedForDeletion.has(s.id);
              const dt = formatDateTime(s.dateTime);
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${isChecked ? 'border-destructive/60 bg-destructive/5' : 'border-border bg-card'}`}
                  onClick={() => toggleSingleSelection(s.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getScrimmageColor(s) }} />
                    <div className="flex-1">
                      <p className="font-medium">{s.title}</p>
                      <p className="text-sm text-muted-foreground">{dt.date} at {dt.time}</p>
                    </div>
                    {isChecked ? (
                      <CheckSquare className="w-5 h-5 text-destructive" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sticky delete bar */}
        {selectedForDeletion.size > 0 && (
          <div className="fixed bottom-20 left-0 right-0 z-50 px-4">
            <div className="max-w-md mx-auto">
              <div className="bg-destructive text-destructive-foreground rounded-xl p-4 flex items-center justify-between shadow-lg">
                <div>
                  <p className="font-semibold">{selectedForDeletion.size} scrimmage{selectedForDeletion.size !== 1 ? 's' : ''} selected</p>
                  <p className="text-sm opacity-80">This will cancel them and notify all players</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBatchDeleteDialogOpen(true)}
                  className="bg-white text-destructive hover:bg-white/90 font-semibold"
                >
                  Delete Selected
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Batch delete confirmation dialog */}
        <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Confirm Mass Delete
              </DialogTitle>
              <DialogDescription>
                You are about to permanently cancel {selectedForDeletion.size} scrimmage{selectedForDeletion.size !== 1 ? 's' : ''}. All approved players will be notified of the cancellation. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setBatchDeleteDialogOpen(false)}>
                Keep Them
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={batchDeleteMutation.isPending}
                onClick={() => batchDeleteMutation.mutate(Array.from(selectedForDeletion))}
              >
                {batchDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedForDeletion.size}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleBack} className="p-0 h-auto" data-testid="button-back">
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <h1 className="text-lg font-semibold">Scrimmage Management</h1>
            <Button size="sm" onClick={() => navigate('/create-scrimmage')} className="text-xs h-8 px-3">
              + New
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {/* Main tab switcher */}
        <div className="flex rounded-xl bg-muted p-1 mb-4">
          <button
            onClick={() => { setMainTab('calendar'); setDeleteMode(false); setSelectedForDeletion(new Set()); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${mainTab === 'calendar' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </button>
          <button
            onClick={() => { setMainTab('list'); setSelectedDay(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${mainTab === 'list' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Users className="w-4 h-4" />
            List
          </button>
        </div>

        {mainTab === 'calendar' ? renderCalendarView() : renderListView()}
      </div>
    </div>
  );
}
