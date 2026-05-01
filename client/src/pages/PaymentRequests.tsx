import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import CreatePaymentRequestPage from '@/pages/CreatePaymentRequest';
import { ArrowLeft, ArrowUpRight, DollarSign, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, differenceInCalendarDays } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { usePermissions } from '@/context/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';

type PaymentStatus = 'open' | 'overdue' | 'settled';

const STATUS_THEME: Record<PaymentStatus, {
  pillBg: string;
  pillText: string;
  bar: string;
  dot: string;
  text: string;
  pillLabel: string;
}> = {
  open: {
    pillBg: 'bg-blue-500/15 dark:bg-blue-400/15',
    pillText: 'text-blue-600 dark:text-blue-300',
    bar: 'bg-blue-500 dark:bg-blue-400',
    dot: 'bg-blue-500 dark:bg-blue-400',
    text: 'text-blue-600 dark:text-blue-300',
    pillLabel: 'Open',
  },
  overdue: {
    pillBg: 'bg-red-500/15 dark:bg-red-400/15',
    pillText: 'text-red-600 dark:text-red-300',
    bar: 'bg-red-500 dark:bg-red-400',
    dot: 'bg-red-500 dark:bg-red-400',
    text: 'text-red-600 dark:text-red-300',
    pillLabel: 'Overdue',
  },
  settled: {
    pillBg: 'bg-emerald-500/15 dark:bg-emerald-400/15',
    pillText: 'text-emerald-600 dark:text-emerald-300',
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-300',
    pillLabel: 'Settled',
  },
};

function formatMoney(value: number) {
  return value % 1 === 0
    ? `$${value.toFixed(0)}`
    : `$${value.toFixed(2)}`;
}

function getDueLine(status: PaymentStatus, deadline: Date | null, settledAt: Date | null) {
  if (status === 'settled') {
    const date = settledAt ?? deadline;
    if (!date) return null;
    return `Closed — ${format(date, 'MMM d')}`;
  }
  if (!deadline) return 'No due date';
  if (status === 'overdue') {
    return `Overdue — was ${format(deadline, 'MMM d')}`;
  }
  // open
  const daysUntil = differenceInCalendarDays(deadline, new Date());
  if (daysUntil <= 0) return `Due today — ${format(deadline, 'MMM d')}`;
  if (daysUntil === 1) return `Due tomorrow — ${format(deadline, 'MMM d')}`;
  return `Due in ${daysUntil} days — ${format(deadline, 'MMM d')}`;
}

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
        if (request.leagueId === selectedLeagueId) return true;
        if (!request.leagueId && !request.teamId) return true;
        return false;
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
  }, [allCreatedRequests, selectedType, selectedTeamId, selectedLeagueId, teamLeagueMap]);

  const receivedRequestsArray = useMemo(() => {
    return filterPaymentRequests(allReceivedRequests as any[]);
  }, [allReceivedRequests, selectedType, selectedTeamId, selectedLeagueId, teamLeagueMap]);

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

function PaymentRequestCard({ request, isCreator }: { request: any; isCreator: boolean }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const recipients: any[] = Array.isArray(request.recipients) ? request.recipients : [];
  const recipientCount = recipients.length;
  const paidCount = recipients.filter((r: any) => r.isPaid).length;
  const amountPerPerson = Number(request.amountPerPerson) || 0;
  const total = amountPerPerson * recipientCount;
  const collected = amountPerPerson * paidCount;
  const fillPct = total > 0 ? Math.min(100, Math.round((collected / total) * 100)) : 0;

  const deadline = request.deadline ? new Date(request.deadline) : null;
  const isAllPaid = recipientCount > 0 && paidCount === recipientCount;
  const isOverdue = !!deadline && deadline.getTime() < Date.now() && !isAllPaid;
  const status: PaymentStatus = isAllPaid ? 'settled' : isOverdue ? 'overdue' : 'open';
  const theme = STATUS_THEME[status];

  // For settled: most recent paidAt across recipients (fallback to deadline)
  const settledAt = useMemo(() => {
    if (status !== 'settled') return null;
    const paidDates = recipients
      .map(r => (r.paidAt ? new Date(r.paidAt).getTime() : 0))
      .filter(t => t > 0);
    if (paidDates.length === 0) return deadline;
    return new Date(Math.max(...paidDates));
  }, [status, recipients, deadline]);

  const dueLine = getDueLine(status, deadline, settledAt);

  // Unpaid registered recipients (placeholders are skipped — they have no account to push)
  const unpaidRegisteredCount = recipients.filter((r: any) => !r.isPaid && r.userId).length;

  const remindMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/payment-requests/${request.id}/remind-unpaid`);
      return res.json();
    },
    onSuccess: (data: { remindedCount: number; attempted?: number }) => {
      const n = data?.remindedCount ?? 0;
      toast({
        title: n > 0 ? 'Reminders sent' : 'No reminders sent',
        description: n > 0
          ? `Reminded ${n} unpaid player${n === 1 ? '' : 's'}.`
          : 'No unpaid players could be reached (notifications may be off).',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
    },
    onError: () => {
      toast({
        title: "Couldn't send reminders",
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    },
  });

  const showRemindButton = isCreator && status !== 'settled' && unpaidRegisteredCount > 0;
  const showAllPaidLabel = isCreator && status === 'settled';

  return (
    <div
      className="bg-[#e2e2e2] dark:bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-4 cursor-pointer hover:border-primary transition-colors pt-[4px] pb-[4px] pl-[8px] pr-[8px]"
      onClick={() => {
        setPageTransitionDirection('up');
        navigate(`/payment-requests/${request.id}`);
      }}
      data-testid={`payment-request-card-${request.id}`}
    >
      {/* Top row: title + paid count + status pill */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-base leading-tight truncate" data-testid={`text-request-title-${request.id}`}>
            {request.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatMoney(amountPerPerson)} per player
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs text-muted-foreground" data-testid={`text-paid-count-${request.id}`}>
            {paidCount} / {recipientCount} paid
          </span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${theme.pillBg} ${theme.pillText}`}
            data-testid={`status-pill-${request.id}`}
          >
            {theme.pillLabel}
          </span>
        </div>
      </div>
      {/* Collected line + progress bar */}
      <div className="mb-2">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Collected</span>
          <span className="text-sm font-medium" data-testid={`text-collected-${request.id}`}>
            {formatMoney(collected)} of {formatMoney(total)}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${theme.bar}`}
            style={{ width: `${fillPct}%` }}
            data-testid={`progress-bar-${request.id}`}
          />
        </div>
      </div>
      {/* Action row right under the progress bar, right-aligned */}
      {(showRemindButton || showAllPaidLabel) && (
        <div className="flex justify-end mb-2">
          {showRemindButton ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!remindMutation.isPending) remindMutation.mutate();
              }}
              disabled={remindMutation.isPending}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--hairline))] px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-60"
              data-testid={`button-remind-unpaid-${request.id}`}
            >
              {remindMutation.isPending ? 'Sending…' : 'Remind unpaid'}
              <ArrowUpRight className="w-3 h-3" />
            </button>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground" data-testid={`text-all-paid-${request.id}`}>
              All paid
            </span>
          )}
        </div>
      )}
      {/* Due / overdue / closed line */}
      {dueLine && (
        <p
          className={`text-xs mb-3 ${status === 'overdue' ? theme.text : 'text-muted-foreground'}`}
          data-testid={`text-due-line-${request.id}`}
        >
          {dueLine}
        </p>
      )}
      {/* Bottom row: dots */}
      {recipientCount > 0 && (
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {recipients.slice(0, 12).map((r: any, i: number) => (
              <span
                key={r.id ?? i}
                className={`block w-2 h-2 rounded-full ${
                  r.isPaid ? theme.dot : 'bg-black/15 dark:bg-white/15'
                }`}
              />
            ))}
            {recipientCount > 12 && (
              <span className="text-[10px] text-muted-foreground ml-1">
                +{recipientCount - 12}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
