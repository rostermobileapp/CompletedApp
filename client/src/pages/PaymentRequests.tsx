import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import CreatePaymentRequestPage from '@/pages/CreatePaymentRequest';
import { ArrowLeft, DollarSign, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { usePermissions } from '@/context/SubscriptionContext';
import { PaymentSummaryCard } from '@/components/PaymentSummaryCard';

export default function PaymentRequests() {
  const [, navigate] = useLocation();
  const { openOverlay } = useSlideUpOverlay();
  const [activeTab, setActiveTab] = useState<'created' | 'received'>('created');
  const { selectedType, selectedTeamId, selectedLeagueId } = useDashboardSelection();
  const { canAccessPremiumFeatures } = usePermissions();

  // FREE TIER RESTRICTION: Block access to Payments page for free tier users
  const isFreeTier = !canAccessPremiumFeatures();

  if (isFreeTier) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageTransitionDirection('down');
                navigate('/');
              }}
              className="p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Payment Requests</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 mt-12">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <DollarSign className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
          <p className="text-muted-foreground text-center max-w-sm mb-6">
            Access to payment management is available with a Player Pro or Commissioner subscription.
          </p>
          <Button
            onClick={() => {
              setPageTransitionDirection('up');
              navigate('/subscription');
            }}
            size="lg"
            data-testid="button-upgrade-payments"
          >
            Upgrade to Manage Payments
          </Button>
        </div>
      </div>
    );
  }

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
  });

  const { data: allReceivedRequests = [], isLoading: receivedLoading } = useQuery({
    queryKey: ['/api/payment-requests/received/by-me'],
  });

  const filterPaymentRequests = (requests: any[]) => {
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
    return filterPaymentRequests(allCreatedRequests as any[]);
  }, [allCreatedRequests, selectedType, selectedTeamId, selectedLeagueId, teamLeagueMap, activeSeasonTeamIds]);

  const receivedRequestsArray = useMemo(() => {
    return filterPaymentRequests(allReceivedRequests as any[]);
  }, [allReceivedRequests, selectedType, selectedTeamId, selectedLeagueId, teamLeagueMap, activeSeasonTeamIds]);

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="payment-requests-page">
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

          <Button
            onClick={() => openOverlay('/create-payment-request', <CreatePaymentRequestPage />)}
            size="sm"
            data-testid="button-create-payment-request"
          >
            <Plus className="w-4 h-4 mr-1" />
            Create
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'created' | 'received')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="created" data-testid="tab-created">
              <DollarSign className="w-4 h-4 mr-2" />
              Created by Me
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
                <p className="text-muted-foreground mb-4">You haven't created any payment requests yet.</p>
                <Button
                  onClick={() => openOverlay('/create-payment-request', <CreatePaymentRequestPage />)}
                  data-testid="button-create-first-request"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Request
                </Button>
              </div>
            ) : (
              createdRequestsArray.map((request: any) => (
                <PaymentSummaryCard key={request.id} request={request} isCreator={true} />
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

