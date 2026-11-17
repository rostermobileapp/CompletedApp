import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { isConnectPlatformNotRegistered } from "../organizerConnectErrors";

const message = "You can only create new accounts if you've signed up for Connect, which you can do at https://dashboard.stripe.com/connect.";

test("a definitive Stripe platform registration rejection can release its cached key", () => {
  assert.equal(isConnectPlatformNotRegistered(new Stripe.errors.StripeInvalidRequestError({
    message, statusCode: 400,
  })), true);
});

test("uncertain account creation failures must retain their original idempotency key", () => {
  for (const error of [
    new Error(message),
    { type: "StripeInvalidRequestError", message, statusCode: 400 },
    new Stripe.errors.StripeConnectionError({ message }),
    new Stripe.errors.StripeAPIError({ message, statusCode: 500 }),
    new Stripe.errors.StripeInvalidRequestError({ message: "Invalid country", statusCode: 400 }),
    new Stripe.errors.StripeInvalidRequestError({ message, statusCode: 500 }),
  ]) {
    assert.equal(isConnectPlatformNotRegistered(error), false);
  }
});
