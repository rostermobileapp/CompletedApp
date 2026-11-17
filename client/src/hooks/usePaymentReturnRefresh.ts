import { useEffect, useRef } from 'react';
import { subscribeToPaymentResume } from '@/lib/paymentReturnRefresh';

/** Opt in only on payment screens; leave application-wide query defaults alone. */
export function usePaymentReturnRefresh(
  refresh: () => void | Promise<unknown>,
  scope: string,
) {
  const latestRefresh = useRef(refresh);
  useEffect(() => { latestRefresh.current = refresh; }, [refresh]);
  useEffect(() => subscribeToPaymentResume(
    window,
    document,
    () => latestRefresh.current(),
  ), [scope]);
}
