import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, DollarSign, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { PaymentSummaryCard } from '@/components/PaymentSummaryCard';
import {
  STATUS_THEME,
  computePaymentStatus,
  type PaymentStatus,
} from '@/lib/paymentStatus';
import { resolveVenmoLink, resolveCashAppLink } from '@/lib/paymentLinks';
import { SiVenmo, SiCashapp } from 'react-icons/si';

export default function PaymentRequestDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: paymentRequest, isLoading } = useQuery({
    queryKey: [`/api/payment-requests/${id}`],
    enabled: !!id,
  });

  const updateRecipientMutation = useMutation({
    mutationFn: async ({ recipientId, isPaid, paymentMethod }: { recipientId: string; isPaid: boolean; paymentMethod?: string }) => {
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
    onError: () => {
      toast({ title: 'Failed to update payment status', variant: 'destructive' });
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
  const myRecipient = recipients.find((r: any) => r.userId === (user as any)?.id);
  const totalRecipients = recipients.length;
  const paidCount = recipients.filter((r: any) => r.isPaid).length;
  const theme = STATUS_THEME[status];

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
          <PaymentSummaryCard request={request} isCreator={isCreator} clickable={false} />
        </div>

        {/* Pay-the-creator card — uses the per-invoice override if set,
            otherwise falls back to the creator's profile-level handle. Hidden
            entirely when neither is configured. */}
        {(() => {
          const creator = request.creator ?? {};
          const venmoUrl = resolveVenmoLink(request.venmoLinkOverride, creator.venmoUsername);
          const cashappUrl = resolveCashAppLink(request.cashappLinkOverride, creator.cashappUsername);
          if (!venmoUrl && !cashappUrl) return null;
          const creatorName = `${creator.firstName ?? ''} ${creator.lastName ?? ''}`.trim() || 'the organizer';
          const usingVenmoOverride = !!request.venmoLinkOverride;
          const usingCashappOverride = !!request.cashappLinkOverride;
          return (
            <div
              className="mb-6 bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-5"
              data-testid="card-pay-creator"
            >
              <h2 className="text-base font-semibold mb-1">
                {isCreator ? 'How recipients will pay you' : `Pay ${creatorName}`}
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                {isCreator
                  ? 'These are the links recipients will see. Set a per-invoice override to send payments somewhere else.'
                  : 'Send payment for this invoice using one of the options below.'}
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
                    {usingVenmoOverride && (
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
                    {usingCashappOverride && (
                      <span className="text-[10px] uppercase tracking-wide opacity-80">override</span>
                    )}
                  </a>
                )}
              </div>
            </div>
          );
        })()}

        {/* Recipients List */}
        <div className="bg-[#e2e2e2] dark:bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-5 pl-[4px] pr-[4px] pt-[4px] pb-[4px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" data-testid="text-recipients-title">
              {isCreator ? 'Recipients' : 'Your Status'}
            </h2>
            {isCreator && (
              <span className="text-xs text-muted-foreground">
                {paidCount} / {totalRecipients} paid
              </span>
            )}
          </div>

          <div className="space-y-2">
            {(isCreator ? recipients : recipients.filter((r: any) => r.userId === (user as any)?.id)).map((recipient: any) => {
              const isMe = recipient.userId === (user as any)?.id;
              const canUpdate = isCreator || isMe;
              const recipientTheme = recipient.isPaid ? STATUS_THEME.settled : theme;

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
                            <span className="text-xs text-muted-foreground">{recipient.paymentMethod}</span>
                          )}
                        </div>
                        {isCreator && (
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
                    ) : canUpdate ? (
                      <Select
                        onValueChange={(method) => {
                          updateRecipientMutation.mutate({
                            recipientId: recipient.id,
                            isPaid: true,
                            paymentMethod: method,
                          });
                        }}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs" data-testid={`select-payment-method-${recipient.id}`}>
                          <SelectValue placeholder="Mark Paid" />
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
    </div>
  );
}
