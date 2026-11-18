---
name: Signup attribution policy
description: Owner-approved first-valid referral handling, campaign/credit separation, manual install fallback, and split review boundary.
---

Keep the first valid pending referral and never automatically replace a saved
partner. A URL code preselects an approved partner for explicit user confirmation;
keep manual partner selection as the install fallback.

**Why:** The owner approved attribution as a separate reviewable change before
the website/app split, with existing partner credit protected.

**How to apply:** Validate referral codes and atomically preserve existing canonical
referral records. Campaign/UTM context is informational account metadata, never
partner-credit or payout authority. Preserve HPIB view/store-tap tracking.

Do not add paid deferred deep linking or claim ordinary query parameters survive
an app-store installation.

**Why:** The owner explicitly chose a manual fallback rather than a new paid
service. Deferred linking may be mentioned only as an optional future release item.

**How to apply:** Test WEBSITE-to-APP URL handoff separately from post-install
manual selection. Do not substitute an isolated browser/auth fixture for a real
email-confirmation or installed-device check.
