import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import CreatePaymentRequestPage from '@/pages/CreatePaymentRequest';
import { ArrowLeft, DollarSign, Lock, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { usePermissions } from '@/context/SubscriptionContext';
import { PaymentSummaryCard } from '@/components/PaymentSummaryCard';
import { useToast } from '@/hooks/use-toast';
import { usePaymentReturnRefresh } from '@/hooks/usePaymentReturnRefresh';
import { OrganizerStripeSetupCard, OrganizerStripeUnlinkDialog } from '@/components/OrganizerStripeSetupCard';
import { openOrganizerStripeUrl } from '@/lib/organizerStripeNavigation';

export default function PaymentRequests() {
  const [, navigate] = useLocation();
  const { openOverlay } = useSlideUpOverlay();
  const { selectedType, selectedTeamId, selectedLeagueId } = useDashboardSelection();
  const { canAccessPremiumFeatures, hasRole, user, isLoading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isFreeTier = !permissionsLoading && !canAccessPremiumFeatures();
  const [unlinkConnectionId, setUnlinkConnectionId] = useState<string | null>(null);

  const { data: cardSetup, refetch: refetchCardSetup } = useQuery<any>({
    queryKey: ['/api/organizer-card-payments/connect/status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/organizer-card-payments/connect/status');
      return response.json();
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  usePaymentReturnRefresh(() => refetchCardSetup(), 'organizer-card-setup');

  const connectCardAccount = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/organizer-card-payments/connect/onboarding', {});
      const data = await response.json();
      if (typeof data?.url !== 'string' || !data.url) {
        throw new Error('Stripe did not return a setup link. Please try again.');
      }
      openOrganizerStripeUrl(data.url);
      return data;
    },
    onError: (error: any) => {
      toast({
        title: 'Could not open Stripe setup',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/organizer-card-payments/connect/status'] });
    },
  });

  const unlinkCardAccount = useMutation({
    mutationFn: async () => {
      if (!unlinkConnectionId) throw new Error('Refresh your Stripe connection before unlinking.');
      const response = await apiRequest('POST', '/api/organizer-card-payments/connect/unlink', {
        confirmed: true, connectionId: unlinkConnectionId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/organizer-card-payments/connect/status'], (previous: any) => ({
        ...previous, connected: false, ready: false, enabled: false, connectionId: null, unlinkPending: false,
      }));
      setUnlinkConnectionId(null);
      toast({ title: 'Stripe unlinked' });
    },
    onError: (error: any) => {
      toast({ title: 'Could not unlink Stripe', description: error?.message || 'Please try again.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: query => String(query.queryKey[0]).startsWith('/api/organizer-card-payments') ||
          String(query.queryKey[0]).startsWith('/api/payment-requests'),
      });
    },
  });

  const [activeTab, setActiveTab] = useState<'created' | 'received'>('created');

  // Fetch unpaid count for badge
  const { data: unpaidCount } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payment-requests/unpaid-count');
      return response.json();
    },
    refetchInterval: 90000,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch user's teams to get team-to-league mapping
  const { data: userTeams = [] } = useQuery<any[]>({
    queryKey: ['/api/user/teams'],
  });

  const teamLeagueMap = useMemo(() => {
    const map: Record<string, string> = {};
    userTeams.forEach((team: any) => {
      if (team.id && team.leagueId) {
        map[team.id] = team.leagueId;
      }
    });
    return map;
  }, [userTeams]);

  // Set of team IDs that belong to the currently active season within each
  // league. Used to exclude cross-season payments when a league is selected.
  const activeSeasonTeamIds = useMemo(() => {
    const ids = new Set<string>();
    userTeams.forEach((team: any) => {
      if (!team.id) return;
      // Teams with no seasonId are legacy/standalone teams — always included.
      // Teams with a seasonId are included only when that season is active.
      if (team.seasonId === null || team.seasonId === undefined || team.seasonIsActive === true) {
        ids.add(team.id);
      }
    });
    return ids;
  }, [userTeams]);

  const { data: allCreatedRequests = [], isLoading: createdLoading } = useQuery({
    queryKey: ['/api/payment-requests/created/by-me'],
    // Payment status can be changed by a recipient on another device. Always
    // refresh when the organizer opens/returns to this screen, and poll while
    // it is open so paid scrimmage invoices can be confirmed promptly.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const { data: allReceivedRequests = [], isLoading: receivedLoading } = useQuery({
    queryKey: ['/api/payment-requests/received/by-me'],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const filterCreatedRequests = (requests: any[]) => {
    const alwaysVisibleSharedRequests = requests.filter(
      request => request.viewerIsSharedScrimmageCoHost === true,
    );
    const contextRequests = requests.filter(
      request => request.viewerIsSharedScrimmageCoHost !== true,
    );

    if (selectedType === 'tournament') {
      return alwaysVisibleSharedRequests;
    }
    if (selectedType === 'league' && selectedLeagueId) {
      return [
        ...alwaysVisibleSharedRequests,
        ...contextRequests.filter(request => {
          if (request.leagueId !== selectedLeagueId) return false;
          // If the request is tied to a specific team, only show it when that team
          // belongs to the currently active season. This hides prior-season team
          // payments when the user has a league selected.
          if (request.teamId) return activeSeasonTeamIds.has(request.teamId);
          return true;
        }),
      ];
    }
    if (selectedType === 'team' && selectedTeamId) {
      const selectedTeamLeagueId = teamLeagueMap[selectedTeamId];
      return [
        ...alwaysVisibleSharedRequests,
        ...contextRequests.filter(request => {
          if (request.teamId === selectedTeamId) return true;
          if (request.leagueId && !request.teamId && selectedTeamLeagueId) {
            return request.leagueId === selectedTeamLeagueId;
          }
          if (!request.leagueId && !request.teamId) return true;
          return false;
        }),
      ];
    }
    return requests;
  };

  const createdRequestsArray = useMemo(() => {
    return filterCreatedRequests(allCreatedRequests as any[]);
  }, [allCreatedRequests, selectedType, selectedTeamId, selectedLeagueId, teamLeagueMap, activeSeasonTeamIds]);

  // "Requests for Me" always shows ALL received requests regardless of selected
  // context — the global badge count is also unscoped, so the list must match.
  const receivedRequestsArray = useMemo(() => {
    return allReceivedRequests as any[];
  }, [allReceivedRequests]);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-y-auto overscroll-y-contain pb-28" data-testid="payment-requests-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setPageTransitionDirection('down');
                navigate('/');
              }}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Payment Requests</h1>
              <p className="text-sm text-muted-foreground">Manage your payments</p>
            </div>
          </div>

          {!isFreeTier && (
            <Button
              onClick={() => openOverlay('/create-payment-request', <CreatePaymentRequestPage />)}
              size="sm"
              data-testid="button-create-payment-request"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>
          )}
        </div>

        <OrganizerStripeSetupCard
          eligible={hasRole('player_pro') || user?.displayId === 'U00001' || cardSetup?.eligible === true || cardSetup?.connected === true}
          ready={cardSetup?.ready === true}
          collectionEnabled={cardSetup?.enabled === true && cardSetup?.webhookReady === true}
          pending={connectCardAccount.isPending || unlinkCardAccount.isPending}
          connected={cardSetup?.connected === true}
          unlinkPending={cardSetup?.unlinkPending === true}
          onUnlink={typeof cardSetup?.connectionId === 'string' ? () => setUnlinkConnectionId(cardSetup.connectionId) : undefined}
          onSetup={() => connectCardAccount.mutate()}
          onManage={() => {
            try {
              openOrganizerStripeUrl('https://dashboard.stripe.com/settings');
            } catch (error) {
              toast({
                title: 'Could not open Stripe settings',
                description: error instanceof Error ? error.message : 'Please try again.',
                variant: 'destructive',
              });
            }
          }}
        />
        <OrganizerStripeUnlinkDialog
          open={unlinkConnectionId !== null}
          pending={unlinkCardAccount.isPending}
          onOpenChange={open => { if (!open) setUnlinkConnectionId(null); }}
          onConfirm={() => unlinkCardAccount.mutate()}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'created' | 'received')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="created" data-testid="tab-created">
              <DollarSign className="w-4 h-4 mr-2" />
              Manage
            </TabsTrigger>
            <TabsTrigger value="received" data-testid="tab-received" className="relative">
              <Users className="w-4 h-4 mr-2" />
              Requests for Me
              {unpaidCount && unpaidCount.count > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {unpaidCount.count}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="created" className="space-y-3">
            {createdLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : createdRequestsArray.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">You don't have any payment requests to manage yet.</p>
                {isFreeTier ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Lock className="w-4 h-4" />
                    Generic payment requests require Player Pro or Commissioner access.
                  </div>
                ) : (
                  <Button
                    onClick={() => openOverlay('/create-payment-request', <CreatePaymentRequestPage />)}
                    data-testid="button-create-first-request"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Request
                  </Button>
                )}
              </div>
            ) : (
              createdRequestsArray.map((request: any) => (
                <PaymentSummaryCard
                  key={request.id}
                  request={request}
                  isCreator={request.viewerIsScrimmageOrganizer === true}
                  canManagePayments={request.viewerCanManagePayments === true}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="received" className="space-y-3">
            {receivedLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : receivedRequestsArray.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">You don't have any payment requests at the moment.</p>
              </div>
            ) : (
              receivedRequestsArray.map((request: any) => (
                <PaymentSummaryCard key={request.id} request={request} isCreator={false} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
