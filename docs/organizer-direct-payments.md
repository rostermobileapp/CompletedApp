# Direct organizer card payments

## Financial policy

New payments are created **on the organizer's Standard Stripe account**, not as destination charges on RosterHockey. Account readiness requires Stripe to be responsible for payment losses, the account to pay Stripe fees, Stripe-managed requirements, a full Stripe dashboard, US country, and active card payments/payouts.

The old 5% + $0.50 RosterHockey fee does not apply to new direct payments. A permitted processing surcharge may be paid by the player; the organizer absorbs costs that cannot be passed on. Missing or unverified surcharge eligibility means **zero surcharge**, not an invented universal processing rate. A malformed operator policy stops checkout explicitly.

Full direct-payment refunds include the surcharge. Stripe may retain processing costs, borne by the organizer. Historical destination charges retain their original fee/refund/accounting rules. Never convert or delete historical Express mappings or retire their platform webhook while transactions still need reconciliation.

Standard-account organizers manage their payout settings with Stripe. The application does not promise or force the old Express weekly payout schedule.

The Payments screen always shows eligible account-level Pro/Commissioner users a **Set up Stripe** button, including when collection is disabled or onboarding has only been partially completed. Once Stripe verifies the account as ready, the card is a single line: **Stripe Confirmed** with a **Manage Stripe** button that opens the full Stripe dashboard settings, without descriptive paragraphs. Feature activation controls API actions, not setup-button visibility.

In the Natively app, both actions explicitly open the device's system browser through `openExternalURL(url, true)`, not the wrapper's default in-app browser. Stripe-hosted onboarding does not support embedded webviews. Use each newly generated account link once; never prefetch or log it. On returning to the app, the existing foreground refresh retrieves verified account readiness; leaving or returning from Stripe is not proof of completion. If the native bridge is unavailable, show an explicit error rather than silently opening the unsupported in-app browser.

## Surcharge configuration

Default: leave `ORGANIZER_DIRECT_SURCHARGE_POLICIES` unset. Organizers then cover all processing costs.

A positive surcharge requires a separately reviewed policy keyed by connected account ID. Each policy specifies `merchantCountry`, `merchantState`, explicit `customerStates`, explicit card `brands`, verified `processorRateBps` and `processorFixedCents`, `maximumSurchargeBps`, and an `approvedUntil` date within one year. Review the merchant's actual costs, applicable law, card-network notice/registration requirements and Stripe feature availability before adding a policy. Configuration is not legal approval.

The server requires a verified US credit card and matching permitted billing/merchant geography. Debit, prepaid, unknown funding and unmatched geography receive no surcharge. The fee cannot exceed the reviewed cost/rate cap, the 3% ceiling, or the payment amount limit. The player approves the server-calculated total separately. Surcharge requests alone use Stripe's `2026-03-25.preview` version with enforcement enabled; do not change subscription API versions.

## Production preparation — separate owner approval required

1. Apply only migration `0056_organizer_direct_payments.sql` after backing up/reviewing the existing schema. The guarded command is `NODE_ENV=production npx tsx scripts/apply-production-card-payments.ts --apply-direct-pilot-schema`. It preserves old records; do not rerun the initial ledger migrations on a database with transactions.
2. Complete Stripe's **Platform / sellers collect directly** profile. Keep both dedicated organizer webhook destinations: legacy platform events and connected-account events, with distinct signing secrets. Subscription webhooks stay separate.
3. The connected-account snapshot destination must include `account.updated`, `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, and `charge.dispute.created`, `updated`, `closed`, `funds_withdrawn`, `funds_reinstated`.
4. Release the code separately. With separate owner approval, set `ORGANIZER_DIRECT_ONBOARDING_LIVE_ENABLED=1` to let **every account with Player Pro access or higher**, plus the founder exception, open/resume Standard onboarding while leaving `ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED` unset. Account roles `player_pro`, `secondary_commissioner`, and `commissioner` qualify whether purchased or manually granted in Supabase; `fee_exempt` does not disqualify them and no Stripe subscription record is required. Free-tier accounts other than the founder do not qualify. Onboarding is not restricted to the collection pilot. This permits live Stripe receiving-account creation when an organizer chooses Connect Stripe, but never enables checkout or invoice/scrimmage card collection. The existing `ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED=1` runtime gate and live Stripe key are still required. The setup status returns `onboardingEnabled` separately from collection `enabled`; collection controls must continue to use `enabled`. An enabled collection switch also permits onboarding for backwards compatibility.
5. Only after production schema/webhooks/configuration are verified should an owner approve `ORGANIZER_DIRECT_PAYMENTS_LIVE_ENABLED=1`. Collection remains restricted to the U00001/U00002 organizer-and-payer pilot even though all organizers with account-level Pro access may onboard.
6. Organizers complete new Standard onboarding; old Express accounts are not reused or converted. Verify the actual controller responsibility, capabilities and payout readiness before any owner-approved real payment. No automated live charges.

## Verification

- Unit tests cover responsibility checks, pilot restrictions, fee caps, non-credit exclusions and existing refund/dispute rules.
- `scripts/verify-direct-card-payments.ts` uses isolated development PostgreSQL plus deterministic Stripe fixtures to verify scoped settlement, replay protection, concurrent/idempotent confirmation, refunds, disputes, policy changes, private quote columns and reporting. It makes no Stripe requests.
- `scripts/verify-development-direct-onboarding.ts` creates/reuses the synthetic organizer's **Stripe TEST** Standard account and verifies controller responsibility. It creates no charges.
- `scripts/verify-direct-checkout-ui.ts` uses signed-in iOS/Android browser fixtures for separate total approval, surcharge/no-surcharge displays, interrupted confirmation recovery and webhook-driven invoice refresh.

Actual Standard-account card settlement, positive-surcharge Stripe feature access and installed-device bank-app switching are **not established by these fixture checks**. Complete real Stripe TEST onboarding/settlement and physical-device testing before claiming those paths are verified.

## Unlinking Stripe inside the app

On Payments, open the **Manage Stripe** dropdown (or **Set up Stripe** for a partially configured connection), select **Unlink Stripe**, and confirm. This revokes RosterHockey's access through Stripe OAuth deauthorization; it never closes or deletes the organizer's Standard account, its balance, transaction history, or RosterHockey payment records. Past payments and future refunds/disputes for the detached account must be managed directly in Stripe. A downgraded user can still unlink their existing connection.

Known processing payments, refunds in progress, and unresolved disputes block unlinking. Unconfirmed quotes are cancelled, and existing organizer-owned invoice/scrimmage card flags are disabled without changing paid status or roster membership. An account-row lock coordinates checkout/refund reservation and unlinking. A persisted unlink-in-progress marker blocks new checkout/onboarding before the external Stripe request; uncertain failures remain paused and offer **Retry unlink**. Reconnection uses a fresh account-creation key, preserves the historical account registry, and does not silently re-enable old invoices.

Release prerequisites, requiring separate production approval:

1. Apply only `0057_organizer_stripe_unlink.sql` with `NODE_ENV=production npx tsx scripts/apply-production-card-payments.ts --apply-unlink-schema`. This adds one nullable state column; it does not unlink any account or enable collection. For an already initialized isolated development project, use `NODE_ENV=development npx tsx scripts/apply-development-direct-payments.ts --unlink-only`.
2. Configure `STRIPE_CONNECT_CLIENT_ID` on the live Railway service with the platform's **live Connect client ID**, starting with `ca_`, from Stripe's Connect OAuth settings. This is an application identifier, not a secret API key. Use the separate `TESTING_STRIPE_CONNECT_CLIENT_ID` for isolated Stripe TEST operations. Never substitute an API key or guess the ID. Missing configuration fails explicitly, without local unlinking or falsely claiming revocation.
3. Publish the code separately. The existing production runtime/key guards remain in place; unlinking does not require collection activation or a current Pro subscription.

`scripts/verify-stripe-unlink.ts` validates the actual SQL, migration, account-lock race, durable pause, reconnection, and retained history on a disposable local PostgreSQL server with deterministic Stripe fixtures. `scripts/verify-stripe-unlink-ui.ts` uses the actual card/dialog source to test the compact menu, cancel/confirm behavior, and return to setup at 320px, 402px, and desktop widths. These checks make no Stripe requests or production writes and do not establish real Stripe revocation.
