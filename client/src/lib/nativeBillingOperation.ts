let busy = false;
let uncertain = false;

/** Shared by both platforms, automatic checks, checkout and recovery. */
export async function withNativeBillingOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('Another native billing operation is in progress. Please wait.');
  if (uncertain) throw new Error('The native bridge did not finish its last operation. Fully close and reopen Roster before continuing. Check store subscriptions and restore before purchasing again.');
  busy = true;
  try {
    return await operation();
  } catch (error) {
    // A timeout does not cancel the native operation. A late login or payment
    // callback could otherwise race the next operation on this webview.
    if (error instanceof Error && error.message.includes('NATIVELY_TIMEOUT')) uncertain = true;
    throw error;
  } finally {
    busy = false;
  }
}

export function assertBillingAccount(expected: string | undefined, current: string | undefined): asserts expected is string {
  if (!expected || current !== expected) {
    throw new Error('Your signed-in account changed. Sign in to the purchasing account and use Restore purchases.');
  }
}