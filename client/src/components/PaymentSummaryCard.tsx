import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowUpRight } from 'lucide-react';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  STATUS_THEME,
  formatMoney,
  getDueLine,
  computePaymentStatus,
  type PaymentStatus,
} from '@/lib/paymentStatus';

interface PaymentSummaryCardProps {
  request: any;
  isCreator: boolean;
  clickable?: boolean;
}

export function PaymentSummaryCard({ request, isCreator, clickable = true }: PaymentSummaryCardProps) {
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
  const status: PaymentStatus = computePaymentStatus(recipients, deadline);
  const theme = STATUS_THEME[status];

  const settledAt = useMemo(() => {
    if (status !== 'settled') return null;
    const paidDates = recipients
      .map(r => (r.paidAt ? new Date(r.paidAt).getTime() : 0))
      .filter(t => t > 0);
    if (paidDates.length === 0) return deadline;
    return new Date(Math.max(...paidDates));
  }, [status, recipients, deadline]);

  const dueLine = getDueLine(status, deadline, settledAt);

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
      queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${request.id}`] });
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

  const wrapperClass = clickable
    ? 'bg-[#e2e2e2] dark:bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-4 cursor-pointer hover:border-primary transition-colors pt-[4px] pb-[4px] pl-[8px] pr-[8px]'
    : 'bg-[#e2e2e2] dark:bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-4 pt-[4px] pb-[4px] pl-[8px] pr-[8px]';

  const handleClick = clickable
    ? () => {
        setPageTransitionDirection('up');
        navigate(`/payment-requests/${request.id}`);
      }
    : undefined;

  if (!isCreator) {
    // Recipient view — show only personal status, no group aggregates
    const myRecipient = recipients[0]; // backend already filtered to only this user's row
    const isPaid = myRecipient?.isPaid ?? false;
    const recipientStatus: PaymentStatus = isPaid ? 'settled' : computePaymentStatus(recipients, deadline);
    const recipientTheme = STATUS_THEME[recipientStatus];
    const recipientDueLine = getDueLine(recipientStatus, deadline, isPaid && myRecipient?.paidAt ? new Date(myRecipient.paidAt) : null);

    return (
      <div
        className={wrapperClass}
        onClick={handleClick}
        data-testid={`payment-request-card-${request.id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-base leading-tight truncate" data-testid={`text-request-title-${request.id}`}>
              {request.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatMoney(amountPerPerson)} per player
            </p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${recipientTheme.pillBg} ${recipientTheme.pillText}`}
            data-testid={`status-pill-${request.id}`}
          >
            {isPaid ? 'Paid' : recipientTheme.pillLabel}
          </span>
        </div>

        <div className="mb-1.5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-muted-foreground">{isPaid ? 'Paid' : 'Amount Due'}</span>
            <span className="text-sm font-medium" data-testid={`text-collected-${request.id}`}>
              {formatMoney(amountPerPerson)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${recipientTheme.bar}`}
              style={{ width: isPaid ? '100%' : '0%' }}
              data-testid={`progress-bar-${request.id}`}
            />
          </div>
        </div>

        {recipientDueLine && (
          <p
            className={`text-xs ${recipientStatus === 'overdue' ? recipientTheme.text : 'text-muted-foreground'}`}
            data-testid={`text-due-line-${request.id}`}
          >
            {recipientDueLine}
          </p>
        )}
      </div>
    );
  }

  // Creator view — show full aggregate tracking
  return (
    <div
      className={wrapperClass}
      onClick={handleClick}
      data-testid={`payment-request-card-${request.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
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

      <div className="mb-1.5">
        <div className="flex items-baseline justify-between mb-1">
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

      {dueLine && (
        <p
          className={`text-xs mb-3 ${status === 'overdue' ? theme.text : 'text-muted-foreground'}`}
          data-testid={`text-due-line-${request.id}`}
        >
          {dueLine}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {recipientCount > 0 ? (
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
          ) : null}
          <span className="text-xs text-muted-foreground ml-1" data-testid={`text-paid-count-bottom-${request.id}`}>
            {paidCount} / {recipientCount} paid
          </span>
        </div>
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
        ) : showAllPaidLabel ? (
          <span className="shrink-0 text-xs text-muted-foreground" data-testid={`text-all-paid-${request.id}`}>
            All paid
          </span>
        ) : null}
      </div>
    </div>
  );
}
