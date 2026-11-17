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

Organizer-fee development uses the owner's separate nonproduction Supabase project and Stripe TEST mode. The live-data Replit preview is not a payment-test environment. Production migrations, configuration changes, live charges, and publishing require separate approval.

**Why:** The owner selected a free Supabase organization and separate development project specifically to isolate this payment work from live users and billing.

**How to apply:** Verify the development database and Supabase API identify the same nonproduction project before writes. Keep payment collection disabled in the live-data preview.

Destination-charge payment events and connected-account lifecycle events require distinct webhook scopes and signing secrets.

**Why:** Destination charges belong to the platform Stripe account, whereas `account.updated` belongs to the connected-account event scope. A connected-accounts-only webhook will not settle platform destination-charge invoices.

**How to apply:** Configure separate platform-payment and connected-account snapshot destinations; verify mode, signature, and event scope independently. An enabled destination with the correct event name does not prove delivery from connected accounts: inspect account-scoped Stripe events and the receiving app's processed-event records. Never reuse the subscription webhook for organizer payments.

Webhook delivery probes must identify a newly generated event, not merely find an existing event of the right type.

**Why:** Editing an Express account's business-profile description did not consistently emit `account.updated`; old events remained in its history and made the diagnostic output misleading. A changed test metadata value generated a fresh event that the app processed successfully.

**How to apply:** In isolated tests, change a synthetic account's metadata value, match the resulting event's request ID to the Stripe update response, and verify that exact event ID was processed by the app. Do not infer success or a routing failure from an unrelated historical event.

Stripe can replay a cached HTTP 400 saying Connect is not registered even after Connect has been enabled.

**Why:** A sandbox activation succeeded, but retries with the same account-creation idempotency key continued returning the earlier error with `idempotent-replayed: true`. A fresh key after the definitive rejection allowed onboarding.

**How to apply:** Check whether a prerequisite error is a replay before asking the owner to repeat dashboard setup. Only release a key after a definitive no-account-created rejection; retain it after timeouts, transport failures, or uncertain server errors.
