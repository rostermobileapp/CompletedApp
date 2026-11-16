---
name: Scrimmage and league-fee card payments
description: Organizer-to-player fee collection is transaction-only and must not alter subscription tier.
---

Organizer card collection for scrimmage charges and league fees is a separate transaction flow. A verified full Stripe payment must automatically mark the linked recipient paid in the existing invoice tracking so the organizer sees the settled status; pending, failed, or cancelled attempts must not. A successful, failed, or refunded fee payment, or Connect onboarding, must never promote or downgrade a RosterHockey account or update subscription access. Player Pro or higher is only an organizer eligibility gate; a payer's card purchase is not a subscription event.

**Why:** The owner clarified that this feature supports scrimmage setup and league-fee collection, that successful Stripe payments must synchronize to the existing invoice paid indicator, and that these transactions do not change anyone's account subscription tier.

**How to apply:** On a signature-verified, idempotent full-payment event, atomically update the separate card transaction and the existing recipient paid status/method/timestamp. Keep payment webhooks, refund logic, Connect state, and subscription/RevenueCat/Store billing paths isolated. Never infer entitlement from payment settlement.
