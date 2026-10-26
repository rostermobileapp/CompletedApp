# Development isolation — first release

## Resources and setup

Development uses the separately approved Supabase project, not the existing
application project. Tests use Replit-managed PostgreSQL, **not Supabase**.
The original production credentials remain unchanged in workspace secrets;
application startup replaces/removes them only inside the development process.

For a newly provisioned, verified development project:

1. `npm run setup:dev` installs the Drizzle application schema without live data.
2. `npm run seed:dev` creates only synthetic Auth identities, one league,
   season and team, and their memberships.
3. `npm run init:dev` explicitly installs remaining application schema and
   nonpersonal catalogs. It excludes recovery, historical awards, purchase
   reconciliation and worker starters. Original custom-award schema/policies
   are installed only in dev; their opt-in flag remains disabled.
4. `npm run storage:dev` creates the private application bucket if absent and
   verifies a tiny synthetic PNG upload/download and dev-only signed-upload URL.
5. Start the existing application workflow.

Scripts fail closed on missing/ambiguous project identity or a database
matching the existing application connection. Supabase direct and pooler aliases
are normalized. Do not override the isolation markers manually.

## Safety boundaries

- Server database, Auth and Storage, and browser Auth use the same dev project.
- Production workers/startup repairs require `NODE_ENV=production` **and** the
  approved Railway environment and service. Production database selection
  requires that identity too. Production configuration/data access is unchanged
  in the approved runtime.
- A production identity/configuration mismatch refuses startup explicitly,
  rather than serving a healthy app with worker gates silently false.
  [Exact Railway evidence and release checks](railway-worker-guard-verification.md)
  distinguish platform metadata, generated runtime variables, and live job checks.
- Development removes live provider and connector credentials. Server outbound
  HTTP/fetch is limited to the approved dev Supabase API. Auth email/account
  mutations are denied; password-session refresh and logout remain permitted.
- Development delivery/billing HTTP requests return explicit 503 responses.
  Direct push/email entry points also reject; no fake sent/paid acknowledgments.
- Browser fetch/XHR/WebSocket guards and CSP exclude production providers.
  Native purchases/restores, account association and raw subscriber attributes
  are rejected before calling the bridge. Push registration is disabled and
  old service-worker registrations on the dev origin are removed.
- Production-built static clients are not served by the dev server.
- Giphy and external/provider-dependent integrations are deliberately unavailable
  in isolated development.

Authentication verification, user sync and production authorization were not
optimized or replaced.

## Verification and limitations

Verified: synthetic commissioner/captain/player authentication and team reads;
HTTP rejection of checkout/invite/reset requests; private dev Storage round trip;
browser and native-bridge policy tests; existing native billing unit tests;
test-only PostgreSQL transaction isolation; server bundling, focused TypeScript
checks, and a production frontend build. The public landing page was screenshot
checked. Signed-in UI and real iOS/Android devices were **not** visually tested.

The plain PostgreSQL test target does not provide hosted Supabase Auth/Storage.
Its default test does not establish full application-schema compatibility.
See [test database coverage](testing-database.md).

Vite hot reload is disabled **only in isolated development** because its
WebSocket upgrade failed through the preview proxy. Refresh after editing.
The application's `/ws` delivery and production refresh/polling are unchanged.
The dev console can still report blocked dev-tool WebSocket or eager Stripe.js
loader attempts; CSP rejects these before a provider connection is made.

Repeatable API checks used synthetic sessions without printing tokens:
`GET /api/auth/user` and `GET /api/teams/dev-team` returned 200 for all three
fixtures, with their expected roles and synthetic team. POSTs to
`/api/stripe/create-checkout-session`, `/api/scrimmages/dev-game/invite`,
and `/api/auth/reset-password` returned 503 with
`NONPRODUCTION_DELIVERY_DISABLED`.

No before/after traffic-saving claim is made. Production request/row/byte
measurement has not begun; it is a separate release, followed by removal.

## Reversal

Stop development first. If reverting this batch through a checkpoint, keep it
stopped until an isolation guard is restored and verified. Never restart old
code against the shared production credentials. Leave both nonproduction
databases unused rather than deleting them. No Railway deployment/configuration,
production data, or production metrics sink needs reversal.
