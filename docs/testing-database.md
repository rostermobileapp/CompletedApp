# Isolated database tests

## Test connection

`roster_test` is an empty, test-only PostgreSQL database created from `template0`
on the workspace's existing Replit-managed legacy PostgreSQL service. It is not
Supabase and does not copy records from the service's existing database.

Run:

```sh
npm run test:db
```

The launcher constructs `TEST_DATABASE_URL` in memory from the managed `PGHOST`,
`PGPORT`, `PGUSER`, and `PGPASSWORD`, selecting **roster_test**, not `PGDATABASE`.
The URL is passed only to the test subprocess; it is not stored as a new Replit
Secret, printed, or written to a source or `.env` file. No manual URL entry is
needed. Running database tests directly without this launcher still requires an
explicit, isolated `TEST_DATABASE_URL`.

Before launching, the guard rejects a test connection matching either the
existing `DATABASE_URL` app/production reference or `DEV_DATABASE_URL`.
Credential changes and URL options do not bypass it. Supabase direct, session
pooler, and transaction pooler aliases compare by project and database, not just
by host/port. Unidentifiable Supabase pooler configurations fail closed.

The child does not inherit production database credentials, managed PG defaults,
provider credentials, alternate test URLs, or `NODE_OPTIONS`. Existing auth
modules receive only the development Supabase configuration if they need to
initialize their SDK. This is not permission to test live provider delivery.

The managed endpoint is reachable over its WebSocket PostgreSQL transport.
A native TCP timeout alone does not establish that the database is unavailable.
The existing application/production database driver was not changed.

## Verified coverage

- Guard and launcher unit tests: both forbidden targets, Supabase aliases,
  malformed URLs, and removal of live credentials.
- Real database probe: correct database name, PostgreSQL version, UUID support,
  absence of hosted auth/storage schemas, and a synthetic insert in a temporary
  table inside a rolled-back transaction.
- Focused TypeScript checks for the guard, launcher, pool and related tests.

The new database does not yet contain the full application schema. These checks
do not establish that all existing integration tests or the application run on it.
They do not measure application traffic, egress savings, or performance changes.

## Supabase-specific and fixture limitations

- The team-awards database suite currently uses a hardcoded disposable local
  cluster, creates its own databases/roles, and builds synthetic `auth.uid()`,
  `authenticated`/`anon`/`service_role` roles and storage tables. It is not yet
  migrated to this launcher. Audit database/role ownership and permissions before
  adapting it; roles are cluster-wide, not database-local.
- SQL fixtures can exercise policy behavior on PostgreSQL but cannot reproduce
  hosted Supabase Auth, Storage API, or email delivery.
- `gen_random_uuid()` is available on the verified PostgreSQL 16 test target.
  No explicit `CREATE EXTENSION` requirement was found in the targeted test scan;
  this is not a complete migration compatibility certification.
- The trivia store suite uses a separate `TRIVIA_PUSH_TEST_DATABASE_URL`; that
  variable is intentionally not inherited by the launcher. Adapt and guard this
  path before enabling that suite.
- Use explicit test file paths to run other suites after their fixture/provider
  dependencies are reviewed:
  `npm run test:db -- server/tests/example.integration.test.ts`.

## Development status and reversal

The corrected development Supabase connection passed a read-only SQL check with
TLS certificate verification enabled and Supabase's published root CA. It is
distinct from the current app project and contains zero public application
tables and zero Auth users. Both supplied API keys passed its settings-endpoint
check. Schema setup, synthetic fixtures, full dev delivery/worker isolation and
first boot remain pending; validating credentials does not activate isolation.
No production connection, records, hosted settings, or deployment were changed.

Keep the application workflow stopped until Release 1 is verified. Reversing the
test launcher/guard batch must not restart development against production. The
test database can remain unused; do not drop it automatically during rollback.
