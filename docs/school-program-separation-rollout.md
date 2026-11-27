# School and program separation

## Approved product structure

School → Programs → Teams, with staff and players assigned to teams.
Programs keep their existing league association. The same School record can be
reused across leagues administered by the commissioner; reusing it does not
share another league's teams or grant staff access.

League Management now has separate Add school and Add program forms. A program
requires a selected school. Existing programs can be renamed or explicitly
relinked without changing their IDs, teams, staff, players, or consent.

## Database installation

`migrations/0060_school_program_separation.sql` targets the existing external
Supabase database and requires the private `hs_onboarding` foundation.
The owner explicitly approved this specific database update on November 27,
2026, after the disposable loopback tests passed. It has now been applied to the
validated external production Supabase database.

Read-only preflight found zero existing programs, teams and staff requests in the
private onboarding registry, so no School records needed to be backfilled.
The existing child record and canonical school-team memberships were preserved.
Post-installation verification confirmed RLS, restricted table privileges,
the foreign key, the unique program-name index and no unlinked programs.

`scripts/install-school-program-separation.ts` requires an explicit read-only or
owner-authorized apply mode, validates the production target separately from DEV,
and checks record preservation before committing. It is not a startup hook.
Future database changes still require their own authorization; this approval is
not permission for further schema/data updates or publishing.

The migration:

- Adds private, RLS-protected School storage, inaccessible to browser roles.
- Adds a School reference to existing programs.
- Creates one School record per existing program, retaining its name and town.
  It does not guess that similarly named schools are the same institution.
- Preserves all existing program, team, staff, parent, child and player IDs.
- Replaces the former league/name/town uniqueness rule with a
  league/school/program-name rule.
- Leaves the new reference nullable for older writers during rolling upgrades.
  Unlinked records are visible in management for explicit repair.
- Is transactional, has lock/statement limits, and can be repeated.

Legacy names are intentionally preserved. For example, an old combined record
named “Central High” initially appears as School “Central High” and Program
“Central High”. The commissioner can rename the program to “Hockey”, or link it
to an existing School, without rebuilding its teams.

Before an approved live installation, confirm the external database target and
review the existing School table/reference if either already exists. Do not
apply this to an unrelated Replit database or use an automatic startup migration.
After installation, verify references, privacy, unchanged membership counts,
and the actual deployed frontend/backend versions.

## Release

The owner handles the GitHub push and Vercel/Railway releases.
The database update and matching backend/frontend are all required.
A newer frontend against the older backend shows an explicit update error;
the backend also reports an explicit missing-schema error.

Only the separately approved database structure update was applied. No account,
password, invitation delivery or rollout allowlist was changed. Existing parent verification,
child-device isolation, invite-only team entry and canonical staff authority
remain independent. The previously documented adult-password cutover
prerequisite still applies.

## Verification

- 72 isolated checks passed for hierarchy, migration repeatability, school
  reuse without foreign team access, explicit legacy relinking, preserved
  memberships, staff requests/approval, Family protection and invitation-only
  joining.
- Real browser harness created a School with two Programs and three Teams in
  one Program, renamed a program, issued invitations, approved a coach, and
  imported a schedule using disposable SQL.
- Desktop and 402-pixel phone layouts were reviewed; no horizontal overflow.
- Frontend production build and backend bundle passed.
- Repository-wide TypeScript checking has existing unrelated failures; no
  new diagnostics were observed in the changed school-management files.

The browser used synthetic sign-in/provider services and a disposable database.
It does not establish native-device or production acceptance.
