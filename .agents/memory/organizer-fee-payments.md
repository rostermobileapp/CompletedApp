---
name: Scrimmage and league-fee card payments
description: Organizer-to-player fee collection is transaction-only and must not alter subscription tier.
---

Organizer card collection for scrimmage charges and league fees is a separate transaction flow. A successful, failed, or refunded fee payment, or Connect onboarding, must never promote or downgrade a RosterHockey account or update subscription access. Player Pro or higher is only an organizer eligibility gate; a payer's card purchase is not a subscription event.

**Why:** The owner clarified that this payment feature is for scrimmage setup and league-fee collection, and does not change anyone's account subscription tier.

**How to apply:** Keep payment webhooks, refund logic, Connect state, and subscription/RevenueCat/Store billing paths isolated. Never infer entitlement from payment settlement.
