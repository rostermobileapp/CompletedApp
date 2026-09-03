import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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

export default function PaymentRequests() {
  const [, navigate] = useLocation();
  const { openOverlay } = useSlideUpOverlay();
  const { selectedType, selectedTeamId, selectedLeagueId } = useDashboardSelection();
  const { canAccessPremiumFeatures, isLoading: permissionsLoading } = usePermissions();

  const isFreeTier = !permissionsLoading && !canAccessPremiumFeatures();

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
    if (selectedType === 'tournament') {
      return [];
    }
    if (selectedType === 'league' && selectedLeagueId) {
      return requests.filter(request => {
        if (request.leagueId !== selectedLeagueId) return false;
        // If the request is tied to a specific team, only show it when that team
        // belongs to the currently active season. This hides prior-season team
        // payments when the user has a league selected.
        if (request.teamId) return activeSeasonTeamIds.has(request.teamId);
        return true;
      });
    }
    if (selectedType === 'team' && selectedTeamId) {
      const selectedTeamLeagueId = teamLeagueMap[selectedTeamId];
      return requests.filter(request => {
        if (request.teamId === selectedTeamId) return true;
        if (request.leagueId && !request.teamId && selectedTeamLeagueId) {
          return request.leagueId === selectedTeamLeagueId;
        }
        if (!request.leagueId && !request.teamId) return true;
        return false;
      });
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
