# Custom Team Awards — setup and verification

## Current delivery boundary

The implementation is in the app, with **all setup on My Team** for the selected team. Existing captains create, edit, archive, grant and reassign; there is no assistant-captain role or subscription-tier gate. Custom awards track a current holder separately from permanent Trophy Case achievements.

The feature is deliberately **disabled until its original Supabase tables and Storage bucket are installed and explicitly enabled**. Once that base setup exists, routine team-award database updates are applied automatically at app startup. No Edge Function, provider secret, or native configuration is required. Missing base installation is reported by `/api/team-awards/config` as `enabled: false, setupRequired: true`, not as working data.

## Authorized Supabase setup

An authorized operator must review and apply the following to the intended Supabase project. Back up the database first and try the complete sequence in a nonproduction project before authorizing production changes.

1. Apply `migrations/0044_custom_team_awards.sql` once. It creates the tables, RLS, validating RPCs, grant constraints, roster-removal triggers, persistent push outbox and configurable limits. It does not alter existing teams or badges, or enable the feature.
2. Apply `migrations/0044_custom_team_award_storage.sql` once in Supabase. This creates a private `team-award-images` bucket and JWT-scoped object policies. These are manual migrations, not startup DDL; do not substitute `db:push`, which does not install the security functions/policies.
3. Start the updated app. Its startup initializer automatically installs the celebration update, records successful completion, and skips it on subsequent starts. A transaction-scoped lock handles simultaneous app instances. It marks existing recognition as historical (no mass replay), then leaves new recognition pending until acknowledged. No manual SQL, Edge Function, provider account or secret is needed for this update.
4. Confirm the existing app's Supabase URL and anonymous key target that same project. The Express award endpoints forward each caller's JWT to RPC/Storage instead of using the service role. Existing OneSignal configuration supplies push delivery.
5. Reload the Supabase API schema cache after installation if needed (`NOTIFY pgrst, 'reload schema';`).
6. After verifying RLS and the flows below, explicitly enable the feature with `UPDATE public.team_award_config SET enabled = true WHERE id = true;`. Setting it false disables access and stops the push worker from claiming new notifications.

No new environment variables, background-removal provider, or Edge Function are needed. Image upload saves the selected image as a bounded PNG without removing its background. The active award limit is configurable in the singleton config row (default 5).

Background removal has been retired. An operator may delete any previously deployed `remove-award-bg` Edge Function and its `AWARD_BG_PROVIDER` / `AWARD_BG_API_KEY` secrets; the app no longer calls it. Historical migrations and quota objects remain unchanged for compatibility; no database migration is needed for this removal.

## Time and identity rules

- Team awards have an explicit IANA time zone in `team_award_settings`, editable from My Team and defaulting to America/New_York. Existing team queries do not depend on an automatically added column.
- Weekly/monthly periods are the completed period in that team zone, using ISO weeks including the ISO week-year.
- Games store league-local wall-clock timestamps. Their league time zone converts the scheduled start to an instant before the +30-minute window is applied; standalone games use the team zone. With no next game, the window expires 14 elapsed days after opening.
- Regular-season games live in `games`; playoff matches live in `tournament_matches`. Season fallback excludes scrimmages. A configured midnight season end date covers that calendar date and opens awards at the following midnight; a configured non-midnight end timestamp is used as-is.
- A captain may grant to themselves only while on the active approved roster. The roster accepts approved direct team membership or approved league membership assigned to that team, matching existing membership semantics.
- Removal invalidates existing holder grants without deleting history. Rejoining alone does not restore a removed holder. A new grant/reassignment is required.
- Cadence is fixed once an award is created, so editing cannot reinterpret existing period keys. Archive/create a new award to change its cadence.
- The list includes the latest 100 immutable recognition events per award; complete history remains stored in the database. `award_grants` retains one authoritative holder row per period, while `award_grant_events` appends the recipient, granting captain and original timestamp for every actual grant/reassignment. No-op reassignments add no event, and archive/roster removal do not alter earlier events.
- Private signed artwork URLs are short-lived; image version changes and query refreshes request the new art. Response-body logging is disabled for award endpoints so images and private signed URLs are not logged.

## Notification delivery

Grant/reassignment and a fresh push-outbox row commit together. No-op reassignment creates no additional push, and a later reassignment discards older unsent revisions. The worker checks that the recipient is still the current rostered holder before attempting delivery.

Delivery uses each outbox UUID as the stable OneSignal idempotency key. A successful send is recorded persistently; unconfirmed sends may retry with the same key. Attempts are bounded to six within one day, safely inside OneSignal's retention window. If the recipient has no push subscription or disabled pushes, the award still saves; no delivery is falsely recorded. Clicking the push opens My Team with an authorized team selector hint.

## On-screen award celebrations

New recognition events appear to the recipient over their current screen using the patch celebration styling and confetti, without granting a permanent patch or requiring a paid subscription. Uploaded art stays transparent and uncropped. The user can dismiss or acknowledge and open My Team for the corresponding team.

The global earned-event host gives patches priority and shows only one patch/team-award celebration at a time. Trivia pauses the host, and birthday greetings defer while award celebrations are pending. Live grant messages refresh the recipient's queue; visible-page polling, reconnect, focus and page-show refresh cover missed messages and offline returns.

A caller-scoped Supabase RPC returns at most 20 pending events for the signed-in recipient, only while the award is unarchived, the grant is still the current valid holder revision, and the recipient is still rostered. A separate recipient-only acknowledgement persists across sessions/devices and does not affect push state or recognition history. Failed acknowledgements keep the card open with retry controls.

The app automatically applies `migrations/0045_team_award_celebrations.sql` through `server/teamAwardDbInit.ts` before accepting requests. The update and its applied-version record commit together; an interrupted/failed update rolls back and is retried on the next start. Previously installed/manual celebration setups are adopted safely without resetting pending or acknowledged events. Routine restarts skip the recorded update. Future team-award updates should be appended to the startup registry with new version keys.

Missing original awards setup is left untouched and never auto-enabled. If startup setup fails, a sanitized error is logged and unrelated features still start; the pending API explicitly returns `setupRequired: true` when the celebration functions are missing.

## Repeatable local checks

Pure API/image/presentation/notification checks:

```sh
npx tsx --test server/tests/teamAwardDbInit.test.ts server/tests/teamAwardImages.test.ts server/tests/teamAwardRoutes.test.ts server/notificationClickUrl.test.ts client/src/components/team-awards/*.test.ts
```

Database/RLS/concurrency checks require a **disposable local PostgreSQL cluster**, not `DATABASE_URL`. Initialize it with `initdb -D /tmp/<new-fixture-dir> -U award_test --auth=trust --no-locale`, run `postgres -D /tmp/<new-fixture-dir> -h 127.0.0.1 -p 55442 -k /tmp` as a tracked temporary process, then run:

```sh
npx tsx --test server/tests/teamAwards.database.test.ts
```

The tests only connect to 127.0.0.1:55442 as `award_test`, check the role, create a uniquely named temporary database, install the actual SQL migrations into minimal fixtures, and drop that database afterward. They never import the app database module, credentials, or workspace database environment variables. Stop the temporary PostgreSQL process afterward.

The isolated browser fixture uses **real award components and styling with synthetic auth/API responses**; it never calls the app database or OneSignal:

```sh
npx tsx scripts/team-awards-browser-fixture.ts
# separately, a tracked temporary Chromium process:
chromium --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --user-data-dir=/tmp/award-fixture-chromium about:blank
node scripts/test-team-awards-browser.mjs
node scripts/test-team-award-celebrations-browser.mjs
```

Stop both temporary processes after verification. These checks cover mobile/desktop setup, create/edit, image upload/save without background-removal controls or requests, self-grant, reassignment confirmation, history retention, holder refresh/overflow and noncaptain controls.

The celebration checks cover live refresh, transparency, keyboard focus, trivia suspension, persistent acknowledgement/retry, queued awards, patch priority, return/resume refresh, account-switch isolation, team navigation, phone/desktop fit and reduced motion. Fixture confetti deliberately uses an unavailable video to verify the card-only fallback; actual confetti uses the same established media as patches.

## Still requires external verification

The local checks do not prove that a real Supabase Storage bucket has been provisioned or that OneSignal delivers on installed iOS/Android builds. After authorized external setup, use controlled test accounts to confirm these boundaries without notifying unrelated users. No real signed-in production screen or OS push is claimed as verified by the fixture tests.
