import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, DollarSign, Users } from 'lucide-react';
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
import { usePermissions } from '@/context/SubscriptionContext';
import { PremiumFeatureAlert } from '@/components/PremiumFeatureAlert';
import { FixedBottomButton } from '@/components/FixedBottomButton';

type CreatePaymentRequestForm = z.infer<typeof createPaymentRequestSchema>;

export default function CreatePaymentRequest() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [showPremiumAlert, setShowPremiumAlert] = useState(false);
  const { canAccessPremiumFeatures } = usePermissions();

  const handlePremiumAlertClose = (open: boolean) => {
    setShowPremiumAlert(open);
    if (!open && !canAccessPremiumFeatures()) {
      // If dialog is being closed and user still doesn't have premium access, redirect back
      setPageTransitionDirection('down');
      navigate('/payment-requests');
    }
  };

  const form = useForm<CreatePaymentRequestForm>({
    resolver: zodResolver(createPaymentRequestSchema),
    defaultValues: {
      title: '',
      description: '',
      amountPerPerson: '',
      deadline: undefined,
      recipientUserIds: [],
      relatedScrimmageId: null,
      relatedConversationId: null,
    },
  });

  // Check if user has premium access, show paywall if not
  useEffect(() => {
    if (!canAccessPremiumFeatures()) {
      setShowPremiumAlert(true);
    }
  }, [canAccessPremiumFeatures]);

  // Pre-fill form from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title');
    const amount = params.get('amount');
    const relatedScrimmageId = params.get('relatedScrimmageId');
    const recipientIds = params.get('recipientIds');

    if (title) {
      form.setValue('title', title);
    }
    if (amount) {
      form.setValue('amountPerPerson', amount);
    }
    if (relatedScrimmageId) {
      form.setValue('relatedScrimmageId', relatedScrimmageId);
    }
    if (recipientIds) {
      const ids = recipientIds.split(',');
      setSelectedRecipientIds(ids);
      form.setValue('recipientUserIds', ids);
    }
  }, []);

  // Fetch user's leagues to get league members
  const { data: userLeagues = [], isLoading: leaguesLoading } = useQuery({
    queryKey: ['/api/user/leagues'],
  });

  // Fetch league members for the selected league
  const selectedLeague = (userLeagues as any[])?.[0]; // Use first league for now
  const { data: leagueMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague?.id}/members-for-scrimmage`],
    enabled: !!selectedLeague?.id,
  });

  // Filter members based on search term
  const filteredMembers = (leagueMembers as any[]).filter((member: any) => 
    `${member.user.firstName} ${member.user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createPaymentRequestMutation = useMutation({
    mutationFn: async (data: CreatePaymentRequestForm) => {
      if (!selectedLeague?.id) {
        throw new Error('No league available. Please join a league first.');
      }

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
      setPageTransitionDirection('down');
      navigate('/payment-requests');
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
    if (selectedRecipientIds.length === 0) {
      form.setError('recipientUserIds', {
        type: 'required',
        message: 'Please select at least one recipient'
      });
      return;
    }

    const formData = { 
      ...data, 
      recipientUserIds: selectedRecipientIds 
    };
    createPaymentRequestMutation.mutate(formData);
  };

  const toggleRecipientSelection = (memberId: string) => {
    const newSelection = selectedRecipientIds.includes(memberId) 
      ? selectedRecipientIds.filter(id => id !== memberId)
      : [...selectedRecipientIds, memberId];
    
    setSelectedRecipientIds(newSelection);
    form.setValue('recipientUserIds', newSelection);
    form.trigger('recipientUserIds');
  };

  const selectAllRecipients = () => {
    const allMemberIds = filteredMembers.map((member: any) => member.user.id);
    setSelectedRecipientIds(allMemberIds);
    form.setValue('recipientUserIds', allMemberIds);
    form.trigger('recipientUserIds');
  };

  const deselectAllRecipients = () => {
    setSelectedRecipientIds([]);
    form.setValue('recipientUserIds', []);
    form.trigger('recipientUserIds');
  };

  return (
    <div className="min-h-screen flex flex-col pb-48" data-testid="create-payment-request-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/payment-requests');
            }}
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
          <div className="bg-card rounded-xl border border-border p-6">
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
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">Select Recipients *</h2>
              </div>
              <span className="text-sm text-muted-foreground" data-testid="text-selected-count">
                {selectedRecipientIds.length} selected
              </span>
            </div>

            {!selectedLeague ? (
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
            ) : membersLoading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading league members...</p>
              </div>
            ) : (
              <>
                {/* Search Bar */}
                <div className="mb-4">
                  <Input
                    type="text"
                    placeholder="Search members..."
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
                    onClick={selectAllRecipients}
                    data-testid="button-select-all"
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAllRecipients}
                    data-testid="button-deselect-all"
                  >
                    Deselect All
                  </Button>
                </div>

                {/* Member List */}
                <ScrollArea className="h-[300px]">
                  {filteredMembers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No members found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredMembers.map((member: any) => (
                        <div
                          key={member.user.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50"
                          data-testid={`recipient-item-${member.user.id}`}
                        >
                          <Checkbox
                            checked={selectedRecipientIds.includes(member.user.id)}
                            onCheckedChange={() => toggleRecipientSelection(member.user.id)}
                            data-testid={`checkbox-recipient-${member.user.id}`}
                          />
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={getImageUrl(member.user.profileImageUrl) || ''} />
                            <AvatarFallback>
                              {member.user.firstName?.[0]}{member.user.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium" data-testid={`text-recipient-name-${member.user.id}`}>
                              {member.user.firstName} {member.user.lastName}
                            </p>
                            {(member.user.venmoUsername || member.user.cashappUsername) && (
                              <p className="text-xs text-muted-foreground">
                                {member.user.venmoUsername && (
                                  <>
                                    Venmo:{' '}
                                    <a
                                      href={`https://venmo.com/${member.user.venmoUsername.replace(/^@/, '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                      data-testid={`link-venmo-${member.user.id}`}
                                    >
                                      {member.user.venmoUsername}
                                    </a>
                                  </>
                                )}
                                {member.user.venmoUsername && member.user.cashappUsername && ' • '}
                                {member.user.cashappUsername && (
                                  <>
                                    CashApp:{' '}
                                    <a
                                      href={`https://cash.app/$${member.user.cashappUsername.replace(/^\$/, '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                      data-testid={`link-cashapp-${member.user.id}`}
                                    >
                                      {member.user.cashappUsername}
                                    </a>
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {form.formState.errors.recipientUserIds && (
                  <p className="text-sm text-destructive mt-2">{form.formState.errors.recipientUserIds.message}</p>
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
          disabled={createPaymentRequestMutation.isPending || !selectedLeague}
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
