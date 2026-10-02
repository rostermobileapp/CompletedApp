---
name: Google Play recovery ownership
description: Store-proof requirement, GPA lookup limits, and historical anonymous billing observations.
---

Follow the owner's approved Natively billing authority in [Store billing authority](natively-revenuecat-proof.md). The earlier reporting-only restriction is superseded; independent Google verification and canonical ownership checks remain required.

A Google GPA order number is a lookup hint, not authority to assign a purchase to a Roster account.

**Why:** Orders can reveal a purchase token while providing no Roster ownership evidence. Receipt screenshots can be copied.

**How to apply:** Verify native Google purchase tokens directly with Google and enforce unique account-owned claims. Do not grant from GPA numbers, customer IDs, subscriber attributes, aliases, or RevenueCat subscriber lookup.

Historical Google purchases can retain an obfuscated account binding derived from their original anonymous SDK identity even after reporting aliases change.

**Why:** A real verified Play order's binding remained anonymous after the reporting record appeared linked to a Roster account.

**How to apply:** Do not interpret a reporting-ID mismatch as failed Google payment, force aliases, or transfer purchases. Current native tokens and the existing Roster ownership claim are the relevant verification path.

RevenueCat v1 may expose only one order per product, while multiple legitimate purchases exist.

**Why:** A valid new Play order was absent from that reporting entry.

**How to apply:** Absence from reporting cannot reject a store-verified purchase, and presence cannot authorize one.