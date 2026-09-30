---
name: RevenueCat native identity
description: Cross-platform purchase identity and safety boundaries for Natively-managed RevenueCat.
---

Use one stable, server-issued opaque App User ID across iOS and Android. Preserve existing purchasers' assigned IDs rather than silently deriving a new one. The user chose to make onboarding purchases follow the existing Subscriptions page's native account-link and store-sheet sequence rather than leave Continue blocked pending a new native bridge method.

**Why:** The user confirmed that the existing Subscriptions purchase bridge works and explicitly requested that same behavior from onboarding. This changes the earlier fail-closed onboarding decision, but does not settle the identity ambiguity: RevenueCat's original anonymous ID can remain on a subscriber after login, and the wrapper may report it even when a custom subscriber exists. A device hash match to the subscriber's original ID did not establish the SDK's current purchase identity.

**How to apply:** Onboarding uses the shared Subscriptions account-link step: native login followed by exact `customerId()` read-back; only then may the selected in-app store sheet open. Do not describe that value as a proven SDK-current `appUserID`. Keep the server verification tied to the account captured before purchase, and never grant access from a purchase callback alone. Avoid adding automatic logout, original-ID/hash-based authorization, or cross-account aliasing as a fallback. An authoritative current-ID bridge remains the preferred long-term fix; test actual device behavior before declaring this flow verified.