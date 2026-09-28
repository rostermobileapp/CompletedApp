---
name: Google Play billing readiness
description: Why native subscription products and server-side purchase activation must be validated independently.
---

Do not treat a price returned by a native Google Play/RevenueCat bridge as evidence that the app can activate the resulting purchase. The native billing configuration and the server's Android Publisher verification credential are separate external prerequisites; a management OAuth connection also must not be assumed to configure the app runtime.

**Why:** During an Android upgrade outage, the native product lookup was inconclusive, while the workspace definitely lacked the credential required by its Google Play verification endpoint. A successful native charge without functioning server verification could leave a buyer without access.

**How to apply:** Check product discovery, the server verification capability, and an actual license-tester purchase/restore independently. Fail closed before payment when verification is unavailable; do not replace native checkout with an unreviewed off-store flow.

An "already subscribed" result from Google Play or an active-product list from the native bridge is not enough to attach that purchase to a Roster account. The restore bridge may show an entitlement but omit the purchase token needed by the Play Developer verification endpoint. Do not sell the same product again, and do not turn the unverified entitlement into access.

**Why:** A single Roster account can also have an independent Stripe Commissioner subscription while the device's Play account owns Player Pro. Buying Player Pro again cannot downgrade the Stripe plan; assuming either payment source implies the other risks duplicate charges or false access.

**How to apply:** Show separate management paths for Roster/Stripe and Play subscriptions. Verify and record the Play purchase before relying on it for a tier switch; if restore cannot supply proof, provide an explicit support path rather than a retry purchase loop.

Refreshing a Stripe subscription must not write Stripe's tier directly over a higher, active, verified store entitlement. Resolve the effective role across independent payment sources on every sync path, not only on cancellation or purchase verification.

**Why:** A page-load Stripe refresh can otherwise erase a previously verified Google Play Commissioner upgrade while the Google claim remains valid.

**How to apply:** When adding or changing a billing-provider sync, test cross-provider precedence (for example, Play Commissioner plus Stripe Player Pro) and absence/expiry of the verified claim.