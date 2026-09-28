---
name: Natively RevenueCat proof gap
description: Why the native purchase and restore callbacks do not prove Apple entitlement to the server.
---

Natively's documented RevenueCat purchase callback returns a package ID; its restore callback returns a customer ID. Neither promises an Apple transaction ID or signed JWS. Do not assume a successful native callback contains the proof required by the existing Apple verification endpoint, and do not grant access based on a client-supplied customer ID alone.

**Why:** An active Apple subscription was visible on an iPhone while the account remained Free; the app's restore flow expected transaction data, discarded the documented callback response, and never called server verification. Configuring Apple server credentials alone cannot repair that client/server contract mismatch.

**How to apply:** Verify entitlement server-side through the existing RevenueCat project's authenticated API after establishing a trustworthy account identity, or obtain and verify a receipt/order transaction with Apple before linking a user. Treat the native callbacks as signals to begin verification, not verification itself.

An existing project app's public RevenueCat key can read the project's iOS subscriber status through the v1 subscriber endpoint, including an anonymous subscriber's active Apple product. That verifies the subscription **at RevenueCat**, not the ownership of a Roster account. Never grant roles from a client-supplied anonymous ID or leave a grant without a revocation path; a unique purchase-lineage claim and renewal/refund reconciliation are required. Key *presence* is also not proof that Apple API verification works: validate the signing key can actually import and make a lookup before depending on it.

RevenueCat v1's subscriber GET is a **get-or-create** operation. Diagnostic reads of unknown IDs can create empty RevenueCat customers; restrict those checks to trusted operators and known IDs rather than treating the endpoint as a side-effect-free existence probe.

RevenueCat v2's `store_subscription_identifier` may be the **latest renewal** transaction, not Apple's stable original transaction ID. Query the subscription's transaction history in purchase-date order for the original, then search that identifier against the project's subscriptions to check lineage uniqueness. Anonymous customers may have no email attribute or Roster alias; matching their product and renewal date is not proof of Roster-account ownership.

**Why:** A known active Apple monthly subscriber's current identifier differed from its earliest transaction, and the other anonymous subscribers had no account-identifying attributes. A support repair based on the current identifier or matching dates could grant the wrong account and miss later revocations.

**How to apply:** Keep diagnostic lookups read-only until an independently attested account-to-purchase binding and source-aware renewal/refund handling are in place. Do not stage a production role change merely because an anonymous customer's subscription resembles a user's plan.

For an anonymous Apple subscriber with no account alias, explicit project-owner attribution can authorize an operator-assisted repair when the operator separately verifies the distinct original Apple transaction and RevenueCat lineage. This is an **attested** account association, not provider-proven Roster identity; never describe it as cryptographic ownership proof. A linked account remains pending until the deployed server independently confirms an active subscription against the attested purchase history.

**Why:** Anonymous RevenueCat customers lacked Roster identifiers, while the owner could identify the affected accounts and their distinct Apple plans/renewal dates. Claiming stronger identity evidence would be misleading; granting before the deployed provider check would be unsafe.

**How to apply:** Keep real customer/transaction IDs out of source control and logs. Treat payment-provider outages as unknown, preserve access only through a previously verified expiry, and keep other payment sources independent when a refunded or expired Apple period is reconciled.