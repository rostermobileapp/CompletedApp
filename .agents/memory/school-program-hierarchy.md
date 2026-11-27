---
name: School and program hierarchy
description: Owner-approved distinction between schools, sport programs and their teams.
---

A School and a Program are distinct. One school can have multiple programs,
and a program can contain multiple teams, such as Varsity, JV and Freshman.
Staff and players belong to teams, not to an individual coach.

**Why:** On November 27, 2026, the owner rejected combining School and Program,
pointed out that one program may have three teams at the same school, and
explicitly requested the separation.

**How to apply:** Keep institutional identity separate from program and team
identity. Reusing a school across leagues must not duplicate the institution or
grant access to another league's teams. Do not automatically merge historical
schools by matching names or replace existing team/staff/player identities.
Existing program-scoped permissions do not become school-wide authority merely
because two programs share a school.

## Boys' and girls' program guidance

The intended setup order is League → School → Program → Team. A school offering
boys' and girls' hockey shares its institutional identity, while each program
has a separate coaching staff, budget, history and roster pipeline. Varsity Gold,
Varsity Blue and JV may all be teams within one boys' program; girls' varsity
belongs to the separate girls' program at that same school.

**Why:** The owner supplied this high-school example to clarify setup guidance
on November 27, 2026. They placed shared logo, colors, home rink and athletic
director at School level, and program leadership/booster information at Program
level.

**How to apply:** Keep these distinctions visible in setup guidance even after
initial creation. This describes intended organization, not evidence that every
associated settings field already exists. Label examples as illustrative and
never create example schools, programs or teams without an explicit request.

## Setup views and navigation

The three setup cards show counts of schools, programs and teams. The active
highlight represents the step the administrator is viewing, not an inferred
completion stage. Only the selected step's inputs and records belong in its
main content area; do not show the full school/program/team tree alongside it.
Step 1 includes existing school rows with Edit and Delete controls.

**Why:** The owner explicitly corrected the all-steps-visible design and
emphasized that no other step's information should appear while viewing a step.
They requested a visible notice that steps are clickable.

**How to apply:** Keep step selection independent of saved record counts.
Forward navigation slides the next panel in from the right and moves the old
panel left; backward navigation reverses that direction. Preserve this isolation
when changing setup or adding actions.

## Scoped editing permissions

League administrators cannot edit team lines or message players through their
league-admin authority. Coaches cannot edit league settings and are restricted
to their own teams. Both coaches and league administrators can change player
eligibility within their authorized scope.

**Why:** The owner explicitly specified these editing boundaries on November
27, 2026. A higher organizational role does not automatically inherit every
lower-level operational permission.

**How to apply:** Enforce separate capabilities on server reads and writes as
well as visible controls. Do not grant team coaching or player-chat access just
because an actor owns the league. Preserve independent parent-child rights;
the league-admin restriction does not revoke a parent's own private child chat.
League restrictions take priority over coach changes. A coach may clear the
team's own restriction but cannot clear or bypass a league restriction.

**Why:** The owner explicitly selected league-restriction priority when asked
whether coaches could reverse a league administrator's eligibility decision.

**How to apply:** Store league and team restrictions independently. A player is
eligible only when neither applies; clearing either restriction must not erase
the other. Playing eligibility is not parental consent, roster approval, or
device access and must not silently change any of them.
