---
name: Account merge safety boundary
description: Commissioner account-wide merge authority, paid-parent selection, and billing/conflict safeguards
---

The user explicitly authorized league commissioners to merge registered accounts across the entire application on 2026-10-13. Do not reimpose a founder/support-only restriction as a product requirement. This is a full account combination, not a league-only history transfer: the chosen parent retains the login email and username/profile, and the source login is retired.

**Why:** The user corrected the assumption that managing one league must categorically exclude account-wide merge authority. Commissioners must be able to resolve duplicate player accounts.

**How to apply:** Authorize the real acting commissioner against the managed league and eligible selected accounts on the server, while preserving the separate global support path. Keep identity verification/explicit acknowledgement; never infer that two accounts belong to one person from names or email alone.

Tier policy:
- Two free profiles are eligible to merge; the commissioner selects the parent.
- One free and one non-free profile: the non-free Player Pro or commissioner profile is always the default parent. Preserve its login/profile and billing ownership rather than retiring it into the free profile.
- Both profiles non-free: show a billing-duplication warning and require account billing to be resolved before merging. Do not cancel, refund, or migrate purchases automatically.

**Why:** This is the user's explicit billing safeguard and parent-selection policy; it supersedes blanket paid-account prohibitions.

**How to apply:** Apply the same tier policy to preview and transactional confirmation, regardless of selection order, and recheck stale tier/billing state. Historical provider IDs alone are not proof of current paid status.

Transfer records through explicit, audited domain rules. Preserve original attribution and existing same-person relationships; keep unclassified references and meaningful discrepancies fail-closed. Differing poll votes or invitation responses require review, never silent survivor preference. Retain the retirement tombstone and prevent delayed sign-in reconciliation from recreating the source.

**Why:** Allowing commissioner merges does not authorize silent data loss, duplicated purchases, or arbitrary answers when the accounts disagree.

**How to apply:** Classify and test record moves/deduplication, expose specific conflicts before confirmation, and perform the complete account merge atomically.

Merge-review fingerprints must ignore authentication bookkeeping timestamps while still binding functional account state, authorization context and verified billing evidence.

**Why:** Sign-in reconciliation updates account timestamps on each authenticated request; including those changes makes an otherwise unchanged preview impossible to confirm.

**How to apply:** Revalidate meaningful identity, tier, permission and history changes at confirmation. Do not treat a routine auth timestamp update as a user-data conflict.

Normalize PostgreSQL catalog metadata before treating it as application data, especially when verifying against a different database transport.

**Why:** The isolated TCP driver returned PostgreSQL identifier arrays as strings, while unquoted catalog aliases did not match the expected object keys. These issues hid league grouping or broke otherwise safe reviews.

**How to apply:** Use explicit text-array types and stable column aliases for catalog results, and verify both collision detection and indirect league grouping in isolated fixtures.

A registered Roster account can retain a legacy database ID that differs from its Supabase sign-in ID. Preserve that distinction rather than assuming the database ID is an Auth ID.

**Why:** Historical migration can retain the old profile while its real sign-in is uniquely linked by normalized email. Direct Auth-ID lookup alone incorrectly hides these registered users.

**How to apply:** Verify an unambiguous normalized-email link against the Auth provider, reject contradictory identities, bind the resolved identities to the review, and reject retired sign-ins by original email too.

Keep the commissioner merge review concise: selected accounts, retained login, preserved hockey history, one explicit confirmation, and human-readable blocking issues. Do not display database inventories, UUID lists or audit fingerprints.

**Why:** The user rejected these internal details on 2026-10-13 and wants assurance that the accounts merge correctly without interpreting implementation data.

**How to apply:** Preserve server checks and internal audit detail, but present only information needed for the merge decision.

A RevenueCat native-login association alone must not block a merge when the Supabase account tier is Free. Leave its provider ownership attached to the original account; do not reassign the provider customer.

**Why:** The user explicitly confirmed on 2026-10-13 that this association is not a concern for a Free Supabase tier.

**How to apply:** Do not infer a paid account or require a RevenueCat lookup merely from this association. Retain existing paid-parent rules and checks for actual purchase records.