# School-league permissions and playing eligibility

## Approved policy

These are scoped capabilities, not automatic inheritance of every permission.

| Operation | League owner/admin | Approved coach |
| --- | --- | --- |
| Edit league settings | Own league | No |
| Edit game lineup | Not through league authority | Own team only |
| Message players in team chat | Not through league authority | Own team only |
| Change playing restrictions | League restriction | Own team's restriction |
| Clear a league restriction | Own league | Never |

Existing independent parent-child messaging remains available to a parent,
including a parent who also administers the league. Existing program AD roles
are distinct from league ownership; this change does not create or grant them.
The current league-management authorization continues to use canonical league
ownership, not a paid account label or an unverified claimed role.

## Implementation

- Coaches' roster queries cannot expose program-wide call-up candidates.
- Lineup selections are restricted to the selected team's own approved players.
- League-management service composition explicitly rejects lineup and player-chat
  operations instead of inheriting the temporary administrative scope.
- Legacy Adult line and team-chat write routes reject protected School/Youth
  teams, including teams whose league category is protected but whose old
  program tag is still Adult. School writes use the scoped school endpoints.
- League settings continue to require actual league ownership.
- Head and assistant coaches can manage their own team's playing restrictions.
  Team managers/ADs have read-only eligibility in the staff view unless they
  independently use authorized league management.
- League and team restrictions are separate. Effective playing eligibility is
  true only when neither restriction applies. Clearing either flag cannot clear
  the other.
- Reasons and actor/scope audit entries are saved for changes. Version checks
  reject stale writes, and a program/advisory lock serializes lineup saves with
  restriction changes.
- Adding a restriction scratches affected players from saved future scheduled
  lineups, without changing historical/final game records. Clearing a restriction
  does not automatically dress anyone.
- The backend rejects dressing an ineligible player even if the UI is stale.
  Restricted players may still be scratched.
- Playing restrictions never alter roster approval, guardian consent, child
  device sessions or parent-child messages.

## Interfaces

League Management has an Eligibility pane. The coach Roster screen has the same
shared Player eligibility control. Both show effective status and independent
League/Team reasons; coaches cannot clear a League restriction.

The lineup editor waits for real eligibility status before enabling Save and
disables Dress for restricted players. Missing storage returns an explicit error;
it is not treated as proof of eligibility.

## Database and release

`migrations/0061_school_player_eligibility.sql` adds three private tables for
league restrictions, team restrictions and their audit history. RLS is enabled,
browser/service-role table grants are revoked, and child-owned eligibility data
cascades with an already-authorized deletion of its child record. The migration
does not add any restrictions to existing players or update existing records.

This migration has been applied only to disposable loopback databases.
The owner's earlier School/Program database approval does **not** authorize this
new update. Obtain separate approval before changing the live external Supabase
database. Never add it to startup DDL or alter the testing allowlist.

The owner handles GitHub pushes and the matching Vercel frontend/Railway backend
releases. Do not publish automatically. The existing adult-password cutover
prerequisite remains separate.

## Verification scope

Real isolated SQL/HTTP checks cover independent restriction precedence,
cross-team and cross-league denials, canonical versus paid roles, stale and
concurrent writes, lineup enforcement, future-lineup scratching, private storage,
the actual legacy line authority and message handlers, and missing-storage
failure.

The browser harness uses actual controls, request transport, services and SQL,
with synthetic sign-in. It checks league and coach edits, non-overridable league
restrictions, disabled Dress/enabled Scratch, conflict refresh, and phone layout.
It does not establish live signed-in or native-device acceptance.
