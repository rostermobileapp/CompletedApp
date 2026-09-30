---
name: Email identity normalization
description: Canonical identity and safe reconciliation rules for imported players and authenticated users.
---

Treat trimmed, lowercase email as the canonical identity at every import, lookup, profile update, and authenticated-user reconciliation boundary.

**Why:** PostgreSQL varchar equality and uniqueness are case-sensitive, so mixed-case CSV values can create a second user instead of linking the authenticated account.

**How to apply:** Normalize before storage, compare normalized values, and run placeholder claiming on every reconciliation so imports added after signup are also claimed.

Never merge a NULL-email legacy user into a real account from a name match alone.

**Why:** Different people can share a name; deleting the wrong legacy row can cascade away unrelated history.

**How to apply:** Require explicit import provenance or administrator confirmation, transfer all references in one transaction, then delete the obsolete identity. Same-name and shared-league evidence alone is not deterministic.

For commissioner-approved league profile merges, treat the surviving authenticated account as the authority for login and personal profile data. Do not delete an old user-backed identity just to remove its duplicate league roster entry.

**Why:** A legacy league identity can still own history in other leagues; a name/email resemblance is only a search hint, not permission to merge accounts or erase global data.

**How to apply:** Require explicit source and survivor IDs and league commissioner approval; keep transfer transactional and league-scoped, and abort on ambiguous history rather than guessing which record to keep.