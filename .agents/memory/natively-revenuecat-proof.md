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

Native account login is a supported Natively operation. Automatic checkout must use an opaque identity issued only to the authenticated account, confirm the native identity before charging, and derive that same identity on the server. Public user IDs or subscriber attributes are not authentication. Native callback success is still not entitlement proof.

**Why:** The documented bridge can associate purchases before checkout but does not return signed Apple proof afterward. An opaque association makes a server-side provider lookup account-specific without accepting an arbitrary anonymous customer ID.

**How to apply:** Verify current provider entitlement and independently resolve Apple's stable original transaction; never claim the latest renewal ID as the original. Preserve both original-lineage ownership and source-aware revocation. Signing-key readiness must be checked before allowing a new purchase; a misconfigured verifier must not charge the customer first. Identity-key rotation requires explicit handling of existing purchase associations rather than silently changing their owner.

An account's current role is the combined result of all billing sources, not proof of any individual provider's tier. Save a Stripe baseline only from an explicitly Stripe-verified update, and tie it to that subscription rather than trusting the aggregate role.

**Why:** An Apple upgrade can make the account Commissioner while its Stripe subscription remains Player Pro. Reusing that aggregate role as Stripe's baseline would retain Commissioner after Apple ends; treating generic role changes as Stripe evidence can overwrite the actual Stripe tier.

**How to apply:** Resolve live independent claims together, persist the resolved role even when it is lower, and fail explicitly when a billing update is skipped. Verification must check the persisted result, not just a successful pure role calculation. Refresh Stripe baselines on every verified Stripe update, including retained expired/refunded Apple links: those links still reconcile, and an old baseline can undo a later legitimate Stripe upgrade or downgrade.