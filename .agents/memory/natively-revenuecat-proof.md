---
name: Natively RevenueCat proof gap
description: Why the native purchase and restore callbacks do not prove Apple entitlement to the server.
---

Natively's documented RevenueCat purchase callback returns a package ID; its restore callback returns a customer ID. Neither promises an Apple transaction ID or signed JWS. Do not assume a successful native callback contains the proof required by the existing Apple verification endpoint, and do not grant access based on a client-supplied customer ID alone.

**Why:** An active Apple subscription was visible on an iPhone while the account remained Free; the app's restore flow expected transaction data, discarded the documented callback response, and never called server verification. Configuring Apple server credentials alone cannot repair that client/server contract mismatch.

**How to apply:** Verify entitlement server-side through the existing RevenueCat project's authenticated API after establishing a trustworthy account identity, or obtain and verify a receipt/order transaction with Apple before linking a user. Treat the native callbacks as signals to begin verification, not verification itself.

An existing project app's public RevenueCat key can read the project's iOS subscriber status through the v1 subscriber endpoint, including an anonymous subscriber's active Apple product. That verifies the subscription **at RevenueCat**, not the ownership of a Roster account. Never grant roles from a client-supplied anonymous ID or leave a grant without a revocation path; a unique purchase-lineage claim and renewal/refund reconciliation are required. Key *presence* is also not proof that Apple API verification works: validate the signing key can actually import and make a lookup before depending on it.