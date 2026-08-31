---
name: Scrimmage payment state locking
description: Concurrency and authorization rules for payment-linked scrimmage state transitions.
---

Invoice creation, paid-player admission, and roster finalization must serialize on the same scrimmage-level lock, and approval must recheck that the scrimmage is still open while holding its row lock. Scrimmage linkage is server-controlled; generic invoice creation must not accept a client-selected scrimmage association.

**Why:** Independent read-then-write paths can duplicate invoices, bill players excluded from a finalized roster, or approve a paid player after finalization has already taken its roster snapshot.

**How to apply:** Any new path that creates a scrimmage-linked invoice or transitions a request to approved must participate in the shared locking protocol and derive recipients from server-authorized scrimmage state.