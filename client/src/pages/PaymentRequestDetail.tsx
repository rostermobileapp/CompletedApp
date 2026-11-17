import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, CreditCard, DollarSign, ExternalLink, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePaymentReturnRefresh } from '@/hooks/usePaymentReturnRefresh';
import { getCardPaymentStateKey } from '@/lib/paymentReturnRefresh';
import { PaymentSummaryCard } from '@/components/PaymentSummaryCard';
import {
  STATUS_THEME,
  computePaymentStatus,
  type PaymentStatus,
} from '@/lib/paymentStatus';
import { resolveVenmoLink, resolveCashAppLink } from '@/lib/paymentLinks';
import { PaymentMethodPicker, type PaymentMethod } from '@/components/PaymentMethodPicker';
import { OrganizerDirectCheckout } from '@/components/OrganizerDirectCheckout';
import { SiVenmo, SiCashapp } from 'react-icons/si';

export default function PaymentRequestDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: paymentRequest, isLoading, isFetching: invoiceFetching } = useQuery({
    queryKey: [`/api/payment-requests/${id}`],
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: cardPaymentInfo, refetch: refetchCardPaymentInfo } = useQuery<any>({
    queryKey: ['/api/organizer-card-payments/requests', id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/organizer-card-payments/requests/${id}`);
      return response.json();
    },
    enabled: !!id,
    refetchInterval: 5000,
  });

  const refreshInvoiceQueries = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${id}`] }),
    queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/unpaid-count'] }),
  ]), [id, queryClient]);

  usePaymentReturnRefresh(() => Promise.all([
    refetchCardPaymentInfo(),
    refreshInvoiceQueries(),
  ]), `${(user as any)?.id ?? ''}:${id ?? ''}`);

  const cardStateKey = cardPaymentInfo
    ? getCardPaymentStateKey(Array.isArray(cardPaymentInfo.payments) ? cardPaymentInfo.payments : [])
    : null;
  const syncedCardState = useRef<{ scope: string; key: string } | null>(null);
  useEffect(() => {
    if (!id || !paymentRequest || invoiceFetching || cardStateKey === null) return;
    const scope = `${(user as any)?.id ?? ''}:${id}`;
    const previous = syncedCardState.current;
    if (previous?.scope === scope && previous.key === cardStateKey) return;
    syncedCardState.current = { scope, key: cardStateKey };
    // Wait for any existing invoice fetch to finish before invalidating. Otherwise
    // an initial fetch begun before webhook settlement could absorb the refresh.
    if (cardStateKey !== '[]' || previous?.scope === scope) {
      void refreshInvoiceQueries();
    }
  }, [id, user?.id, paymentRequest, invoiceFetching, cardStateKey, refreshInvoiceQueries]);

  const [directCheckoutOpen, setDirectCheckoutOpen] = useState(false);
  const cardPaymentsForRefund = useRef<any[]>([]);

  const refundCardPaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest('POST', `/api/organizer-card-payments/${paymentId}/refund`, {});
      return response.json();
    },
    onSuccess: (data: any, paymentId: string) => {
      const payment = cardPaymentsForRefund.current.find((item: any) => item.id === paymentId);
      const isDirect = data?.paymentFlow === 'direct' || payment?.paymentFlow === 'direct';
      toast({
        title: 'Invoice refund requested',
        description: isDirect
          ? 'The full card payment, including the processing surcharge, will be returned. The organizer may still incur non-refundable Stripe processing costs.'
          : 'The invoice amount will be returned. The service fee is non-refundable.',
      });
      refetchCardPaymentInfo();
      queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Could not refund card payment',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateRecipientMutation = useMutation({
    mutationFn: async ({ recipientId, isPaid, paymentMethod }: { recipientId: string; isPaid: boolean; paymentMethod?: PaymentMethod | null }) => {
      const response = await apiRequest('PATCH', `/api/payment-request-recipients/${recipientId}`, {
        isPaid,
        paymentMethod,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment status updated' });
      queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
    },
    onError: (_error, variables) => {
      toast({
        title: variables?.isPaid === false ? 'Could not undo payment' : 'Failed to update payment status',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const confirmRecipientMutation = useMutation({
    mutationFn: async ({ recipientId, isConfirmed }: { recipientId: string; isConfirmed: boolean }) => {
      const response = await apiRequest('PATCH', `/api/payment-request-recipients/${recipientId}/confirm`, {
        isConfirmed,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment confirmation updated' });
      queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
    },
    onError: () => {
      toast({ title: 'Failed to update confirmation', variant: 'destructive' });
    },
  });

  const deletePaymentRequestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/payment-requests/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment request deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
      setPageTransitionDirection('down');
      navigate('/payment-requests');
    },
    onError: () => {
      toast({ title: 'Failed to delete payment request', variant: 'destructive' });
    },
  });

  const request = paymentRequest as any;
  const recipients: any[] = Array.isArray(request?.recipients) ? request.recipients : [];

  const status: PaymentStatus = useMemo(() => {
    const deadline = request?.deadline ? new Date(request.deadline) : null;
    return computePaymentStatus(recipients, deadline);
  }, [recipients, request?.deadline]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!paymentRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Payment request not found</p>
      </div>
    );
  }

  const isCreator = request.creatorId === (user as any)?.id;
  const hasOrganizerView = isCreator || request.viewerIsScrimmageOrganizer === true;
  const canManagePayments = isCreator || request.viewerCanManagePayments === true;
  const myRecipient = recipients.find((r: any) => r.userId === (user as any)?.id);
  const cardPayments: any[] = Array.isArray(cardPaymentInfo?.payments) ? cardPaymentInfo.payments : [];
  cardPaymentsForRefund.current = cardPayments;
  const isDirectCardFlow = cardPaymentInfo?.paymentFlow === 'direct';
  const myCardPayment = cardPayments.find((payment: any) => payment.payerUserId === (user as any)?.id);
  const cardPaymentInProgress = !!myCardPayment && ['pending', 'processing', 'refund_pending'].includes(myCardPayment.status);
  const canResumeCardPayment = !!myCardPayment
    && ['pending', 'processing'].includes(myCardPayment.status)
    && !myRecipient?.isPaid;
  const canStartCardPayment = cardPaymentInfo?.enabled === true
    && cardPaymentInfo.cardEnabled === true
    && cardPaymentInfo.webhookReady === true
    && !!myRecipient
    && !myRecipient.isPaid
    && !cardPaymentInProgress
    && myCardPayment?.status !== 'paid'
    && !(myCardPayment?.status === 'disputed' && !['lost', 'won'].includes(myCardPayment?.disputeStatus));
  const totalRecipients = recipients.length;
  const paidCount = recipients.filter((r: any) => r.isPaid).length;
  const theme = STATUS_THEME[status];
  const creator = request.creator ?? {};
  const creatorName = `${creator.firstName ?? ''} ${creator.lastName ?? ''}`.trim() || 'the organizer';
  const venmoUrl = resolveVenmoLink(request.venmoLinkOverride, creator.venmoUsername);
  const cashappUrl = resolveCashAppLink(request.cashappLinkOverride, creator.cashappUsername);
  const cardPaymentStatusLabel = (statusValue: string) => ({
    pending: 'Payment not started',
    processing: 'Processing',
    paid: 'Paid',
    failed: 'Failed',
    cancelled: 'Cancelled',
    refund_pending: 'Refund pending',
    refunded: 'Refunded',
    disputed: 'Disputed',
  }[statusValue] || statusValue);

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="payment-request-detail-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
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

          <div className="flex items-center gap-2">
            {isCreator && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPageTransitionDirection('up');
                  navigate(`/payment-requests/${id}/edit`);
                }}
                data-testid="button-edit"
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}
            {isCreator && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" data-testid="button-delete">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Payment Request</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this payment request? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deletePaymentRequestMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Payment Summary Card — shared component, identical to the list cards */}
        <div className="mb-6">
          <PaymentSummaryCard
            request={request}
            isCreator={hasOrganizerView}
            canManagePayments={canManagePayments}
            clickable={false}
          />
        </div>

        {/* Recipient payment-method picker. Creators keep the existing
            informational link card; recipients choose a method and confirm
            it after paying or arranging payment. */}
        {hasOrganizerView ? (
          (venmoUrl || cashappUrl) ? (
            <div
              className="mb-6 bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-5"
              data-testid="card-pay-creator"
            >
              <h2 className="text-base font-semibold mb-1">
                How recipients will pay the organizer
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                These are the links recipients will see. The payment request creator can change per-invoice overrides.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {venmoUrl && (
                  <a
                    href={venmoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#3D95CE] text-white hover:opacity-90 text-sm font-medium"
                    data-testid="link-pay-venmo"
                  >
                    <SiVenmo className="w-4 h-4" />
                    Pay with Venmo
                    {!!request.venmoLinkOverride && (
                      <span className="text-[10px] uppercase tracking-wide opacity-80">override</span>
                    )}
                  </a>
                )}
                {cashappUrl && (
                  <a
                    href={cashappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#00C244] text-white hover:opacity-90 text-sm font-medium"
                    data-testid="link-pay-cashapp"
                  >
                    <SiCashapp className="w-4 h-4" />
                    Pay with Cash App
                    {!!request.cashappLinkOverride && (
                      <span className="text-[10px] uppercase tracking-wide opacity-80">override</span>
                    )}
                  </a>
                )}
              </div>
            </div>
          ) : null
        ) : (
          <PaymentMethodPicker
            className="mb-6"
            creatorName={creatorName}
            venmoUrl={venmoUrl}
            cashappUrl={cashappUrl}
            isPaid={!!myRecipient?.isPaid}
            isConfirmed={!!myRecipient?.isConfirmed}
            paymentMethod={myRecipient?.paymentMethod}
            isPending={updateRecipientMutation.isPending}
            onUpdate={(isPaid, paymentMethod) => {
              if (!myRecipient) return;
              updateRecipientMutation.mutate({
                recipientId: myRecipient.id,
                isPaid,
                paymentMethod,
              });
            }}
          />
        )}

        {!hasOrganizerView && cardPaymentInfo?.enabled && cardPaymentInfo.cardEnabled && myRecipient && (
          <div className="mb-6 rounded-2xl border border-[hsl(var(--hairline))] bg-card p-5 shadow-[var(--elev-rest)]" data-testid="card-pay-by-card">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Pay by card</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {isDirectCardFlow ? (
                <>Invoice amount {`$${(cardPaymentInfo.baseAmountCents / 100).toFixed(2)}`}. The final card total, including any processing surcharge, is shown before you confirm.
                  {' '}If refunded, the full direct payment is returned; the organizer may still incur Stripe processing costs that are not returned.</>
              ) : (
                <>Invoice amount {`$${(cardPaymentInfo.baseAmountCents / 100).toFixed(2)}`} + service fee {`$${(cardPaymentInfo.serviceFeeCents / 100).toFixed(2)}`} = total {`$${(cardPaymentInfo.totalAmountCents / 100).toFixed(2)}`}.
                  {' '}Refunds return the invoice amount only; the service fee is non-refundable.</>
              )}
              {cardPaymentInfo.refundReleasesSpot && ' A refund also withdraws your upcoming Pay-to-Play request.'}
            </p>
            {!cardPaymentInfo.webhookReady ? (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                Card payments are temporarily unavailable until the payment webhook is ready.
              </p>
            ) : cardPaymentInProgress ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Your card payment is processing. The invoice updates after Stripe verifies it.
              </p>
            ) : myRecipient.isPaid ? (
              <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                This invoice is marked paid. Card transaction details and the receipt appear below.
              </p>
            ) : isDirectCardFlow ? (
              <Button
                className="mt-4 w-full"
                onClick={() => setDirectCheckoutOpen(true)}
                disabled={!canStartCardPayment}
                data-testid="button-pay-by-card"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Review card payment
              </Button>
            ) : (
              <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                This is a historical card payment record. New card payments are not available through this legacy checkout.
              </p>
            )}
            {isDirectCardFlow && cardPaymentInfo.webhookReady && canResumeCardPayment && (
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={() => setDirectCheckoutOpen(true)}
                disabled={!canResumeCardPayment}
                data-testid="button-resume-card-payment"
              >
                Continue existing card payment
              </Button>
            )}
            {myCardPayment?.receiptUrl && (
              <a
                href={myCardPayment.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View Stripe receipt <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {cardPaymentInfo?.enabled && cardPayments.length > 0 && (
          <section className="mb-6 rounded-2xl border border-[hsl(var(--hairline))] bg-card p-5 shadow-[var(--elev-rest)]" data-testid="card-payment-history">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <CreditCard className="h-5 w-5 text-primary" />
              Card transactions
            </h2>
            <div className="space-y-3">
              {cardPayments.map((payment: any) => {
                const recipient = recipients.find((candidate: any) => candidate.id === payment.recipientId);
                const name = recipient?.user
                  ? `${recipient.user.firstName ?? ''} ${recipient.user.lastName ?? ''}`.trim()
                  : recipient?.placeholderPlayer
                    ? `${recipient.placeholderPlayer.firstName ?? ''} ${recipient.placeholderPlayer.lastName ?? ''}`.trim()
                    : 'Invoice recipient';
                return (
                  <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--hairline))] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{name} · {cardPaymentStatusLabel(payment.status)}</p>
                      <p className="text-xs text-muted-foreground">
                        Total ${(payment.totalAmountCents / 100).toFixed(2)} · Base amount ${(payment.baseAmountCents / 100).toFixed(2)}
                        {payment.paymentFlow === 'direct'
                          ? ` · Processing surcharge $${((payment.processingSurchargeCents ?? 0) / 100).toFixed(2)}`
                          : payment.serviceFeeCents > 0 && ` · Service fee $${(payment.serviceFeeCents / 100).toFixed(2)}`}
                      </p>
                      {payment.refundedAmountCents > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Refunded ${(payment.refundedAmountCents / 100).toFixed(2)}
                        </p>
                      )}
                      {payment.disputeStatus && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Dispute status: {payment.disputeStatus}
                        </p>
                      )}
                      {payment.receiptUrl && (
                        <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          View receipt <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {canManagePayments && (payment.status === 'paid' ||
                      (payment.paymentFlow === 'direct' && payment.status === 'refund_pending' && payment.refundStatus === 'partial')) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={refundCardPaymentMutation.isPending}>
                            {payment.paymentFlow === 'direct' ? 'Refund full payment' : 'Refund invoice amount'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Refund this card payment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {payment.paymentFlow === 'direct' ? (
                                <>Stripe will return the remaining ${((payment.totalAmountCents - (payment.refundedAmountCents ?? 0)) / 100).toFixed(2)} so the full payment of ${(payment.totalAmountCents / 100).toFixed(2)}, including the ${((payment.processingSurchargeCents ?? 0) / 100).toFixed(2)} processing surcharge, is refunded. The organizer may still bear non-returned Stripe processing costs.</>
                              ) : (
                                <>Stripe will refund ${(payment.baseAmountCents / 100).toFixed(2)} to the payer
                                  and reverse ${(payment.baseAmountCents / 100).toFixed(2)} from the organizer’s
                                  Stripe balance. RosterHockey retains the ${(payment.serviceFeeCents / 100).toFixed(2)} service fee,
                                  which is non-refundable to the payer.</>
                              )}
                              {cardPaymentInfo?.refundReleasesSpot && (
                                <> For an upcoming Pay-to-Play scrimmage, this also releases the player’s
                                  roster spot and promotes the next eligible backup.</>
                              )}
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep payment</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => refundCardPaymentMutation.mutate(payment.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {payment.paymentFlow === 'direct' ? 'Refund full payment' : 'Refund invoice amount'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recipients List */}
        <div className="bg-[#e2e2e2] dark:bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-5 pl-[4px] pr-[4px] pt-[4px] pb-[4px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" data-testid="text-recipients-title">
              {hasOrganizerView ? 'Recipients' : 'Your Status'}
            </h2>
            {hasOrganizerView && (
              <span className="text-xs text-muted-foreground">
                {paidCount} / {totalRecipients} paid
              </span>
            )}
          </div>

          <div className="space-y-2">
            {(hasOrganizerView ? recipients : recipients.filter((r: any) => r.userId === (user as any)?.id)).map((recipient: any) => {
              const isMe = recipient.userId === (user as any)?.id;
              const canUpdate = canManagePayments || isMe;
              const recipientTheme = recipient.isPaid ? STATUS_THEME.settled : theme;
              const recipientCardPayment = cardPayments.find((payment: any) => payment.recipientId === recipient.id);
              const manualPaymentBlocked = !!recipientCardPayment && (
                ['pending', 'processing', 'refund_pending', 'paid'].includes(recipientCardPayment.status) ||
                (recipientCardPayment.status === 'disputed' && !['lost', 'won'].includes(recipientCardPayment.disputeStatus))
              );

              return (
                <div
                  key={recipient.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[hsl(var(--hairline))] bg-background/40 dark:bg-background/20 pl-[8px] pr-[8px] pt-[4px] pb-[4px]"
                  data-testid={`recipient-${recipient.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Paid-status dot — echoes the list paid-dot styling */}
                    <span
                      className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                        recipient.isPaid ? recipientTheme.dot : 'bg-black/20 dark:bg-white/20'
                      }`}
                      data-testid={`dot-${recipient.id}`}
                    />
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage src={getImageUrl(recipient.user?.profileImageUrl) || ''} />
                      <AvatarFallback>
                        {(recipient.user?.firstName || recipient.placeholderPlayer?.firstName)?.[0]}
                        {(recipient.user?.lastName || recipient.placeholderPlayer?.lastName)?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {recipient.user
                          ? `${recipient.user.firstName ?? ''} ${recipient.user.lastName ?? ''}`.trim()
                          : recipient.placeholderPlayer
                            ? `${recipient.placeholderPlayer.firstName} ${recipient.placeholderPlayer.lastName}`
                            : 'Unknown'}
                        {!recipient.user && recipient.placeholderPlayer && (
                          <span className="text-xs text-muted-foreground ml-2">(Placeholder)</span>
                        )}
                        {isMe && <span className="text-xs text-muted-foreground ml-2">(You)</span>}
                      </p>
                      {(recipient.user?.venmoUsername || recipient.user?.cashappUsername) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {recipient.user?.venmoUsername && (
                            <>
                              Venmo:{' '}
                              <a
                                href={`https://venmo.com/${recipient.user.venmoUsername.replace(/^@/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                data-testid={`link-venmo-${recipient.id}`}
                              >
                                {recipient.user.venmoUsername}
                              </a>
                            </>
                          )}
                          {recipient.user?.venmoUsername && recipient.user?.cashappUsername && ' • '}
                          {recipient.user?.cashappUsername && (
                            <>
                              CashApp:{' '}
                              <a
                                href={`https://cash.app/$${recipient.user.cashappUsername.replace(/^\$/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                data-testid={`link-cashapp-${recipient.id}`}
                              >
                                {recipient.user.cashappUsername}
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {recipient.isPaid ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${recipientTheme.pillBg} ${recipientTheme.pillText}`}>
                            Paid
                          </span>
                          {recipient.paymentMethod && (
                            <span className="text-xs text-muted-foreground">
                              {recipient.paymentMethod === 'stripe' ? 'Card' : recipient.paymentMethod}
                            </span>
                          )}
                        </div>
                        {canManagePayments && (
                          recipient.isConfirmed ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-emerald-600 dark:text-emerald-300 font-medium">✓ Confirmed</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => confirmRecipientMutation.mutate({ recipientId: recipient.id, isConfirmed: false })}
                                data-testid={`button-unconfirm-${recipient.id}`}
                              >
                                Unconfirm
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => confirmRecipientMutation.mutate({ recipientId: recipient.id, isConfirmed: true })}
                              data-testid={`button-confirm-${recipient.id}`}
                            >
                              Confirm Payment
                            </Button>
                          )
                        )}
                      </div>
                    ) : canManagePayments ? (
                      <Select
                        disabled={manualPaymentBlocked}
                        onValueChange={(method) => {
                          updateRecipientMutation.mutate({
                            recipientId: recipient.id,
                            isPaid: true,
                              paymentMethod: method as PaymentMethod,
                          });
                        }}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs" data-testid={`select-payment-method-${recipient.id}`}>
                          <SelectValue placeholder={manualPaymentBlocked ? 'Card processing' : 'Mark Paid'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="venmo">Venmo</SelectItem>
                          <SelectItem value="cashapp">CashApp</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${theme.pillBg} ${theme.pillText}`}>
                        {status === 'overdue' ? 'Overdue' : 'Pending'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {totalRecipients === 0 && (
              <div className="text-center py-8">
                <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No recipients on this request.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <OrganizerDirectCheckout
        key={`${(user as any)?.id ?? ''}:${id ?? ''}`}
        open={directCheckoutOpen}
        onOpenChange={setDirectCheckoutOpen}
        paymentRequestId={String(id ?? '')}
        scopeKey={String((user as any)?.id ?? '')}
        onRefresh={async () => {
          await Promise.all([refetchCardPaymentInfo(), refreshInvoiceQueries()]);
        }}
      />
    </div>
  );
}
