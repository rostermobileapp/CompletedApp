import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, ArrowUpRight, DollarSign, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  STATUS_THEME,
  formatMoney,
  getDueLine,
  computePaymentStatus,
  type PaymentStatus,
} from '@/lib/paymentStatus';

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

  const remindMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/payment-requests/${id}/remind-unpaid`);
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

  const request = paymentRequest as any;
  const recipients: any[] = Array.isArray(request?.recipients) ? request.recipients : [];

  const status: PaymentStatus = useMemo(() => {
    const deadline = request?.deadline ? new Date(request.deadline) : null;
    return computePaymentStatus(recipients, deadline);
  }, [recipients, request?.deadline]);

  const settledAt = useMemo(() => {
    if (status !== 'settled') return null;
    const paidDates = recipients
      .map(r => (r.paidAt ? new Date(r.paidAt).getTime() : 0))
      .filter(t => t > 0);
    if (paidDates.length === 0) {
      return request?.deadline ? new Date(request.deadline) : null;
    }
    return new Date(Math.max(...paidDates));
  }, [status, recipients, request?.deadline]);

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
  const amountPerPerson = Number(request.amountPerPerson) || 0;
  const total = amountPerPerson * totalRecipients;
  const collected = amountPerPerson * paidCount;
  const fillPct = total > 0 ? Math.min(100, Math.round((collected / total) * 100)) : 0;

  const deadline = request.deadline ? new Date(request.deadline) : null;
  const dueLine = getDueLine(status, deadline, settledAt);
  const theme = STATUS_THEME[status];

  const unpaidRegisteredCount = recipients.filter((r: any) => !r.isPaid && r.userId).length;
  const showRemindButton = isCreator && status !== 'settled' && unpaidRegisteredCount > 0;

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
            {showRemindButton && (
              <button
                type="button"
                onClick={() => {
                  if (!remindMutation.isPending) remindMutation.mutate();
                }}
                disabled={remindMutation.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--hairline))] px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-60"
                data-testid="button-remind-unpaid"
              >
                {remindMutation.isPending ? 'Sending…' : 'Remind unpaid'}
                <ArrowUpRight className="w-3 h-3" />
              </button>
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

        {/* Payment Summary Card — same visual language as the list cards */}
        <div className="bg-[#e2e2e2] dark:bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-4 mb-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <h1 className="font-semibold text-base leading-tight truncate" data-testid="text-request-title">
                {request.title}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatMoney(amountPerPerson)} per player
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-xs text-muted-foreground" data-testid="text-paid-count">
                {paidCount} / {totalRecipients} paid
              </span>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${theme.pillBg} ${theme.pillText}`}
                data-testid="status-pill"
              >
                {theme.pillLabel}
              </span>
            </div>
          </div>

          <div className="mb-1.5">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-muted-foreground">Collected</span>
              <span className="text-sm font-medium" data-testid="text-collected">
                {formatMoney(collected)} of {formatMoney(total)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${theme.bar}`}
                style={{ width: `${fillPct}%` }}
                data-testid="progress-bar"
              />
            </div>
          </div>

          {dueLine && (
            <p
              className={`text-xs mb-3 ${status === 'overdue' ? theme.text : 'text-muted-foreground'}`}
              data-testid="text-due-line"
            >
              {dueLine}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {totalRecipients > 0 ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {recipients.slice(0, 12).map((recipient: any, i: number) => (
                    <span
                      key={recipient.id ?? i}
                      className={`block w-2 h-2 rounded-full ${
                        recipient.isPaid ? theme.dot : 'bg-black/15 dark:bg-white/15'
                      }`}
                    />
                  ))}
                  {totalRecipients > 12 && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      +{totalRecipients - 12}
                    </span>
                  )}
                </div>
              ) : null}
              <span className="text-xs text-muted-foreground ml-1">
                {paidCount} / {totalRecipients} paid
              </span>
            </div>
            {isCreator && status !== 'settled' && unpaidRegisteredCount > 0 ? (
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
            ) : isCreator && status === 'settled' ? (
              <span className="shrink-0 text-xs text-muted-foreground" data-testid={`text-all-paid-${request.id}`}>
                All paid
              </span>
            ) : null}
          </div>
        </div>

        {/* Recipients List */}
        <div className="bg-[#e2e2e2] dark:bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" data-testid="text-recipients-title">
              Recipients
            </h2>
            <span className="text-xs text-muted-foreground">
              {paidCount} / {totalRecipients} paid
            </span>
          </div>

          <div className="space-y-2">
            {recipients.map((recipient: any) => {
              const isMe = recipient.userId === (user as any)?.id;
              const canUpdate = isCreator || isMe;
              const recipientTheme = recipient.isPaid ? STATUS_THEME.settled : theme;

              return (
                <div
                  key={recipient.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[hsl(var(--hairline))] bg-background/40 dark:bg-background/20"
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
