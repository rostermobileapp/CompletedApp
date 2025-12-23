import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, MapPin, Users, Check, X, Calendar, Crown, Trash2, Eye, DollarSign, UserPlus, Shield, Pencil } from 'lucide-react';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { format, formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Scrimmage, ScrimmageRequest, User, ScrimmageCoHost } from '@shared/schema';
import { usePermissions } from '@/context/SubscriptionContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

// Extended types with relationships for UI
type ScrimmageWithCreatorAndCount = Scrimmage & {
  creator: User;
  requestCount: number;
};

type ScrimmageRequestWithPlayer = ScrimmageRequest & {
  player: User;
};

type ScrimmageCoHostWithUser = ScrimmageCoHost & {
  user: User;
};

export default function ScrimmageManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  // Fetch user's created scrimmages with hierarchical cache keys
  const { data: scrimmages = [], isLoading, error: scrimmagesError } = useQuery({
    queryKey: ['/api/users', 'scrimmages'],
  }) as { data: ScrimmageWithCreatorAndCount[], isLoading: boolean, error: any };

  // Fetch requests for selected scrimmage with hierarchical cache keys
  const { data: requests = [], isLoading: requestsLoading, error: requestsError } = useQuery({
    queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'],
    enabled: !!selectedScrimmage,
  }) as { data: ScrimmageRequestWithPlayer[], isLoading: boolean, error: any };

  // Fetch approved players for roster view
  const { data: rosterData, isLoading: rosterLoading, error: rosterError } = useQuery({
    queryKey: ['/api/scrimmages', viewRosterScrimmage, 'approved-players'],
    enabled: !!viewRosterScrimmage,
  }) as { data: { scrimmage: any; approvedPlayers: ScrimmageRequestWithPlayer[] } | undefined, isLoading: boolean, error: any };

  // Fetch co-hosts for selected scrimmage
  const { data: coHosts = [], isLoading: coHostsLoading } = useQuery({
    queryKey: ['/api/scrimmages', selectedScrimmage, 'co-hosts'],
    enabled: !!selectedScrimmage,
  }) as { data: ScrimmageCoHostWithUser[], isLoading: boolean };

  // Fetch league members to add as co-hosts (using the scrimmage's league)
  const selectedScrimmageData = scrimmages.find(s => s.id === coHostDialogOpen);
  const { data: leagueMembers = [] } = useQuery({
    queryKey: ['/api/leagues', selectedScrimmageData?.leagueId, 'members'],
    enabled: !!selectedScrimmageData?.leagueId,
  }) as { data: { user: User; status: string }[] };

  // Mutation to add co-host
  const addCoHostMutation = useMutation({
    mutationFn: async ({ scrimmageId, coHostUserId, permissions }: { 
      scrimmageId: string; 
      coHostUserId: string;
      permissions: { canApproveRequests: boolean; canSendReminders: boolean; canManagePayments: boolean };
    }) => {
      const response = await apiRequest('POST', `/api/scrimmages/${scrimmageId}/co-hosts`, {
        coHostUserId,
        ...permissions,
      });
      return response.json();
    },
    onSuccess: (_, { scrimmageId }) => {
      toast({
        title: 'Co-Host Added',
        description: 'The co-host has been added and notified.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', scrimmageId, 'co-hosts'] });
      setCoHostDialogOpen(null);
      setSelectedCoHostUserId('');
      setCoHostPermissions({ canApproveRequests: true, canSendReminders: true, canManagePayments: true });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add co-host',
        variant: 'destructive',
      });
    },
  });

  // Mutation to remove co-host
  const removeCoHostMutation = useMutation({
    mutationFn: async ({ scrimmageId, coHostUserId }: { scrimmageId: string; coHostUserId: string }) => {
      const response = await apiRequest('DELETE', `/api/scrimmages/${scrimmageId}/co-hosts/${coHostUserId}`, {});
      return response.json();
    },
    onSuccess: (_, { scrimmageId }) => {
      toast({
        title: 'Co-Host Removed',
        description: 'The co-host has been removed from the scrimmage.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', scrimmageId, 'co-hosts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove co-host',
        variant: 'destructive',
      });
    },
  });

  // Mutation to approve/dismiss requests
  const manageRequestMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'approved' | 'dismissed' }) => {
      const response = await apiRequest('PUT', `/api/scrimmage-requests/${requestId}/status`, { status });
      return response.json();
    },
    onSuccess: (_, { status }) => {
      toast({
        title: status === 'approved' ? 'Request Approved' : 'Request Declined',
        description: status === 'approved' 
          ? 'Player has been added to the scrimmage'
          : 'Request has been declined',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process request',
        variant: 'destructive',
      });
    },
  });

  // Mutation to finalize scrimmage roster
  const finalizeMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      const response = await apiRequest('PUT', `/api/scrimmages/${scrimmageId}/finalize`, {});
      return response.json();
    },
    onSuccess: (_, scrimmageId) => {
      const scrimmage = scrimmages.find(s => s.id === scrimmageId);
      toast({
        title: 'Roster Finalized!',
        description: `Confirmation notifications have been sent for "${scrimmage?.title || 'the scrimmage'}".`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to finalize scrimmage',
        variant: 'destructive',
      });
    },
  });

  // Mutation to delete scrimmage
  const deleteMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      const response = await apiRequest('DELETE', `/api/scrimmages/${scrimmageId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Scrimmage Cancelled',
        description: 'The scrimmage has been cancelled and players have been notified.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
      setSelectedScrimmage(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel scrimmage',
        variant: 'destructive',
      });
    },
  });

  const formatDateTime = (dateTime: string | Date) => {
    const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
    return {
      date: format(date, 'MMM d, yyyy'),
      time: format(date, 'h:mm a'),
      relative: formatDistanceToNow(date, { addSuffix: true }),
    };
  };

  const getPendingRequests = (requests: ScrimmageRequestWithPlayer[]) => 
    requests.filter(r => r.status === 'pending');

  const getApprovedRequests = (requests: ScrimmageRequestWithPlayer[]) => 
    requests.filter(r => r.status === 'approved');

  // Show error states
  if (scrimmagesError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="p-0 h-auto"
                data-testid="button-back"
              >
                <ArrowLeft className="w-6 h-6" />
              </Button>
              <h1 className="text-lg font-semibold">Scrimmage Management</h1>
              <div className="w-6" />
            </div>
          </div>
        </div>
        
        <div className="max-w-md mx-auto p-4">
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <h3 className="text-lg font-semibold mb-2 text-destructive">Error Loading Scrimmages</h3>
            <p className="text-muted-foreground mb-4">
              {scrimmagesError?.message || 'Failed to load your scrimmages. Please try again.'}
            </p>
            <Button onClick={() => window.location.reload()} data-testid="button-retry">
              Try Again
            </Button>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="p-0 h-auto"
                data-testid="button-back"
              >
                <ArrowLeft className="w-6 h-6" />
              </Button>
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

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="p-0 h-auto"
              data-testid="button-back"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <h1 className="text-lg font-semibold">Scrimmage Management</h1>
            <div className="w-6" />
          </div>
        </div>
      </div>
      <div className="max-w-md mx-auto p-4">
        {scrimmages.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <Crown className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Scrimmages Created</h3>
            <p className="text-muted-foreground mb-4">
              {canAccessPremiumFeatures() 
                ? "You haven't created any scrimmages yet. Create your first scrimmage to start managing teams!"
                : "Creating scrimmages requires Player Pro subscription or higher."}
            </p>
            {canAccessPremiumFeatures() && (
              <Button onClick={() => navigate('/create-scrimmage')} data-testid="button-create-first-scrimmage">
                Create Scrimmage
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {scrimmages.map((scrimmage) => {
              const dateTime = formatDateTime(scrimmage.dateTime);
              const pendingCount = scrimmage.requestCount;
              const isSelected = selectedScrimmage === scrimmage.id;
              
              return (
                <Card key={scrimmage.id} className="bg-card border border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{scrimmage.title}</CardTitle>
                        <CardDescription className="mt-2 space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4" />
                            <span>{dateTime.date} at {dateTime.time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4" />
                            <span>{scrimmage.location}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Users className="w-4 h-4" />
                            <span>Max {scrimmage.maxPlayers} players</span>
                          </div>
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={scrimmage.status === 'open' ? 'default' : 'secondary'}>
                          {scrimmage.status}
                        </Badge>
                        {pendingCount > 0 && (
                          <Badge variant="destructive" data-testid={`badge-pending-${scrimmage.id}`}>
                            {pendingCount} pending
                          </Badge>
                        )}
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
                          data-testid={`button-manage-${scrimmage.id}`}
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
                              setSelectedScrimmage(null); // Close management view
                              setViewRosterScrimmage(scrimmage.id); // Open roster view
                            }
                          }}
                          data-testid={`button-view-roster-${scrimmage.id}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          {viewRosterScrimmage === scrimmage.id ? 'Hide Roster' : 'View Roster'}
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPageTransitionDirection('up');
                            navigate(`/edit-scrimmage/${scrimmage.id}`);
                          }}
                          data-testid={`button-edit-${scrimmage.id}`}
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
                          data-testid={`button-delete-${scrimmage.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {/* Finalize & Invoice Button */}
                      <div className="border-t border-border pt-3">
                        <Button
                          onClick={() => finalizeMutation.mutate(scrimmage.id)}
                          disabled={(finalizeMutation.isPending && finalizeMutation.variables === scrimmage.id) || scrimmage.status === 'roster_confirmed'}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          size="sm"
                          data-testid={`button-finalize-roster-${scrimmage.id}`}
                        >
                          {(finalizeMutation.isPending && finalizeMutation.variables === scrimmage.id) ? (
                            <>
                              <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                              Finalizing...
                            </>
                          ) : scrimmage.status === 'roster_confirmed' ? (
                            <>
                              <Check className="w-4 h-4 mr-2" />
                              Roster Finalized
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 mr-2" />
                              Finalize & Invoice
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1 text-center">
                          {scrimmage.costPerPlayer ? 
                            'Confirm roster, send notifications & create payment requests' :
                            'Confirm roster and send notifications to approved players'
                          }
                        </p>
                      </div>
                    </div>
                    
                    {/* Simple Roster View */}
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
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', viewRosterScrimmage, 'approved-players'] })}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : !rosterData?.approvedPlayers || rosterData.approvedPlayers.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>No players confirmed yet</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {rosterData.approvedPlayers.map((request) => (
                              <div
                                key={request.id}
                                className="flex items-center gap-3 p-3 rounded-lg bg-[#212121] border border-gray-700"
                                data-testid={`roster-player-${request.id}`}
                              >
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={request.player.profileImageUrl || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {request.player.firstName?.[0]}{request.player.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="font-medium text-white text-[16px]">
                                    {request.player.firstName} {request.player.lastName}
                                  </p>
                                </div>
                                <Badge className="bg-green-600 text-white text-xs hover:bg-green-600">
                                  ✓ Confirmed
                                </Badge>
                              </div>
                            ))}
                            <div className="mt-4 pt-4 border-t border-gray-600 text-center">
                              <p className="text-sm text-white">
                                {rosterData.approvedPlayers.length} of {scrimmage.maxPlayers} players confirmed
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Full Management View */}
                    {isSelected && (
                      <div className="mt-4 border-t border-border pt-4">
                        {requestsLoading ? (
                          <div className="text-center py-4">
                            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                          </div>
                        ) : requestsError ? (
                          <div className="text-center py-8 text-destructive">
                            <p className="font-medium mb-2">Error Loading Requests</p>
                            <p className="text-sm text-muted-foreground mb-4">
                              {requestsError?.message || 'Failed to load requests'}
                            </p>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', selectedScrimmage, 'requests'] })}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : (
                          <Tabs defaultValue="pending" className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                              <TabsTrigger value="pending">
                                Pending ({getPendingRequests(requests).length})
                              </TabsTrigger>
                              <TabsTrigger value="approved">
                                Approved ({getApprovedRequests(requests).length})
                              </TabsTrigger>
                              <TabsTrigger value="cohosts">
                                <Shield className="w-3 h-3 mr-1" />
                                Co-Hosts ({coHosts.length})
                              </TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="pending" className="mt-4">
                              <ScrollArea className="h-64">
                                {getPendingRequests(requests).length === 0 ? (
                                  <div className="text-center py-8 text-muted-foreground">
                                    No pending requests
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {getPendingRequests(requests).map((request) => (
                                      <div
                                        key={request.id}
                                        className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50"
                                        data-testid={`request-${request.id}`}
                                      >
                                        <Avatar className="h-10 w-10">
                                          <AvatarImage src={request.player.profileImageUrl || undefined} />
                                          <AvatarFallback>
                                            {request.player.firstName?.[0]}{request.player.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            {request.player.firstName} {request.player.lastName}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            {formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}
                                          </p>
                                        </div>
                                        <div className="flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="default"
                                            onClick={() => manageRequestMutation.mutate({ 
                                              requestId: request.id, 
                                              status: 'approved' 
                                            })}
                                            disabled={manageRequestMutation.isPending}
                                            data-testid={`button-approve-${request.id}`}
                                          >
                                            <Check className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => manageRequestMutation.mutate({ 
                                              requestId: request.id, 
                                              status: 'dismissed' 
                                            })}
                                            disabled={manageRequestMutation.isPending}
                                            data-testid={`button-decline-${request.id}`}
                                          >
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
                                  <div className="text-center py-8 text-muted-foreground">
                                    No approved players yet
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {getApprovedRequests(requests).map((request) => (
                                      <div
                                        key={request.id}
                                        className="flex items-center gap-3 p-3 rounded-lg border dark:bg-green-950/20 bg-[#e2e2e2] dark:bg-[#212121] text-[#212121] dark:text-[#ffffff]"
                                        data-testid={`approved-${request.id}`}
                                      >
                                        <Avatar className="h-10 w-10">
                                          <AvatarImage src={request.player.profileImageUrl || undefined} />
                                          <AvatarFallback>
                                            {request.player.firstName?.[0]}{request.player.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            {request.player.firstName} {request.player.lastName}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            Approved {formatDistanceToNow(new Date(request.approvedAt!), { addSuffix: true })}
                                          </p>
                                        </div>
                                        <Badge variant="default" className="bg-green-600">
                                          Approved
                                        </Badge>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </ScrollArea>
                            </TabsContent>
                            
                            <TabsContent value="cohosts" className="mt-4">
                              <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <p className="text-sm text-muted-foreground">
                                    Co-hosts can help manage this scrimmage
                                  </p>
                                  <Dialog open={coHostDialogOpen === scrimmage.id} onOpenChange={(open) => {
                                    if (open) {
                                      setCoHostDialogOpen(scrimmage.id);
                                    } else {
                                      setCoHostDialogOpen(null);
                                      setSelectedCoHostUserId('');
                                      setCoHostPermissions({ canApproveRequests: true, canSendReminders: true, canManagePayments: true });
                                    }
                                  }}>
                                    <DialogTrigger asChild>
                                      <Button size="sm" variant="outline" data-testid={`button-add-cohost-${scrimmage.id}`}>
                                        <UserPlus className="w-4 h-4 mr-1" />
                                        Add Co-Host
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Add Co-Host</DialogTitle>
                                        <DialogDescription>
                                          Select a league member to add as a co-host for this scrimmage. Configure what permissions they should have.
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                          <Label htmlFor="cohost-select">Select Member</Label>
                                          <Select value={selectedCoHostUserId} onValueChange={setSelectedCoHostUserId}>
                                            <SelectTrigger id="cohost-select" data-testid="select-cohost-user">
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
                                            <Checkbox 
                                              id="perm-approve" 
                                              checked={coHostPermissions.canApproveRequests}
                                              onCheckedChange={(checked) => setCoHostPermissions(p => ({ ...p, canApproveRequests: !!checked }))}
                                              data-testid="checkbox-perm-approve"
                                            />
                                            <label htmlFor="perm-approve" className="text-sm">
                                              Can approve/decline player requests
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <Checkbox 
                                              id="perm-reminders" 
                                              checked={coHostPermissions.canSendReminders}
                                              onCheckedChange={(checked) => setCoHostPermissions(p => ({ ...p, canSendReminders: !!checked }))}
                                              data-testid="checkbox-perm-reminders"
                                            />
                                            <label htmlFor="perm-reminders" className="text-sm">
                                              Can send reminders to players
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <Checkbox 
                                              id="perm-payments" 
                                              checked={coHostPermissions.canManagePayments}
                                              onCheckedChange={(checked) => setCoHostPermissions(p => ({ ...p, canManagePayments: !!checked }))}
                                              data-testid="checkbox-perm-payments"
                                            />
                                            <label htmlFor="perm-payments" className="text-sm">
                                              Can collect and mark payments
                                            </label>
                                          </div>
                                        </div>
                                        <Button 
                                          className="w-full"
                                          disabled={!selectedCoHostUserId || addCoHostMutation.isPending}
                                          onClick={() => addCoHostMutation.mutate({
                                            scrimmageId: scrimmage.id,
                                            coHostUserId: selectedCoHostUserId,
                                            permissions: coHostPermissions,
                                          })}
                                          data-testid="button-confirm-add-cohost"
                                        >
                                          {addCoHostMutation.isPending ? 'Adding...' : 'Add Co-Host'}
                                        </Button>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                </div>
                                
                                <ScrollArea className="h-48">
                                  {coHostsLoading ? (
                                    <div className="text-center py-4">
                                      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                                    </div>
                                  ) : coHosts.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                      <Shield className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                      <p>No co-hosts assigned</p>
                                      <p className="text-xs mt-1">Add co-hosts to help manage this scrimmage</p>
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {coHosts.map((coHost) => (
                                        <div
                                          key={coHost.userId}
                                          className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50"
                                          data-testid={`cohost-${coHost.userId}`}
                                        >
                                          <Avatar className="h-10 w-10">
                                            <AvatarImage src={coHost.user?.profileImageUrl || undefined} />
                                            <AvatarFallback>
                                              {coHost.user?.firstName?.[0]}{coHost.user?.lastName?.[0]}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="flex-1">
                                            <p className="font-medium">
                                              {coHost.user?.firstName} {coHost.user?.lastName}
                                            </p>
                                            <div className="flex gap-1 flex-wrap mt-1">
                                              {coHost.canApproveRequests && (
                                                <Badge variant="outline" className="text-xs">Approve</Badge>
                                              )}
                                              {coHost.canSendReminders && (
                                                <Badge variant="outline" className="text-xs">Reminders</Badge>
                                              )}
                                              {coHost.canManagePayments && (
                                                <Badge variant="outline" className="text-xs">Payments</Badge>
                                              )}
                                            </div>
                                          </div>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => {
                                              if (confirm('Remove this co-host from the scrimmage?')) {
                                                removeCoHostMutation.mutate({
                                                  scrimmageId: scrimmage.id,
                                                  coHostUserId: coHost.userId,
                                                });
                                              }
                                            }}
                                            disabled={removeCoHostMutation.isPending}
                                            data-testid={`button-remove-cohost-${coHost.userId}`}
                                          >
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}