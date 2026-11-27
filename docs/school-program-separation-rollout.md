# School and program separation

## Approved product structure

School → Programs → Teams, with staff and players assigned to teams.
Programs keep their existing league association. The same School record can be
reused across leagues administered by the commissioner; reusing it does not
share another league's teams or grant staff access.

League Management now has separate Add school and Add program forms. A program
requires a selected school. Existing programs can be renamed or explicitly
relinked without changing their IDs, teams, staff, players, or consent.

## Database installation requires separate approval

`migrations/0060_school_program_separation.sql` targets the existing external
Supabase database and requires the private `hs_onboarding` foundation.
It has only been executed against disposable loopback test databases.
Do not treat code approval as authorization to modify production.

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

No production database, account, password, invitation delivery or rollout
allowlist was changed as part of implementation. Existing parent verification,
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
