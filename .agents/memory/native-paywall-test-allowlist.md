---
name: Native paywall test allowlist
description: Operational rule for testing first-sign-in paywalls without enabling them globally.
---

Before declaring a new native test account ready, verify that the production single-account paywall allowance targets that account. Keep the global paywall gate off until the purchase, restore, entitlement, and UI-unlock paths are verified on both platforms.

**Why:** Deleting a previously allowed tester left the server targeting a nonexistent account. A new free account reached step 9 but the offer was not enabled for it, and the old UI silently showed only Continue.

**How to apply:** Confirm the new test account's identity, retarget only its stable RevenueCat ID, verify the server deployment, and make ineligible/disabled outcomes visible rather than treating them as successful presentation.