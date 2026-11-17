import Stripe from "stripe";

// Stripe caches some rejected requests under their idempotency key. Only this
// definitive pre-account rejection is safe to retry with a new key; a timeout
// or generic server error might already have created an account.
export function isConnectPlatformNotRegistered(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeInvalidRequestError
    && error.statusCode === 400
    && error.message.startsWith("You can only create new accounts if you've signed up for Connect");
}
