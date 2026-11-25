# Manual Player Pro overrides

Manual grants are independent of purchased subscriptions. Expired or refunded
purchases do not cancel an enabled owner grant. Grants confer Player Pro only,
not Commissioner, team membership, parent approval or child-device authority.
Existing role-only legacy grants without managed billing evidence remain valid.

## Storage and release

`pro_access.manual_overrides` is private, RLS-enabled owner storage. Browser and
provider roles cannot read or write it. There is no self-service grant endpoint.
Do not use Auth user metadata or navigation preferences as an override.

The explicit production installer is:

```
npx tsx scripts/install-manual-pro-overrides.ts --production-read-only
npx tsx scripts/install-manual-pro-overrides.ts --apply-owner-authorized-manual-pro
```

The apply command requires owner approval. It checks the external Supabase
target, installs the private schema transactionally, and grants Player Pro to
the specifically authorized account only. It does not publish an app release.
The matching Railway backend must be released for premium feature checks to
recognize the grant; a profile role alone is not proof that this backend is live.

## Owner operations in Supabase SQL Editor

Use the private table, not just `public.users.role`. Replace the display ID
parameter with the intended account. Use a transaction and lock the user first
to keep the lock order consistent with billing updates.

Grant complimentary access to an otherwise Free/expired account:

```sql
BEGIN;
SELECT id FROM public.users WHERE display_id = 'U#####' FOR UPDATE;
INSERT INTO pro_access.manual_overrides(user_id, billing_role, reason)
SELECT id, 'free_tier', 'Owner-approved complimentary Player Pro'
FROM public.users WHERE display_id = 'U#####'
ON CONFLICT(user_id) DO UPDATE SET enabled = true;
COMMIT;
```

`billing_role` is the non-complimentary baseline, not the desired manual tier.
For an already-paid account, use its verified current billing role instead of
`free_tier`. Never modify purchase identifiers or expiry dates to grant access.

Disable or remove a grant:

```sql
BEGIN;
SELECT id FROM public.users WHERE display_id = 'U#####' FOR UPDATE;
UPDATE pro_access.manual_overrides SET enabled = false
WHERE user_id = (SELECT id FROM public.users WHERE display_id = 'U#####');
COMMIT;
```

The database preserves the latest role requested by billing separately from the
visible role. Disabling/deleting an override restores that baseline; higher
verified roles are not reduced by an active Player Pro grant. Normal provider
reconciliation continues to update purchases and expiry. During an active grant,
even an attempted billing downgrade leaves the displayed role at least Player
Pro. Changes take effect on the next server coverage fetch (the client refreshes
at least once per minute and on window focus); refresh the app after editing.

No existing account is automatically converted to an explicit grant, other than
the specifically owner-approved installation target.

## Installation and verification — November 25, 2026

- The owner approved the additive external production Supabase installation and
  the Player Pro override for U00250. The installation committed successfully.
- A separate read-only check confirmed the exact installation manifest, one
  enabled explicit override, the Free billing baseline, both accounts U00250 and
  U00061 still displaying Player Pro, and the existing retirement guard intact.
- Twelve disposable-database checks passed, including the actual Apple expiry
  reconciler, repeated downgrades, disable/delete/re-enable, browser-role denial,
  and compatibility with the existing account-retirement trigger.
- Forty-three focused coverage, route, permission-provider, purchase-role and
  reconciliation checks passed. Two older fixtures were updated for the
  existing child-installation query and current provider-outage copy.
- Frontend production bundling, backend bundling and backend syntax validation
  passed. TypeScript retained 224 existing diagnostics, none in the changed
  feature files. The application restarted and its public preview rendered.
- The first production installation attempt rolled back in full: the existing
  retirement trigger inherited a restricted search path. The new trigger now
  retains `public` after `pg_catalog`; the installer verifies that browser and
  provider roles cannot create objects there. The existing trigger was not changed.

At that checkpoint no Railway or Vercel release had been performed.

## Approved Railway release — November 25, 2026

The owner subsequently approved the backend release. Railway was already
building the exact connected-branch revision, so no duplicate deployment,
configuration change or Git push was triggered by the agent.

- Revision: `9b1596ccdb2f5778bb58249c0fe458f14e71c631`.
- Deployment: `601b7bdb-b218-4563-8f45-aec60c3369d2`.
- Railway reported `SUCCESS` at `2026-11-25T15:54:20.456Z`.
- The post-release backend root returned HTTP 200. An unauthenticated request
  to `/api/user/pro-coverage` returned HTTP 401, preserving the session boundary.
- Read-only production verification confirmed U00250 remained Player Pro with
  an enabled explicit override, while U00061 remained Player Pro without one.

The production storage, approved grant and matching backend are now installed.
No Vercel changes were made. Signed-in production UI and real-device feature
access have not been verified; deployment success and an unauthenticated check
do not establish that end-to-end acceptance.
