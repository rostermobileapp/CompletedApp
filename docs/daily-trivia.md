# Daily Hockey Trivia operations

## Verification

Run database-independent regressions with:

```sh
npx tsx --test shared/trivia.test.ts server/triviaGeneration.test.ts server/triviaFallbackSeed.test.ts client/src/components/triviaVisibility.test.ts
```

The database regression suite is deliberately restricted to a disposable local
PostgreSQL database named `roster_trivia_test` on `127.0.0.1:55432`. It uses a
test-only TCP adapter; production keeps its existing database connection.
Run it with a non-production `TEST_DATABASE_URL`:

```sh
TEST_DATABASE_URL=postgresql://trivia_test@127.0.0.1:55432/roster_trivia_test \
  npx tsx --test --test-concurrency=1 server/tests/trivia.integration.test.ts
```

Never point this command at Roster's application database. The tests create
minimal fixture tables, temporary users, daily questions and awards, exercise
fallback exhaustion, then restore configuration and remove their fixtures.

Daily trivia is published for an Eastern calendar date. The generator targets
tomorrow so the day's question exists before midnight in New York.

## Model and configuration

The generator and independent verifier both call Anthropic's Messages API using
the exact requested model ID, `claude-sonnet-5-5`. That ID was found in
[Anthropic's official model catalogue](https://docs.anthropic.com/en/docs/about-claude/models/all-models).
There is no silent model substitution: missing credentials, an unavailable
model, exhausted retries, invalid JSON, or a rejected answer are recorded and
lead to a vetted fallback question.

Before the first production Messages request in each CLI process, generation
makes an authenticated `GET /v1/models/claude-sonnet-5-5` with the configured API
key and confirms the returned ID exactly. An unavailable or unsupported model
fails preflight and goes to the vetted fallback path; it is never replaced with
another model.

Set `ANTHROPIC_API_KEY` as a server-side Replit Secret. Do not put it in a
client environment variable. API calls use exponential backoff for transient
failures (three request attempts per API call); a generation attempt consists
of one question-generation call and a separate blind verification call. There
are at most three generation/verification attempts per date.

The temporary audience gate is independent of patch entitlements:

- `TRIVIA_TEST_MODE` defaults to `true`.
- `TRIVIA_TEST_USER_IDS` defaults to `U00001`.
- Set `TRIVIA_TEST_MODE=false` to open trivia to all authenticated users;
  the allowlist is then ignored. Do not change the Trophy Case's existing
  subscription gate when changing this flag.
- Startup prints whether test mode is enabled and which display IDs are
  allowed.

## Run generation and review questions

From the project root:

```sh
# Seed any missing fallback rows (safe to repeat; existing/used rows are kept)
npm run trivia:seed

# Generate tomorrow's Eastern-date question
npm run generate-trivia

# Generate a specific date
npx tsx scripts/trivia.ts generate 2026-04-07

# Pre-generate and print the next seven dates for manual review
npm run trivia:review

# Review a selected date range (1–31 days)
npx tsx scripts/trivia.ts review 2026-04-07 7

# Reset only the allowlisted U00001 answer for one Eastern date
npm run trivia:reset -- U00001 2026-04-07

# Set all eight strictly increasing, positive integer thresholds
npx tsx scripts/trivia.ts set-tiers 1 5 10 25 50 100 150 200

# Map one category to an existing trivia badge-definition ID
npx tsx scripts/trivia.ts set-mapping nhl_history <trivia-patch-definition-id>
```

The CLI ensures trivia tables before these operations. It checks for badge
schema first and runs the broader badge bootstrap only if the badge tables are
missing; existing deployments rely on the normal Roster startup initialization
and do not repeat unrelated badge seeds on each scheduled invocation.

The review output includes the four choices, answer key, explanation,
verification notes, and source basis so an operator can check the published
content. Existing daily rows are idempotent and are printed rather than
overwritten. Review batches publish their dates immediately and should be
treated as live content, not a private draft.

The reset command refuses to run when test mode is off, rejects any display ID
other than the configured test account, and delegates to the transactional
reset that removes the answer and reverses its recorded `progress_awarded`
contribution.

## Automatic noon push notifications

The production web server starts a daily push sender at noon in
`America/New_York` (DST-aware). This sender is separate from question generation
and does not replace the independently scheduled generation project.
It is disabled in development/preview, so publishing the backend is required
to activate it. It announces today's available question, including to people
who already played; it does not reset answers or change progress.

With trivia test mode enabled, automatic pushes are restricted to U00001
and only sent if that account is also in the configured test allowlist.
With test mode disabled, eligible non-deleted, non-placeholder accounts with
push enabled and a registered device can receive the daily announcement.

`trivia_push_deliveries` records one delivery per account/Eastern date.
Atomic five-minute leases coordinate replicas. Retries reuse the same OneSignal
idempotency key, and only provider-confirmed acceptance marks a delivery sent.
Failures retry after five minutes; provider requests time out after 20 seconds.
A server starting after noon catches up today's unsent deliveries, but never
replays older days. Pushes use the direct `/?trivia=1` launch link.
Check `[TriviaPush]` logs and the delivery table for acceptance/failure status;
provider acceptance is not a guarantee that the device displayed the push.

## Scheduled question-generation deployment

No separate question-generation scheduler is configured by this project. `ops/trivia-schedule.json` is a
configuration manifest for the separate Scheduled Deployment that still needs
to be created. Do not interpret the manifest as proof of an active schedule.

### Separate scheduled project — selected deployment approach

The owner chose a separate scheduled project rather than migrating Roster's
workspace or replacing its Autoscale deployment. Publishing that new job is
an owner-operated setup step; the existing app is unchanged.

1. Import the same Roster source revision into a **new, separate Replit project**.
   Include `package.json`, `package-lock.json`, `tsconfig.json`, `scripts/`,
   `server/`, and `shared/`; importing the complete repository is simplest.
   Keep this job's source updated when Roster's trivia schema or generator changes.
2. In the **new project only**, apply `ops/trivia-job.replit.example` as its
   `.replit`. Do not copy this configuration over the original Roster project.
3. Add `DATABASE_URL` and `ANTHROPIC_API_KEY` using that new project's Secrets
   interface. The database must be the same one used by the **published**
   Roster app, not an isolated test database. Secrets are not copied into the
   repository or this documentation. Do not enable `NODE_ENV=test` or add
   `TEST_DATABASE_URL` to the job.
4. In the new project's Publishing tool, choose **Scheduled**:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm ci` |
   | Run command | `npm run generate-trivia` |
   | Cron expression | `0 12 * * *` |
   | Time zone | `America/New_York` |

   Specify the time zone explicitly; do not use a fixed UTC hour or rely only
   on an environment `TZ` value.
5. Run the command once, then publish the scheduled job. In its logs, check the
   exact `claude-sonnet-5-5` model and tomorrow's Eastern `targetDate`. A
   `verified` attempt means both generation and blind verification passed;
   a `fallback` entry means continuity worked but generation needs attention.
6. Confirm the Publishing tool shows the next run at **12:00 PM New York**
   and inspect its first scheduled run. Rerunning for a date already populated
   is harmless: the published question is returned without replacement.

This worker exits after one generation pass, needs no HTTP port, and does not
depend on the web server staying awake. Trivia test mode affects player access
only; it does not stop this job.

Run the generator as an independent Scheduled Deployment, not as an in-process
web-server timer. Use this command:

```sh
npm run generate-trivia
```

Set the schedule to `0 12 * * *` in the `America/New_York` time zone. This
keeps the job at local noon across daylight-saving changes. The job prepares
tomorrow's question. Configure it as a separate scheduled job; it must not
replace or change the existing Roster web deployment.

## Review generation attempts and fallbacks

Every model attempt is written to `trivia_generation_attempts` with its target
date, attempt number, generated question (when available), verdict, and notes.
The same structured event is also sent to server logs as a backup if the audit
table cannot be written. Fallback use emits an alert-level log entry.

Example review query:

```sql
SELECT target_date, attempt, verdict, question, notes, created_at
FROM trivia_generation_attempts
WHERE target_date >= CURRENT_DATE
ORDER BY target_date, attempt, created_at;
```

Fallback questions are seeded from `server/triviaFallbackSeed.ts`, include a
source URL in their verification notes, and are never overwritten by a seed
rerun. For continuity, generation first consumes an unused fallback from the
scheduled category, then an unused fallback from another category if needed,
and only after all unused rows are gone reuses the least-recently-used vetted
fallback. Category drift and any reuse are explicitly logged as alerts; the
question's stored category still determines which patch receives progress.
If the inventory table itself is empty, generation fails loudly rather than
publishing a fabricated question. Replenish it with verified, sourced rows.

## Change patch thresholds or category mapping

Use the CLI commands above rather than editing these tables directly. The
backend `updateTriviaTiers` operation validates all eight positive, strictly
increasing thresholds and updates `trivia_tiers` and the corresponding trivia
`badge_tiers.threshold` rows transactionally, then silently reconciles lifetime
progress from stored correct answers. Answer history is not reset. Previously
earned tiers and their exact first-unlock timestamps are preserved, even when
a raised threshold is above the user's count. Lowered thresholds silently add
newly qualifying awards at reconciliation time without replacing existing
awards or emitting notifications. Reapplying unchanged configuration is
non-destructive. Only the explicit U00001 answer-reset operation rebuilds
history to reverse test progress.

`set-mapping` delegates to `updateTriviaCategoryMapping`, which accepts only an
existing definition validated as a trivia-only patch family. It silently
reconciles the category's historical correct-answer count against the new
family. Existing awards on the old family and their award dates are not
deleted, moved, or reset; the new family is reconciled from the category's
historical progress. Existing awards are copied to the new mapped family with
their original exact timestamps, and any newly qualifying awards are added
silently.
No earned-event notification is emitted during reconciliation. The mapping
change does not rewrite historical answer dates or categories.

```sql
-- Inspect current category-to-patch IDs before remapping.
SELECT category, patch_id FROM trivia_category_patches ORDER BY category;
```

Each category maps to one existing badge definition through
`trivia_category_patches`. The initializer seeds missing families/mappings and
does not overwrite an operator's existing category mapping.

Category keys and their order are in `shared/trivia.ts`; changing the rotation
order affects future dates, not already-published questions. Do not manually
change fallback rows' slugs or `used_on` values to "refresh" the inventory.
For a fact correction, update the reviewed source entry and add a targeted
migration for the exact superseded seed row; do not overwrite operator-edited
rows.