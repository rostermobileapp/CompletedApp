---
name: Scrimmage and league-fee card payments
description: Organizer-to-player fee collection is transaction-only and must not alter subscription tier.
---

Organizer card collection for scrimmage charges and league fees is a separate transaction flow. A verified full Stripe payment must automatically mark the linked recipient paid in the existing invoice tracking so the organizer sees the settled status; pending, failed, or cancelled attempts must not. A successful, failed, or refunded fee payment, or Connect onboarding, must never promote or downgrade a RosterHockey account or update subscription access. Player Pro or higher is only an organizer eligibility gate; a payer's card purchase is not a subscription event.

**Why:** The owner clarified that this feature supports scrimmage setup and league-fee collection, that successful Stripe payments must synchronize to the existing invoice paid indicator, and that these transactions do not change anyone's account subscription tier.

**How to apply:** On a signature-verified, idempotent full-payment event, atomically update the separate card transaction and the existing recipient paid status/method/timestamp. Keep payment webhooks, refund logic, Connect state, and subscription/RevenueCat/Store billing paths isolated. Never infer entitlement from payment settlement.

There is no existing desktop Stripe Connect flow or pre-existing organizer account mapping to migrate.

**Why:** The owner explicitly clarified that they do not have a Connect flow yet; the earlier brief's claim that desktop organizers were already connected was incorrect.

**How to apply:** Build first-time onboarding rather than waiting for an external flow. Reuse any accounts created by this new flow on retries; do not interpret the old brief as evidence of existing connected accounts.
