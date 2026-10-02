/** Bind a request to the account that started it, before any provider lookup. */
export function assertNativeBillingRequestAccount(
  userId: string, body: { expectedUserId?: unknown },
): void {
  if (body.expectedUserId !== undefined && body.expectedUserId !== userId) {
    throw Object.assign(new Error('Your signed-in account changed. Reopen Subscription on the purchasing account.'), { status: 409 });
  }
}