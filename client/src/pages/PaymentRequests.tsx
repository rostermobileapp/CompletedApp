import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, DollarSign, Plus, Users, Calendar, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';

export default function PaymentRequests() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'created' | 'received'>('created');
  const { selectedType, selectedId, selectedTeamId, selectedLeagueId, selectedTournamentId } = useDashboardSelection();

  // Fetch unpaid count for badge
  const { data: unpaidCount } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payment-requests/unpaid-count');
      return response.json();
    },
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Fetch conversations to map payment requests to teams/leagues
  const { data: allConversations = [] } = useQuery<any[]>({
    queryKey: ['/api/conversations'],
  });

  // Fetch user's scrimmages for league filtering
  const { data: userScrimmages = [] } = useQuery<any[]>({
    queryKey: ['/api/users/scrimmage-requests'],
  });

  // Fetch user's teams to get team-to-league mapping
  const { data: userTeams = [] } = useQuery<any[]>({
    queryKey: ['/api/user/teams'],
  });

  // Create a map of conversationId to teamId and leagueId for filtering
  const conversationDataMap = useMemo(() => {
    const map: Record<string, { teamId: string | null; leagueId: string | null }> = {};
    allConversations.forEach((conv: any) => {
      map[conv.id] = { 
        teamId: conv.teamId || null,
        leagueId: conv.team?.leagueId || null
      };
    });
    return map;
  }, [allConversations]);

  // Create a map of scrimmageId to leagueId for filtering
  const scrimmageLeagueMap = useMemo(() => {
    const map: Record<string, string> = {};
    userScrimmages.forEach((req: any) => {
      if (req.scrimmage?.id && req.scrimmage?.leagueId) {
        map[req.scrimmage.id] = req.scrimmage.leagueId;
      }
    });
    return map;
  }, [userScrimmages]);

  // Create a map of teamId to leagueId
  const teamLeagueMap = useMemo(() => {
    const map: Record<string, string> = {};
    userTeams.forEach((team: any) => {
      if (team.id && team.leagueId) {
        map[team.id] = team.leagueId;
      }
    });
    return map;
  }, [userTeams]);

  // Fetch payment requests created by the user
  const { data: allCreatedRequests = [], isLoading: createdLoading } = useQuery({
    queryKey: ['/api/payment-requests/created/by-me'],
  });

  // Fetch payment requests where the user is a recipient
  const { data: allReceivedRequests = [], isLoading: receivedLoading } = useQuery({
    queryKey: ['/api/payment-requests/received/by-me'],
  });

  // Filter payment requests based on selection context
  const filterPaymentRequests = (requests: any[]) => {
    // If tournament is selected, no payments are applicable
    if (selectedType === 'tournament') {
      return [];
    }

    // If league is selected, filter by league
    if (selectedType === 'league' && selectedLeagueId) {
      return requests.filter(request => {
        // Check if linked to a scrimmage in this league
        if (request.relatedScrimmageId) {
          return scrimmageLeagueMap[request.relatedScrimmageId] === selectedLeagueId;
        }
        // Check if linked to a conversation whose team is in this league
        if (request.relatedConversationId) {
          const convData = conversationDataMap[request.relatedConversationId];
          if (convData?.leagueId) {
            return convData.leagueId === selectedLeagueId;
          }
          if (convData?.teamId) {
            return teamLeagueMap[convData.teamId] === selectedLeagueId;
          }
        }
        return false;
      });
    }

    // If team is selected, filter by team
    if (selectedType === 'team' && selectedTeamId) {
      return requests.filter(request => {
        // Check if linked to a conversation belonging to the team
        if (request.relatedConversationId) {
          return conversationDataMap[request.relatedConversationId]?.teamId === selectedTeamId;
        }
        // Scrimmage payments are league-level, check if team is in that league
        if (request.relatedScrimmageId) {
          const scrimmageLeagueId = scrimmageLeagueMap[request.relatedScrimmageId];
          return scrimmageLeagueId && teamLeagueMap[selectedTeamId] === scrimmageLeagueId;
        }
        return false;
      });
    }

    // No selection, show all
    return requests;
  };

  const createdRequestsArray = useMemo(() => {
    return filterPaymentRequests(allCreatedRequests as any[]);
  }, [allCreatedRequests, selectedType, selectedId, scrimmageLeagueMap, conversationDataMap, teamLeagueMap]);

  // For "Requests for Me", show ALL payment requests sent to the user regardless of dashboard selection
  // These are personal requests addressed to the user and should always be visible
  const receivedRequestsArray = useMemo(() => {
    return allReceivedRequests as any[];
  }, [allReceivedRequests]);

  const getPaymentStatus = (request: any, isCreator: boolean) => {
    if (isCreator) {
      const totalRecipients = request.recipients?.length || 0;
      const paidCount = request.recipients?.filter((r: any) => r.isPaid).length || 0;
      return {
        status: paidCount === totalRecipients ? 'complete' : 'pending',
        label: `${paidCount}/${totalRecipients} paid`,
      };
    } else {
      const myRecipient = request.recipients?.find((r: any) => r.user?.id === (request as any).recipientId);
      return {
        status: myRecipient?.isPaid ? 'paid' : 'unpaid',
        label: myRecipient?.isPaid ? 'Paid' : 'Unpaid',
      };
    }
  };

  const PaymentRequestCard = ({ request, isCreator }: { request: any; isCreator: boolean }) => {
    const status = getPaymentStatus(request, isCreator);
    const deadline = request.deadline ? new Date(request.deadline) : null;
    const isOverdue = deadline && deadline < new Date();

    return (
      <div
        className="bg-[#e2e2e2] dark:bg-card rounded-lg border border-border p-4 cursor-pointer hover:border-primary transition-colors"
        onClick={() => {
          setPageTransitionDirection('up');
          navigate(`/payment-requests/${request.id}`);
        }}
        data-testid={`payment-request-card-${request.id}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold mb-1" data-testid={`text-request-title-${request.id}`}>
              {request.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {request.description || 'No description'}
            </p>
          </div>
          <div className="text-right ml-4">
            <p className="text-lg font-bold text-primary" data-testid={`text-request-amount-${request.id}`}>
              ${request.amountPerPerson}
            </p>
            <p className="text-xs text-muted-foreground">per person</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isCreator ? (
              <div className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={getImageUrl(request.creator?.profileImageUrl) || ''} />
                  <AvatarFallback className="text-xs">
                    {request.creator?.firstName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  {request.recipients?.length} recipient{request.recipients?.length !== 1 ? 's' : ''}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={getImageUrl(request.creator?.profileImageUrl) || ''} />
                  <AvatarFallback className="text-xs">
                    {request.creator?.firstName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  {request.creator?.firstName} {request.creator?.lastName}
                </span>
              </div>
            )}

            {deadline && (
              <div className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                <Calendar className="w-3 h-3" />
                <span>Due {format(deadline, 'MMM d')}</span>
              </div>
            )}
          </div>

          <div className={`flex items-center gap-1 text-sm font-medium ${
            status.status === 'complete' || status.status === 'paid' 
              ? 'text-green-600' 
              : 'text-orange-600'
          }`}>
            {status.status === 'complete' || status.status === 'paid' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            <span>{status.label}</span>
          </div>
        </div>
      </div>
    );
  };

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
            onClick={() => {
              setPageTransitionDirection('up');
              navigate('/create-payment-request');
            }}
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
                  onClick={() => {
                    setPageTransitionDirection('up');
                    navigate('/create-payment-request');
                  }}
                  data-testid="button-create-first-request"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Request
                </Button>
              </div>
            ) : (
              createdRequestsArray.map((request: any) => (
                <PaymentRequestCard key={request.id} request={request} isCreator={true} />
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
                <PaymentRequestCard key={request.id} request={request} isCreator={false} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
