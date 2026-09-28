---
name: Google Play order recovery
description: Recovery limits when a Play subscription was recorded under a RevenueCat anonymous customer rather than a Roster user.
---

Google Play's read-only orders.get can resolve a GPA order number to a purchase token. The token can then be checked with subscriptionsv2.get for current entitlement. RevenueCat customer search can match a Play order to a customer; Google Play's obfuscatedExternalAccountId may be the base64 SHA-256 of that RevenueCat anonymous customer ID. This confirms a provider-side purchase lineage, **not** ownership by a particular Roster account.

**Why:** A real, active Play purchase can be bound to an anonymous RevenueCat identity while a signed-in Roster user has no linked Play claim. The GPA number is visible on a receipt or screenshot and is insufficient authority to transfer the entitlement or grant a tier.

**How to apply:** Keep order lookup and account linking separate. Compare provider ownership and existing claims before any repair. If a native bridge omits the purchase token, its current anonymous RevenueCat customer ID can be checked against the SHA-256/base64 binding returned by Google's subscription API for that order's token. Require that match, a currently active verified Play product, and an unclaimed token before linking; never grant or move access solely from a supplied order ID. Do not automatically log the device into a different RevenueCat customer before checking its original anonymous identity.