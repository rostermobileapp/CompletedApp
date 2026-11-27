---
name: School and Youth invitation boundary
description: All-account invitation-only self-service entry and separation from public display IDs.
---

Self-service entry into an existing High School or Youth team must require a
server-validated invitation or a valid secret invite/team code. This applies to
every account, including paid adults, coaches and league administrators.

**Why:** The owner explicitly required that no account can simply search and
request to join a school or Youth team. Child-only restrictions are insufficient
when legacy Adult endpoints remain available to adult accounts.

**How to apply:** Treat both the target team's program and its parent league's
category as authoritative; older school teams and newly categorized Youth
leagues do not necessarily share the same classifier. Sequential display IDs
are never invitation proof. Check direct HTTP paths, re-requests, staff intake,
membership approval and cross-league assignment, not just search-screen buttons.
Preserve authorized existing-member views and ordinary Adult joining. Creating
a new school/team through authorized provisioning is distinct from joining an
existing team; it must not accept an unrelated existing team's identity. Do not
delete or revoke historical memberships without separate authorization.
