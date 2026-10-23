# Custom Team Awards — setup and verification

## Current delivery boundary

The implementation is in the app, with **all setup on My Team** for the selected team. Existing captains create, edit, archive, grant and reassign; there is no assistant-captain role or subscription-tier gate. Custom awards track a current holder separately from permanent Trophy Case achievements.

The feature is deliberately **disabled until its Supabase setup is installed and explicitly enabled**. No migration, Storage bucket, Edge Function, secrets, production settings, or native configuration is automatically deployed by this change. Missing installation is reported by `/api/team-awards/config` as `enabled: false, setupRequired: true`, not as working data.

## Authorized Supabase setup

An authorized operator must review and apply the following to the intended Supabase project. Back up the database first and try the complete sequence in a nonproduction project before authorizing production changes.

1. Apply `migrations/0044_custom_team_awards.sql` once. It creates the tables, RLS, validating RPCs, grant constraints, roster-removal triggers, persistent push outbox and configurable limits. It does not alter existing teams or badges, or enable the feature.
2. Apply `migrations/0044_custom_team_award_storage.sql` once in Supabase. This creates a private `team-award-images` bucket and JWT-scoped object policies. These are manual migrations, not startup DDL; do not substitute `db:push`, which does not install the security functions/policies.
3. Deploy the `supabase/functions/remove-award-bg` Edge Function with JWT verification enabled. It uses the adjacent `_shared/award-background.ts` provider wrapper.
4. Configure the Edge Function's **Supabase secrets**, not browser variables:
   - `AWARD_BG_PROVIDER`: `removebg` (default) or `photoroom`.
   - `AWARD_BG_API_KEY`: the selected provider's credential.
   - Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Edge Runtime. Never copy the service key or provider key into frontend settings.
5. Confirm the existing app's Supabase URL and anonymous key target that same project. The Express award endpoints forward each caller's JWT to RPC/Storage instead of using the service role; the Edge Function verifies the caller and uses a service-only quota RPC. Existing OneSignal configuration supplies push delivery.
6. Reload the Supabase API schema cache after installation if needed (`NOTIFY pgrst, 'reload schema';`).
7. After verifying RLS and the flows below, explicitly enable the feature with `UPDATE public.team_award_config SET enabled = true WHERE id = true;`. Setting it false disables access and stops the push worker from claiming new notifications.

No new Replit environment variables or a paid plan selection are needed for the feature flag. `active_limit` and `removal_limit` in the singleton config row are the authoritative adjustable database limits (defaults 5 and 10); the API returns these to the UI. Background-removal quota counts reserved provider attempts in the team's calendar month, including a provider failure after reservation, to bound external usage. Missing provider configuration does not reserve quota. Award/image saves remain independent of that quota.

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

## Repeatable local checks

Pure API/image/provider/presentation/notification checks:

```sh
npx tsx --test server/tests/teamAwardImages.test.ts server/tests/teamAwardRoutes.test.ts server/notificationClickUrl.test.ts client/src/components/team-awards/*.test.ts
```

Database/RLS/concurrency checks require a **disposable local PostgreSQL cluster**, not `DATABASE_URL`. Initialize it with `initdb -D /tmp/<new-fixture-dir> -U award_test --auth=trust --no-locale`, run `postgres -D /tmp/<new-fixture-dir> -h 127.0.0.1 -p 55442 -k /tmp` as a tracked temporary process, then run:

```sh
npx tsx --test server/tests/teamAwards.database.test.ts
```

The tests only connect to 127.0.0.1:55442 as `award_test`, check the role, create a uniquely named temporary database, install the actual SQL migrations into minimal fixtures, and drop that database afterward. They never import the app database module, credentials, or workspace database environment variables. Stop the temporary PostgreSQL process afterward.

The isolated browser fixture uses **real award components and styling with synthetic auth/API responses**; it never calls the app database, OneSignal or a removal provider:

```sh
npx tsx scripts/team-awards-browser-fixture.ts
# separately, a tracked temporary Chromium process:
chromium --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --user-data-dir=/tmp/award-fixture-chromium about:blank
node scripts/test-team-awards-browser.mjs
```

Stop both temporary processes after verification. These checks cover mobile/desktop setup, create/edit, image-save recovery after provider failure, self-grant, reassignment confirmation, history retention, holder refresh/overflow and noncaptain controls.

## Still requires external verification

The local checks do not prove that the hosted Supabase Edge Runtime can reach the configured provider, that a real Supabase Storage bucket has been provisioned, or that OneSignal delivers on installed iOS/Android builds. After authorized external setup, use controlled test accounts to confirm these boundaries without notifying unrelated users. No real signed-in production screen, live provider call, or OS push is claimed as verified by the fixture tests.
