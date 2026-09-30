---
name: RevenueCat native identity
description: Account-linking and migration rules for Natively-managed RevenueCat purchases.
---

Use a single, non-guessable, server-issued per-account RevenueCat App User ID across iOS and Android. Preserve the already-issued opaque identity of existing Android purchasers exactly, even if the derivation secret later rotates. Sign in to this identity through the documented Natively bridge **before** presenting a paywall or starting a native purchase.

**Why:** The user explicitly chose a cross-platform opaque ID rather than an exposed or sequential Roster identifier. RevenueCat can fail to merge existing custom IDs and anonymous aliases; silently renaming an established purchaser risks orphaning paid access. Secret-derived identities can also change when a server secret rotates unless each assigned identity is retained.

**How to apply:** Treat anonymous/other legacy customers as a separate ownership-checked migration, not an automatic alias. For the new native flow, use RevenueCat's verified server-side entitlements as the paid-access authority, not Natively callback success or an additional raw store-receipt check. Preserve independent Stripe and legacy purchase access.

On 2026-09-30, an App Store-installed Natively iPad build returned an anonymous customer ID from both `login` and repeated `customerId` reads despite a successful eligibility response. The JavaScript call matches Natively's documented method signature. The root cause in that native build is unconfirmed; do not treat its callback as proof of identity or permit purchases while read-back remains anonymous. Natively documents that changes to its In-App Purchases configuration require a rebuilt native app. The user declined TestFlight testing, so real Apple sandbox purchase and restore verification remains blocked unless another confirmed sandbox-capable native build is available.