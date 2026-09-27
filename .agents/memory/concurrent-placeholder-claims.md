---
name: Concurrent placeholder claims
description: Why imported-player reconciliation needs cross-request serialization.
---

Treat placeholder claiming as one atomic, per-user operation: acquire a database-scoped lock before reading candidates, checking memberships, transferring invoices, and retiring placeholders. Do not use an unlocked check-then-insert or an in-process-only mutex.

**Why:** Multiple authentication reconciliations can run within milliseconds of signup. They can all see the same placeholder and each insert an approved league or team membership before any one request removes it. This caused repeated roster entries linked to one real user, not multiple accounts.

**How to apply:** Keep reads, membership writes, invoice transfers, and placeholder retirement within the same transaction under the same lock. Any new import/claim path should honor this rule; a database uniqueness constraint would provide an additional safety net after existing duplicate pairs are reconciled.