# Scoped Player Pro: implementation and rollout review

## Scope and authority

Personal verified Apple/Google subscriptions and active recognized Stripe subscriptions provide account coverage. Stripe checks are read-only, cached, time-limited and never change roles. Cancel-at-period-end stays covered to the verified paid-through time. A previously verified Stripe period can survive a temporary lookup outage, but cannot be extended by it.

Unmanaged legacy Player Pro/Commissioner roles, independent secondary-commissioner benefits, primary-commissioner and fee exemptions retain their existing access. They are explicitly classified as legacy/operational access, **not proof of a purchased personal subscription**. Historical IAP identifiers without a current claim retain only their existing legacy role coverage pending separately approved reconciliation; an identifier alone proves neither payment nor expiry. This includes ownership-only Google claim backfills (including historical Apple identifiers) whose product and expiry are both NULL. A managed expired/revoked purchase is not converted into a complimentary grant.

League seats remain separate records. Current access requires a paid grant, an inclusive UTC month window, matching grant/seat league, and approved membership. Capacity locks, assignment idempotency, purchases and role writers are unchanged. Actual team/game/conversation/scrimmage ownership determines the league; dashboard selections and supplied parent IDs cannot override it.

Coverage grants no roster membership, captain/Commissioner permissions, parent authority, merchant pilot eligibility or child capability. Existing resource authorization is still required.

Independent entitlement sources remain independent during outages: a verified league seat is checked before personal billing, and the coverage snapshot retains verified seats with an explicit personal-verification-unavailable flag. Unverified account extras fail closed, while the UI retains scoped league access and does not mislabel unknown personal coverage as Free. Basic own-team text and founder-support messaging do not perform personal billing verification.

## Application changes

- Contextual checks serve league photos, wall posts/comments, opponent statistics, odds details, scrimmages and invoice creation. Existing invoice-owner tracking remains independent of current coverage.
- Personal DMs and arbitrary groups do not inherit coverage from a league display tag. Canonical team/captain conversations can use the owning league's coverage. Basic own-team text chat and founder-support exceptions remain.
- Attachment upload requests now carry their conversation ID. The server verifies the actual participant and conversation coverage before issuing an upload URL.
- Account extras, patch artwork, ad-free/promotional display, global photo quota and merchant-account entitlement use account coverage, not selected-league coverage. Merchant pilot/provider restrictions remain independent and unchanged.
- The permission provider caches by canonical acting user and account revision, handles copied Demo identities, refreshes coverage on focus/every minute, and refuses mismatched profile snapshots. Authentication remains independent of coverage/provider availability.
- Subscription notices identify the league and league-specific teams/end month. The other-team upgrade message appears only when actual teams remain uncovered across all active seats.

## Guarded families

Child coverage resolves the payer only from an existing valid child session joined to its approving parent Auth session, current operator-controlled child registry, approved request, current consent and approved program/team. The requested team must match that proof.

The two-player limit is unchanged. Over-limit registries fail closed without truncation or deletion. Coverage itself grants no payment, DM, coaching or guardian capabilities.

The new child coverage endpoint is inside the existing isolated-DEV guard. Application child activation still defaults to **disabled**; no real child session, household or parent enrollment was activated. Completed-adult/family activation restrictions were not bypassed.

## Direct database reads

`migrations/0058_prediction_summary_column_access.sql` is **prepared, not applied to production**.

It retains the existing membership RLS policy and grants ordinary authenticated clients only the already-free prediction summary columns. Full rows, moneylines, projected scorers and other paid details are server-only, including for paid clients; paid clients obtain them through the resource-authorized API. `SELECT *` is intentionally denied to ordinary clients.

No new client access to users, grants, seats, HS tables or other default-denied tables is introduced. Prediction worker/service-role writes and the calculation Edge Function remain unchanged.

## Verification

The targeted suite passed 82 tests. A baseline comparison found no new TypeScript diagnostics; the project still has existing type errors outside this change. The anonymous preview rendered successfully. The isolated PostgreSQL test service was stopped after verification.

Targeted tests cover:

- Personal, school-seat, adult-seat and multi-seat actors; account extras; uncovered resources and mixed-league batches.
- Inclusive start/end months, overlapping grants, future/unpaid/cancelled/expired grants, removed memberships and mismatched seat/grant leagues.
- Real Express callbacks extracted from the application's photo, comment and odds registrations, invoked through isolated authenticated fixture HTTP requests. Unpaid odds retain basic probabilities without paid fields; paid actors still fail missing-membership checks.
- The real React permission provider, rendered with synthetic cached data: team/league selection, unrelated selected context, personal extras, tournament isolation and copied/stale profile boundaries.
- A dedicated loopback PostgreSQL database: the actual shared Drizzle seat readers and the proposed column-permission migration, authenticated-role reads, preserved RLS, unrelated-row filtering and untouched default-deny behavior.
- Existing personal/Commissioner purchase-role reconciliation, free current-team statistics, parent security, disabled child activation and the two-player validator.
- Actual historical ownership-backfill row shapes, rather than merely missing purchase records.
- Personal-provider failures with an independently valid league seat, preserved own-team/founder-support HTTP message sending, retained scoped UI/notices, and fail-closed unrelated paid actions.

The signed-in application screens are not visually verified by the anonymous screenshot browser. No real provider purchases, emails, push notifications or production records are part of these tests.

## Separate approval required before production

1. Review this boundary and the prepared SQL. No historical role resets or data reconciliation are bundled.
2. Confirm verified purchase-link tables and the four recognized production Stripe price IDs in the actual hosting environment without exposing secret values.
3. Identify any external ordinary client that currently uses `SELECT *` on predictions. Change it to explicit summary columns or the authenticated game API before restricting those reads.
4. Separately approve applying the SQL to the external Supabase production database and publishing the server/UI together. Replit publishing does not migrate this external database.
5. After approval, verify signed-in personal and league-seat accounts on phones, including the cross-league parent scenario, current-team statistics, ordinary team text chat, founder support and existing invoice tracking.

No publication, production SQL, data correction, real billing operation or HS activation has been performed by this work.
