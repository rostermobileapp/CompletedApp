# Coach playing-eligibility alerts

League restricted/clear transitions enqueue private recipient-specific alerts in
the same transaction as the eligibility decision and audit. Team decisions and
reason-only changes do not enqueue league alerts. Every approved roster affected
by that league decision is considered; only approved head/assistant coaches on
that exact team qualify. Adult status requires a valid recorded DOB (18+ using
the New York calendar). Missing DOB does not qualify.

Staff screens check the active coach's inbox every 15 seconds while visible and
on window focus, show a generic alert and refresh the eligibility/lineup queries.
Acknowledgements are scoped to recipient and team and can be retried. A failed
check is shown on the staff screen, rather than represented as no changes.
Recipients lose inbox access as soon as current coach authority is revoked.

## Installation and delivery boundaries

- `migrations/0062_school_eligibility_alerts.sql` requires separate explicit
  approval before installation in external/production Supabase. This work does
  not install a live schema, send live test messages or deploy anything.
- Missing alert storage fails a league restricted/clear transition explicitly
  and rolls back the decision; it does not silently drop its alerts. Existing
  eligibility reads, team edits and lineup enforcement remain independent.
- Production routes retain the selected-account authentication gate. Recipient
  selection and delivery independently enforce the server-owned selected list.
- No email, chat or push provider is connected. In-app inbox reads are
  authenticated private requests; they do not send external notifications.
- `SchoolEligibilityAlerts.retryPush` is an injectable delivery seam, not a
  scheduled worker or enabled production route. It intentionally returns
  `delivery: "disabled"` without marking pending rows delivered when no approved
  transport exists.
- Any future approved push adapter must use the alert UUID as the provider's
  idempotency key. Retries keep that key after timeouts and transaction retries.
  Recheck provider retention limits before enabling unattended long-term retries.
  Never add child names, identifiers, restriction state/reasons, or chat content
  to push previews. Keep the fixed generic title and message.
- Delivery takes the same program lock as staff revocation and rechecks current
  canonical team, coach role, adult DOB, account state and rollout eligibility
  immediately before sending. Invalid queued recipients are cancelled.

## Isolated verification

Use a disposable loopback PostgreSQL cluster on port 56439 with role `runner`,
as required by `server/tests/helpers/highSchoolStaffFixture.ts`. Tests create and
drop their own databases and never import the application database connection.
Do not substitute a hosted database.

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test node --import tsx --test --test-concurrency=1 \
  server/tests/schoolEligibilityAlerts.database.test.ts \
  server/tests/schoolEligibilityAlerts.client.test.ts \
  server/tests/schoolPlayerEligibility.database.test.ts \
  server/tests/highSchoolStaff.database.test.ts
```
