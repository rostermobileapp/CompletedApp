---
name: Scrimmage and league-fee card payments
description: Organizer-to-player fee collection is transaction-only and must not alter subscription tier.
---

Receiving-account onboarding must be independently available before live payment collection is enabled, with separate production approval.

**Why:** Tying Stripe setup visibility to the collection switch prevented the pilot organizers from completing the prerequisites while charges were intentionally disabled.

**How to apply:** Keep onboarding permission distinct from collection permission in both server responses and UI. Preparing a fix is not permission to publish, enable live onboarding, create live accounts, or charge cards. Preserve the collection pilot allowlist and existing runtime/key checks.

Every user with account-level Player Pro access or higher must be able to see and access Stripe receiving-account onboarding, not only paying subscribers or the two collection-pilot users. Retain the founder exception.

**Why:** The owner clarified that “Any account that has the player pro access should be able to use stripe,” including manually granting Player Pro in Supabase.

**How to apply:** Gate organizer eligibility by account-level Pro-or-higher role, regardless of subscription purchase or fee exemption; never require a billing record for manually granted access. This does not authorize publishing, enabling charges, or broadening the collection pilot.

The owner requires the Platform model: organizers collect payments directly, rather than RosterHockey creating marketplace/destination charges for them.

**Why:** After being told that the destination-charge platform balance bears processing fees, refunds and chargebacks, the owner rejected that responsibility and explicitly requested a change to Platform.

**How to apply:** Direct charges alone do not remove platform responsibility for an Express account's negative balance. Use an account configuration where Stripe handles connected-account negative-balance responsibility, and disclose the organizer onboarding requirements. Confirm processing-fee allocation before changing any player total, organizer proceeds, or platform fee. Preserve old transactions and their original accounting; never silently convert existing Express accounts.

The owner chose players to cover additional processing costs when moving to direct organizer collection.

**Why:** When explicitly asked who should cover Stripe processing fees, the owner selected “Players cover additional costs,” rather than reducing organizer proceeds or using RosterHockey's service fee.

**How to apply:** Disclose additional costs before authorization, but do not treat this as permission for an unrestricted card surcharge or a guarantee that all Stripe costs can legally be passed on. Apply card-type, jurisdiction, cost and refund restrictions. The owner subsequently chose **organizers absorb uncovered costs**, including when no surcharge is permitted or verified. Never silently transfer that shortfall to RosterHockey. The old 5% + $0.50 service fee is not automatically approved for the new direct model; a processing-cost surcharge is not RosterHockey revenue.

For historical destination-charge transactions only, organizer-initiated refunds return the invoice base amount and reverse that same amount from the organizer. The old service fee stays with RosterHockey. This is not the refund rule for new direct payments, whose processing surcharge must also be returned.

**Why:** The owner explicitly clarified: “the player should only get $20 back. The organizer gets reversed $20 and RosterHockey Keeps the difference.” For a $20 invoice plus $1.50 fee, refund $20, reverse $20, retain $1.50; the organizer nets zero.

**How to apply:** Disclose the non-refundable fee before payment and in refund confirmation. Treat refunding the full invoice base as a completed invoice refund, even though Stripe calls it a partial charge refund. Reporting must use actual refunded money, not the original charge total.

A confirmed Pay-to-Play invoice refund clears payment confirmation, releases the refunded player's upcoming roster spot, and uses normal ranked-backup promotion. Other join modes and historical attendance must remain intact.

**Why:** The owner explicitly approved “Release spot” after sandbox testing showed that refunded players still occupied approved roster spots.

**How to apply:** Release only on the first verified completed invoice refund, under the scrimmage payment locks. A late event for an old refunded transaction must never remove a later RSVP or undo repayment. Run normal backup promotion after committing the release and refresh the organizer, refunded player and promoted backup.

Organizer card collection for scrimmage charges and league fees is a separate transaction flow. A verified full Stripe payment must automatically mark the linked recipient paid in the existing invoice tracking so the organizer sees the settled status; pending, failed, or cancelled attempts must not. A successful, failed, or refunded fee payment, or Connect onboarding, must never promote or downgrade a RosterHockey account or update subscription access. Player Pro or higher is only an organizer eligibility gate; a payer's card purchase is not a subscription event.

**Why:** The owner clarified that this feature supports scrimmage setup and league-fee collection, that successful Stripe payments must synchronize to the existing invoice paid indicator, and that these transactions do not change anyone's account subscription tier.

**How to apply:** On a signature-verified, idempotent full-payment event, atomically update the separate card transaction and the existing recipient paid status/method/timestamp. Keep payment webhooks, refund logic, Connect state, and subscription/RevenueCat/Store billing paths isolated. Never infer entitlement from payment settlement.

There is no existing desktop Stripe Connect flow or pre-existing organizer account mapping to migrate.

**Why:** The owner explicitly clarified that they do not have a Connect flow yet; the earlier brief's claim that desktop organizers were already connected was incorrect.

**How to apply:** Build first-time onboarding rather than waiting for an external flow. Reuse any accounts created by this new flow on retries; do not interpret the old brief as evidence of existing connected accounts.

Organizer-fee development uses the owner's separate nonproduction Supabase project and Stripe TEST mode. The live-data Replit preview is not a payment-test environment. Production migrations, configuration changes, live charges, and publishing require separate approval.

**Why:** The owner selected a free Supabase organization and separate development project specifically to isolate this payment work from live users and billing.

**How to apply:** Verify the development database and Supabase API identify the same nonproduction project before writes. Keep payment collection disabled in the live-data preview.

The owner authorized a production pilot with **real charges**, restricted to U00001 and U00002 on both the organizer and payer sides. This does not authorize creating real charges as automated tests or changing subscription tiers.

**Why:** After reviewing the native-return limitations, the owner explicitly requested production availability for exactly these two accounts and selected real charges rather than Stripe TEST.

**How to apply:** Enforce the restriction against server-loaded account IDs, not client claims or hidden buttons alone. Preserve normal payment methods for everyone else. Production readiness must cover its own schema, live keys and dedicated webhooks; preview and automated payment tests must remain isolated.

U00001 has a founder-only exception to the paid-organizer eligibility rule for collecting organizer payments.

**Why:** The owner explicitly revised the initial eligibility decision: U00001 must also be able to receive payments and participate in this feature in the future.

**How to apply:** Authorize U00001 for collection using its server-loaded display ID without changing its fee-exempt status, role, or subscription. Everyone else needs account-level Player Pro access or higher, including manual grants. Stripe receiving-account verification and the separate collection pilot allowlist still apply.

Sandbox scrimmage payment tests must leave outbound-delivery restrictions enabled. Their synthetic invitation fixtures may represent already-delivered invitations; payment testing must not claim to verify invitation delivery.

**Why:** Scrimmage RSVP is intentionally inaccessible until invitation delivery is recorded, even for approved league members. Development blocks the real push/email delivery needed to reach that state, so an otherwise valid payment fixture fails before checkout.

**How to apply:** Scope any invitation-state setup to a newly created, explicitly synthetic scrimmage owned by a synthetic organizer. Then use normal authenticated RSVP, checkout, confirmation and refund APIs. Never loosen live-delivery guards or authentication to make a sandbox payment check pass.

Destination-charge payment events and connected-account lifecycle events require distinct webhook scopes and signing secrets.

**Why:** Destination charges belong to the platform Stripe account, whereas `account.updated` belongs to the connected-account event scope. A connected-accounts-only webhook will not settle platform destination-charge invoices.

**How to apply:** Configure separate platform-payment and connected-account snapshot destinations; verify mode, signature, and event scope independently. An enabled destination with the correct event name does not prove delivery from connected accounts: inspect account-scoped Stripe events and the receiving app's processed-event records. Never reuse the subscription webhook for organizer payments.

Webhook delivery probes must identify a newly generated event, not merely find an existing event of the right type.

**Why:** Editing an Express account's business-profile description did not consistently emit `account.updated`; old events remained in its history and made the diagnostic output misleading. A changed test metadata value generated a fresh event that the app processed successfully.

**How to apply:** In isolated tests, change a synthetic account's metadata value, match the resulting event's request ID to the Stripe update response, and verify that exact event ID was processed by the app. Do not infer success or a routing failure from an unrelated historical event.

Destination-charge transfers are gross, while organizer proceeds are net of the application fee. A full refund with `reverse_transfer=true` and `refund_application_fee=false` debits the gross transfer and leaves the organizer bearing the retained service fee.

**Why:** Stripe's actual sandbox ledger showed a $21.50 transfer, a $1.50 application fee, and $20 organizer proceeds. Refunding the full $21.50 reversed $21.50 while the $1.50 fee remained unrefunded; treating the reversal as $20 misreported the organizer balance.

**How to apply:** Reconcile against Stripe's actual transfer, application fee, balance transaction and reversal amounts. Keep gross transfer movements separate from organizer proceeds; the invoice base is not Stripe's gross transfer. Disclose who bears a retained service fee in refund confirmation, and obtain approval before changing that financial policy.

Payment success can precede final destination-transfer, application-fee and balance-transaction details.

**Why:** Genuine payment-success webhooks initially returned missing accounting fields, which appeared on subsequent charge retrievals. Recording those nulls as final produced incomplete reporting despite successful invoice settlement.

**How to apply:** Retrieve the expanded charge and allow a short, bounded accounting-finalization wait. If details are still unavailable, return a retryable failure rather than inventing fee or reversal amounts.

Stripe can replay a cached HTTP 400 saying Connect is not registered even after Connect has been enabled.

**Why:** A sandbox activation succeeded, but retries with the same account-creation idempotency key continued returning the earlier error with `idempotent-replayed: true`. A fresh key after the definitive rejection allowed onboarding.

**How to apply:** Check whether a prerequisite error is a replay before asking the owner to repeat dashboard setup. Only release a key after a definitive no-account-created rejection; retain it after timeouts, transport failures, or uncertain server errors.

Dispute notifications are not ordered, and finalization must protect a later replacement payment as well as the disputed transaction.

**Why:** Genuine sandbox checks reproduced a won dispute reopening after a late creation notification. A lost-case replay check also initially undid a later manual repayment; checking the dispute outcome alone was insufficient protection.

**How to apply:** Read Stripe's current dispute and verify its charge/PaymentIntent association. Keep won/lost outcomes final for the same dispute under the database lock, and make repeated terminal notifications no-ops for invoice payment flags. Protect replacement manual payments and newer card transactions in the recipient-update SQL itself. If a dispute arrives before its payment can be linked, return a retryable failure instead of acknowledging and dropping it.

Winning a dispute does not guarantee that Stripe returns the dispute fee. Processing fees alone are not the platform's full costs.

**Why:** The actual sandbox balance entries retained a $15 fee even for won disputes. Reporting only service fees less card processing incorrectly implied a profit while the platform had lost money.

**How to apply:** Reconcile platform net to independent Stripe balance entries, including dispute fees and principal withdrawals/reinstatements. Track gross transfers, net organizer proceeds and retained application fees separately. Preserve unknown accounting as unreconciled, and refresh dispute accounting on funds-withdrawn/reinstated events without letting an older, shorter balance-entry list overwrite a more complete one. Do not infer financial costs from the dispute outcome alone.

Checkout-return verification must cover a still-mounted screen, not just a cold page reload.

**Why:** Browser fixtures using both native user-agent variants reproduced paid card history alongside an invoice still cached as unpaid after foreground events. An organizer setup fixture similarly retained an outdated incomplete status. Cold reloads hid both refresh gaps.

**How to apply:** Verify authoritative invoice flags and organizer readiness after warm resume as well as delayed webhook settlement. A return URL or embedded completion callback must never grant paid status. Keep browser-fixture results separate from actual installed-wrapper, bank-app switching, and OS link-association checks.
