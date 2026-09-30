---
name: Account merge safety boundary
description: Conservative policy for merging two independently authenticated registered accounts
---

An account-wide merge is not the same operation as consolidating a league roster entry. Only explicitly classified, non-authority records may move automatically; unclassified relational or opaque references, paid entitlements, and conflicting records block the merge for manual resolution. The retired source remains an audit tombstone and must not be revived by delayed sign-in reconciliation.

**Why:** Two valid logins may each control separate billing identities or privileges. A same-name or same-email match cannot establish ownership, and a generic foreign-key rewrite can silently confer permissions or duplicate purchases.

**How to apply:** When adding user references or new billing providers, classify their merge behavior explicitly and exercise the retirement guard; do not make the account merge permissive merely to get a particular pair through preflight.