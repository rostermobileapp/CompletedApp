/**
 * Payment pages can stay mounted while Stripe or a bank opens another browser.
 * Coalesce the foreground signals; never treat them as proof of payment.
 */
export function subscribeToPaymentResume(
  windowTarget: EventTarget,
  documentTarget: EventTarget & { visibilityState: string },
  refresh: () => void | Promise<unknown>,
  delayMs = 150,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (documentTarget.visibilityState !== 'visible') return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (documentTarget.visibilityState !== 'visible') return;
      Promise.resolve().then(refresh).catch(() => {
        // Query errors remain available through React Query. Do not log URLs,
        // checkout secrets or the native bridge's potentially sensitive error.
        console.warn('[PaymentReturnRefresh] Could not refresh payment status');
      });
    }, delayMs);
  };
  windowTarget.addEventListener('focus', schedule);
  windowTarget.addEventListener('pageshow', schedule);
  documentTarget.addEventListener('visibilitychange', schedule);
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    windowTarget.removeEventListener('focus', schedule);
    windowTarget.removeEventListener('pageshow', schedule);
    documentTarget.removeEventListener('visibilitychange', schedule);
  };
}

interface CardPaymentState {
  id: string;
  recipientId?: string;
  payerUserId?: string;
  status: string;
  refundedAmountCents?: number;
  disputeStatus?: string | null;
}

/** Ignore ordering, receipt URLs and accounting-only updates between polls. */
export function getCardPaymentStateKey(payments: readonly CardPaymentState[]): string {
  return JSON.stringify(payments.map(payment => [
    payment.id,
    payment.recipientId,
    payment.payerUserId,
    payment.status,
    payment.refundedAmountCents,
    payment.disputeStatus,
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
