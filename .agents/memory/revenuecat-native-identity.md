---
name: RevenueCat native identity
description: Cross-platform purchase identity and safety boundaries for Natively-managed RevenueCat.
---

Use one stable, server-issued opaque App User ID across iOS and Android. Preserve existing purchasers' assigned IDs rather than silently deriving a new one. Before an onboarding purchase, require an authoritative native read-back of RevenueCat's **current** `appUserID` matching the server-issued ID; the installed Natively wrapper's `customerId()` and login callback are not authoritative.

**Why:** RevenueCat's original anonymous ID can remain on a subscriber after login, and the wrapper may report it even when a custom subscriber exists. A hash match between an affected device's anonymous ID and the subscriber's original ID was observed but could not establish the SDK's current purchase identity. The user confirmed that the existing Subscriptions purchase bridge works, which also does not establish first-sign-in identity.

**How to apply:** If current-ID read-back is absent, block paid checkout without hiding plan choices or blocking Free. On mismatch, never infer identity from a callback, original-ID hash, or `customerId()`. Do not log in an anonymous purchaser unless the native bridge can confirm it has **no purchase history**; otherwise login could transfer purchases between accounts. A safe login retry must re-read the current ID. Bind post-purchase server verification to the same account identity captured before opening the store sheet, and leave provider verification as the sole authority for access.