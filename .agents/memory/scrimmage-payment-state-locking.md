---
name: Scrimmage payment state locking
description: Concurrency and authorization rules for payment-linked scrimmage state transitions.
---

Invoice creation, paid-player admission, and roster finalization must serialize on the same scrimmage-level lock, and approval must recheck that the scrimmage is still open while holding its row lock. Scrimmage linkage is server-controlled; generic invoice creation must not accept a client-selected scrimmage association.

**Why:** Independent read-then-write paths can duplicate invoices, bill players excluded from a finalized roster, or approve a paid player after finalization has already taken its roster snapshot.

**How to apply:** Any new path that creates a scrimmage-linked invoice or transitions a request to approved must participate in the shared locking protocol and derive recipients from server-authorized scrimmage state.

A scrimmage has one organizer-facing payment request with one recipient row per player. Later joins append recipients to that request; legacy duplicate requests must merge without losing paid or confirmed state.

**Why:** Organizers need to review and mark every scrimmage payment from one recipient list, matching manual payment requests rather than managing one card per player.

**How to apply:** Keep the scrimmage-level lock around request lookup, recipient insertion, and duplicate repair. Preserve the strongest recipient state when consolidating historical rows.

Scrimmage cost edits and the amount on every linked payment request must update atomically while holding the same scrimmage-level payment lock.

**Why:** A payment request snapshots the cost when it is created; changing only the scrimmage leaves organizers and players seeing and paying the old amount.

**How to apply:** Any path that changes cost per player must update linked payment requests in the same transaction, then broadcast both scrimmage and payment realtime updates. Reconcile historical mismatches when introducing this invariant.

Scrimmage co-hosts share the creator's complete organizer-facing payment request view. Viewing is granted by current co-host membership; changing or confirming another player's payment and sending payment reminders additionally requires the co-host's payment-management permission.

**Why:** Co-hosts need one shared source of truth with the main host, while the per-co-host permission must still prevent a view-only helper from changing financial state.

**How to apply:** Include co-hosted scrimmage requests in the organizer payment list, expose all recipient rows to current co-hosts, gate mutations on payment-management permission, and broadcast payment updates to the creator, recipients, and co-hosts.

Shared co-host scrimmage payment requests must remain visible in Manage regardless of the dashboard's currently selected team, league, or tournament.

**Why:** Dashboard selection is stored locally and can point at another league or a stale context after switching accounts; applying that filter silently hides a valid co-host request even though server authorization is correct.

**How to apply:** Mark shared co-host requests explicitly in the organizer-list response and exempt only those shared requests from dashboard-context filtering.

Manual Approval and Pay to Play finalization clears all still-pending join applications. A finalized roster may accept a fresh application only after its approved count falls below capacity; First Come remains closed after finalization.

**Why:** Keeping pre-finalization pending rows blocks players from starting a new request after a confirmed player withdraws, while globally reopening a finalized scrimmage would lose the distinction between confirmed and unconfirmed rosters.

**How to apply:** Preserve `roster_confirmed` for schedule visibility. Treat a vacancy as a narrow exception for new Manual Approval/Pay to Play requests and their locked approval/payment transitions, rather than changing the scrimmage back to `open`.