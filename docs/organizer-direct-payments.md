# Direct organizer card payments

## Financial policy

New payments are created **on the organizer's Standard Stripe account**, not as destination charges on RosterHockey. Account readiness requires Stripe to be responsible for payment losses, the account to pay Stripe fees, Stripe-managed requirements, a full Stripe dashboard, US country, and active card payments/payouts.

The old 5% + $0.50 RosterHockey fee does not apply to new direct payments. A permitted processing surcharge may be paid by the player; the organizer absorbs costs that cannot be passed on. Missing or unverified surcharge eligibility means **zero surcharge**, not an invented universal processing rate. A malformed operator policy stops checkout explicitly.

Full direct-payment refunds include the surcharge. Stripe may retain processing costs, borne by the organizer. Historical destination charges retain their original fee/refund/accounting rules. Never convert or delete historical Express mappings or retire their platform webhook while transactions still need reconciliation.

Standard-account organizers manage their payout settings with Stripe. The application does not promise or force the old Express weekly payout schedule.

## Surcharge configuration

Default: leave `ORGANIZER_DIRECT_SURCHARGE_POLICIES` unset. Organizers then cover all processing costs.

A positive surcharge requires a separately reviewed policy keyed by connected account ID. Each policy specifies `merchantCountry`, `merchantState`, explicit `customerStates`, explicit card `brands`, verified `processorRateBps` and `processorFixedCents`, `maximumSurchargeBps`, and an `approvedUntil` date within one year. Review the merchant's actual costs, applicable law, card-network notice/registration requirements and Stripe feature availability before adding a policy. Configuration is not legal approval.

The server requires a verified US credit card and matching permitted billing/merchant geography. Debit, prepaid, unknown funding and unmatched geography receive no surcharge. The fee cannot exceed the reviewed cost/rate cap, the 3% ceiling, or the payment amount limit. The player approves the server-calculated total separately. Surcharge requests alone use Stripe's `2026-03-25.preview` version with enforcement enabled; do not change subscription API versions.

## Production preparation — separate owner approval required

1. Apply only migration `0056_organizer_direct_payments.sql` after backing up/reviewing the existing schema. The guarded command is `NODE_ENV=production npx tsx scripts/apply-production-card-payments.ts --apply-direct-pilot-schema`. It preserves old records; do not rerun the initial ledger migrations on a database with transactions.
2. Complete Stripe's **Platform / sellers collect directly** profile. Keep both dedicated organizer webhook destinations: legacy platform events and connected-account events, with distinct signing secrets. Subscription webhooks stay separate.
3. The connected-account snapshot destination must include `account.updated`, `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, and `charge.dispute.created`, `updated`, `closed`, `funds_withdrawn`, `funds_reinstated`.
4. Release the code separately. Only after production schema/webhooks/configuration are verified should an owner approve `ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED=1`. The existing organizer-payments runtime gate must also be enabled. This does not broaden the U00001/U00002 organizer-and-payer pilot.
5. Organizers complete new Standard onboarding; old Express accounts are not reused or converted. Verify the actual controller responsibility, capabilities and payout readiness before any owner-approved real payment. No automated live charges.

## Verification

- Unit tests cover responsibility checks, pilot restrictions, fee caps, non-credit exclusions and existing refund/dispute rules.
- `scripts/verify-direct-card-payments.ts` uses isolated development PostgreSQL plus deterministic Stripe fixtures to verify scoped settlement, replay protection, concurrent/idempotent confirmation, refunds, disputes, policy changes, private quote columns and reporting. It makes no Stripe requests.
- `scripts/verify-development-direct-onboarding.ts` creates/reuses the synthetic organizer's **Stripe TEST** Standard account and verifies controller responsibility. It creates no charges.
- `scripts/verify-direct-checkout-ui.ts` uses signed-in iOS/Android browser fixtures for separate total approval, surcharge/no-surcharge displays, interrupted confirmation recovery and webhook-driven invoice refresh.

Actual Standard-account card settlement, positive-surcharge Stripe feature access and installed-device bank-app switching are **not established by these fixture checks**. Complete real Stripe TEST onboarding/settlement and physical-device testing before claiming those paths are verified.
