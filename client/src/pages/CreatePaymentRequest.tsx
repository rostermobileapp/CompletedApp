import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import { ArrowLeft, DollarSign, Users, UserCircle2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { createPaymentRequestSchema } from '@shared/schema';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePermissions } from '@/context/SubscriptionContext';
import { PremiumFeatureAlert } from '@/components/PremiumFeatureAlert';
import { FixedBottomButton } from '@/components/FixedBottomButton';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';

type CreatePaymentRequestForm = z.infer<typeof createPaymentRequestSchema>;

type InvoiceableUser = {
  type: 'user';
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  profileImageUrl: string | null;
  venmoUsername: string | null;
  cashappUsername: string | null;
  teamId: string | null;
  teamName: string | null;
  isPlaceholderUser: boolean;
};

type InvoiceablePlaceholder = {
  type: 'placeholder';
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  profileImageUrl: null;
  venmoUsername: null;
  cashappUsername: null;
  teamId: string | null;
  teamName: string | null;
  isPlaceholderUser: true;
};

type InvoiceablePayload = { users: InvoiceableUser[]; placeholders: InvoiceablePlaceholder[] };

type TeamOption = { id: string; name: string };

const FREE_AGENT_TEAM_VALUE = '__free_agents__';
const ALL_TEAMS_VALUE = '__all__';

export default function CreatePaymentRequest() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { closeWithSlideDown } = useSlideUpOverlay();
  const { selectedLeagueId, selectedTeamId } = useDashboardSelection();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedPlaceholderIds, setSelectedPlaceholderIds] = useState<string[]>([]);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>(ALL_TEAMS_VALUE);
  const [showPremiumAlert, setShowPremiumAlert] = useState(false);

  const {
    canAccessPremiumFeatures,
    canManageLeagueSpecific,
  } = usePermissions();

  const form = useForm<CreatePaymentRequestForm>({
    resolver: zodResolver(createPaymentRequestSchema),
    defaultValues: {
      title: '',
      description: '',
      amountPerPerson: '',
      deadline: undefined,
      leagueId: '',
      recipientUserIds: [],
      placeholderPlayerIds: [],
      relatedScrimmageId: null,
      relatedConversationId: null,
    },
  });

  // Fetch user's leagues for fallback selection.
  const { data: userLeagues = [], isLoading: leaguesLoading } = useQuery<any[]>({
    queryKey: ['/api/user/leagues'],
  });

  // Fetch teams to look up team's parent league when dashboard selection is a team.
  const { data: userTeams = [] } = useQuery<any[]>({
    queryKey: ['/api/user/teams'],
  });

  // Resolve which league this invoice belongs to.
  const activeLeagueId = useMemo<string | null>(() => {
    if (selectedLeagueId) return selectedLeagueId;
    if (selectedTeamId) {
      const t = userTeams.find((t: any) => t.id === selectedTeamId);
      if (t?.leagueId) return t.leagueId;
    }
    if (userLeagues.length > 0) return userLeagues[0].id;
    return null;
  }, [selectedLeagueId, selectedTeamId, userTeams, userLeagues]);

  // Permission check: must be league commissioner OR globally player_pro+.
  const isLeagueCommissionerOfActive = activeLeagueId
    ? canManageLeagueSpecific(activeLeagueId)
    : false;
  const isPremium = canAccessPremiumFeatures();
  const canCreate = isPremium || isLeagueCommissionerOfActive;

  // If the user can't create, show paywall.
  useEffect(() => {
    if (!leaguesLoading && !canCreate) {
      setShowPremiumAlert(true);
    }
  }, [leaguesLoading, canCreate]);

  // Keep the form's leagueId in sync with the active dashboard league
  // so Zod validation passes the required-field check.
  useEffect(() => {
    if (activeLeagueId) {
      form.setValue('leagueId', activeLeagueId);
    }
  }, [activeLeagueId, form]);

  const handlePremiumAlertClose = (open: boolean) => {
    setShowPremiumAlert(open);
    if (!open && !canCreate) {
      closeWithSlideDown('/payment-requests');
    }
  };

  // Fetch teams for the team filter dropdown.
  const { data: leagueTeams = [] } = useQuery<TeamOption[]>({
    queryKey: ['/api/leagues', activeLeagueId, 'teams'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/leagues/${activeLeagueId}/teams`);
      return res.json();
    },
    enabled: !!activeLeagueId && canCreate,
  });

  // Fetch invoiceable players for the active league.
  const { data: invoiceable, isLoading: playersLoading } = useQuery<InvoiceablePayload>({
    queryKey: ['/api/leagues', activeLeagueId, 'invoiceable-players'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/leagues/${activeLeagueId}/invoiceable-players`);
      return res.json();
    },
    enabled: !!activeLeagueId && canCreate,
  });

  // Pre-fill form from URL query params after first render.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title');
    const amount = params.get('amount');
    const relatedScrimmageId = params.get('relatedScrimmageId');
    const recipientIds = params.get('recipientIds');
    if (title) form.setValue('title', title);
    if (amount) form.setValue('amountPerPerson', amount);
    if (relatedScrimmageId) form.setValue('relatedScrimmageId', relatedScrimmageId);
    if (recipientIds) {
      const ids = recipientIds.split(',').filter(Boolean);
      setSelectedUserIds(ids);
      form.setValue('recipientUserIds', ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Combined and filtered invoiceable list.
  const allPlayers = useMemo(() => {
    if (!invoiceable) return [];
    return [
      ...invoiceable.users,
      ...invoiceable.placeholders,
    ];
  }, [invoiceable]);

  const filteredPlayers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allPlayers.filter(p => {
      // Team filter
      if (selectedTeamFilter === FREE_AGENT_TEAM_VALUE) {
        if (p.teamId) return false;
      } else if (selectedTeamFilter !== ALL_TEAMS_VALUE) {
        if (p.teamId !== selectedTeamFilter) return false;
      }
      if (!q) return true;
      return p.displayName.toLowerCase().includes(q);
    });
  }, [allPlayers, selectedTeamFilter, searchTerm]);

  const totalSelected = selectedUserIds.length + selectedPlaceholderIds.length;

  const togglePlayer = (player: InvoiceableUser | InvoiceablePlaceholder) => {
    if (player.type === 'user') {
      const next = selectedUserIds.includes(player.id)
        ? selectedUserIds.filter(id => id !== player.id)
        : [...selectedUserIds, player.id];
      setSelectedUserIds(next);
      form.setValue('recipientUserIds', next);
      form.trigger('recipientUserIds');
    } else {
      const next = selectedPlaceholderIds.includes(player.id)
        ? selectedPlaceholderIds.filter(id => id !== player.id)
        : [...selectedPlaceholderIds, player.id];
      setSelectedPlaceholderIds(next);
      form.setValue('placeholderPlayerIds', next);
      form.trigger('placeholderPlayerIds');
    }
  };

  const selectAllVisible = () => {
    const userIds = filteredPlayers.filter(p => p.type === 'user').map(p => p.id);
    const phIds = filteredPlayers.filter(p => p.type === 'placeholder').map(p => p.id);
    const mergedUsers = Array.from(new Set([...selectedUserIds, ...userIds]));
    const mergedPh = Array.from(new Set([...selectedPlaceholderIds, ...phIds]));
    setSelectedUserIds(mergedUsers);
    setSelectedPlaceholderIds(mergedPh);
    form.setValue('recipientUserIds', mergedUsers);
    form.setValue('placeholderPlayerIds', mergedPh);
    form.trigger('recipientUserIds');
  };

  const deselectAll = () => {
    setSelectedUserIds([]);
    setSelectedPlaceholderIds([]);
    form.setValue('recipientUserIds', []);
    form.setValue('placeholderPlayerIds', []);
    form.trigger('recipientUserIds');
  };

  const createPaymentRequestMutation = useMutation({
    mutationFn: async (data: CreatePaymentRequestForm) => {
      const response = await apiRequest('POST', '/api/payment-requests', data);
      return response.json();
    },
    onSuccess: (paymentRequest) => {
      toast({
        title: 'Payment Request Created',
        description: `"${paymentRequest.title}" has been created. Recipients will be able to see it in their dashboard.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
      closeWithSlideDown('/payment-requests');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create Payment Request',
        description: error.message || 'An error occurred while creating the payment request',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreatePaymentRequestForm) => {
    if (totalSelected === 0) {
      form.setError('recipientUserIds', {
        type: 'required',
        message: 'Please select at least one recipient',
      });
      return;
    }
    if (!activeLeagueId) {
      toast({
        title: 'No league selected',
        description: 'Please select a league before creating a payment request.',
        variant: 'destructive',
      });
      return;
    }

    createPaymentRequestMutation.mutate({
      ...data,
      leagueId: activeLeagueId,
      recipientUserIds: selectedUserIds,
      placeholderPlayerIds: selectedPlaceholderIds,
    });
  };

  return (
    <div className="min-h-screen flex flex-col pb-48 bg-background" data-testid="create-payment-request-page" data-page-content>
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => closeWithSlideDown('/payment-requests')}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Create Payment Request</h1>
            <p className="text-sm text-muted-foreground">Request payment from league members</p>
          </div>
        </div>

        {/* Form */}
        <form id="create-payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Payment Details Card */}
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Payment Details</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  {...form.register('title')}
                  placeholder="e.g., Game Fees, Equipment Cost"
                  data-testid="input-title"
                />
                {form.formState.errors.title && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.title.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...form.register('description')}
                  placeholder="Add details about what this payment is for..."
                  rows={3}
                  data-testid="input-description"
                />
              </div>

              <div>
                <Label htmlFor="amountPerPerson">Amount Per Person ($) *</Label>
                <Input
                  id="amountPerPerson"
                  {...form.register('amountPerPerson')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  data-testid="input-amount"
                />
                {form.formState.errors.amountPerPerson && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.amountPerPerson.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="deadline">Payment Deadline (Optional)</Label>
                <Input
                  id="deadline"
                  {...form.register('deadline')}
                  type="date"
                  data-testid="input-deadline"
                />
              </div>
            </div>
          </div>

          {/* Recipients Card */}
          <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">Select Recipients *</h2>
              </div>
              <span className="text-sm text-muted-foreground" data-testid="text-selected-count">
                {totalSelected} selected
              </span>
            </div>

            {!activeLeagueId ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Please join a league first to create payment requests.</p>
                <Button
                  type="button"
                  onClick={() => navigate('/league-search')}
                  className="mt-4"
                  data-testid="button-join-league"
                >
                  Find Leagues
                </Button>
              </div>
            ) : playersLoading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading league members...</p>
              </div>
            ) : (
              <>
                {/* Team filter */}
                <div className="mb-4">
                  <Label className="text-sm text-muted-foreground">Filter by team</Label>
                  <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
                    <SelectTrigger className="mt-1" data-testid="select-team-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_TEAMS_VALUE}>All teams</SelectItem>
                      <SelectItem value={FREE_AGENT_TEAM_VALUE}>Free agents (no team)</SelectItem>
                      {leagueTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Search Bar */}
                <div className="mb-4">
                  <Input
                    type="text"
                    placeholder="Search players..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-recipients"
                  />
                </div>

                {/* Select/Deselect All */}
                <div className="flex gap-2 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisible}
                    data-testid="button-select-all"
                  >
                    Select All Visible
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAll}
                    data-testid="button-deselect-all"
                  >
                    Deselect All
                  </Button>
                </div>

                {/* Player List */}
                <ScrollArea className="h-[300px]">
                  {filteredPlayers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No players found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredPlayers.map((p) => {
                        const checked = p.type === 'user'
                          ? selectedUserIds.includes(p.id)
                          : selectedPlaceholderIds.includes(p.id);
                        const initials = `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}` || '?';
                        const isPlaceholder = p.type === 'placeholder' || p.isPlaceholderUser;
                        return (
                          <div
                            key={`${p.type}-${p.id}`}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50"
                            data-testid={`recipient-item-${p.type}-${p.id}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => togglePlayer(p)}
                              data-testid={`checkbox-recipient-${p.type}-${p.id}`}
                            />
                            <Avatar className="w-10 h-10">
                              {p.profileImageUrl
                                ? <AvatarImage src={getImageUrl(p.profileImageUrl) || ''} />
                                : null}
                              <AvatarFallback>
                                {p.type === 'placeholder'
                                  ? <UserCircle2 className="w-5 h-5" />
                                  : initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium" data-testid={`text-recipient-name-${p.type}-${p.id}`}>
                                  {p.displayName}
                                </p>
                                {isPlaceholder && (
                                  <Badge variant="secondary" className="text-xs">Placeholder</Badge>
                                )}
                                {p.teamName && (
                                  <Badge variant="outline" className="text-xs">{p.teamName}</Badge>
                                )}
                              </div>
                              {(p.venmoUsername || p.cashappUsername) && (
                                <p className="text-xs text-muted-foreground">
                                  {p.venmoUsername && (
                                    <>
                                      Venmo:{' '}
                                      <a
                                        href={`https://venmo.com/${p.venmoUsername.replace(/^@/, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                        data-testid={`link-venmo-${p.id}`}
                                      >
                                        {p.venmoUsername}
                                      </a>
                                    </>
                                  )}
                                  {p.venmoUsername && p.cashappUsername && ' • '}
                                  {p.cashappUsername && (
                                    <>
                                      CashApp:{' '}
                                      <a
                                        href={`https://cash.app/$${p.cashappUsername.replace(/^\$/, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                        data-testid={`link-cashapp-${p.id}`}
                                      >
                                        {p.cashappUsername}
                                      </a>
                                    </>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>

                {form.formState.errors.recipientUserIds && (
                  <p className="text-sm text-destructive mt-2">
                    {form.formState.errors.recipientUserIds.message}
                  </p>
                )}
              </>
            )}
          </div>
        </form>
      </div>

      <FixedBottomButton>
        <Button
          type="submit"
          form="create-payment-form"
          className="w-full"
          disabled={createPaymentRequestMutation.isPending || !activeLeagueId || !canCreate}
          data-testid="button-submit"
        >
          {createPaymentRequestMutation.isPending ? 'Creating...' : 'Create Payment Request'}
        </Button>
      </FixedBottomButton>

      {/* Premium Feature Alert */}
      <PremiumFeatureAlert
        open={showPremiumAlert}
        onOpenChange={handlePremiumAlertClose}
      />
    </div>
  );
}
