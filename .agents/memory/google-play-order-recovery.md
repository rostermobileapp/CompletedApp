---
name: Google Play order recovery
description: Recovery limits when a Play subscription was recorded under a RevenueCat anonymous customer rather than a Roster user.
---

Google Play's read-only orders.get can resolve a GPA order number to a purchase token. The token can then be checked with subscriptionsv2.get for current entitlement. RevenueCat customer search can match a Play order to a customer; Google Play's obfuscatedExternalAccountId may be the base64 SHA-256 of that RevenueCat anonymous customer ID. This confirms a provider-side purchase lineage, **not** ownership by a particular Roster account.

**Why:** A real, active Play purchase can be bound to an anonymous RevenueCat identity while a signed-in Roster user has no linked Play claim. The GPA number is visible on a receipt or screenshot and is insufficient authority to transfer the entitlement or grant a tier.

**How to apply:** Keep order lookup and account linking separate. Compare provider ownership and existing claims before any repair. Require independent account-binding proof, such as a store-issued token returned in the signed-in app's restore flow or a separately verified provider/account recovery process; never grant or move access solely from a supplied order ID.