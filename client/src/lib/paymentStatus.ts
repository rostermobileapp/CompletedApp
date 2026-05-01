import { format, differenceInCalendarDays } from 'date-fns';

export type PaymentStatus = 'open' | 'overdue' | 'settled';

export const STATUS_THEME: Record<PaymentStatus, {
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

export function formatMoney(value: number) {
  return value % 1 === 0
    ? `$${value.toFixed(0)}`
    : `$${value.toFixed(2)}`;
}

export function getDueLine(status: PaymentStatus, deadline: Date | null, settledAt: Date | null) {
  if (status === 'settled') {
    const date = settledAt ?? deadline;
    if (!date) return null;
    return `Closed — ${format(date, 'MMM d')}`;
  }
  if (!deadline) return 'No due date';
  if (status === 'overdue') {
    return `Overdue — was ${format(deadline, 'MMM d')}`;
  }
  const daysUntil = differenceInCalendarDays(deadline, new Date());
  if (daysUntil <= 0) return `Due today — ${format(deadline, 'MMM d')}`;
  if (daysUntil === 1) return `Due tomorrow — ${format(deadline, 'MMM d')}`;
  return `Due in ${daysUntil} days — ${format(deadline, 'MMM d')}`;
}

export function computePaymentStatus(recipients: any[], deadline: Date | null): PaymentStatus {
  const recipientCount = recipients.length;
  const paidCount = recipients.filter((r: any) => r.isPaid).length;
  const isAllPaid = recipientCount > 0 && paidCount === recipientCount;
  const isOverdue = !!deadline && deadline.getTime() < Date.now() && !isAllPaid;
  return isAllPaid ? 'settled' : isOverdue ? 'overdue' : 'open';
}
