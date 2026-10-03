---
name: Store billing authority
description: Approved Natively billing authority, native identity semantics, and preserved store ownership boundaries.
---

On 2026-10-02 the owner explicitly chose “Repair the existing Natively flow” and permitted RevenueCat's server-verified subscription status to update Roster tiers. This supersedes the earlier reporting-only restriction.

**Why:** Natively's documented native purchase infrastructure uses RevenueCat and does not promise raw Google purchase tokens or Apple transactions in its JavaScript callbacks. A strict store-only rewrite was incompatible with that contract.

**How to apply:** Keep Roster login separate. Use authenticated, server-derived purchase identities and server-verified subscription records; preserve canonical ownership claims and the direct-store proof route's safeguards. Native callback success, arbitrary anonymous IDs, aliases, and attributes alone never grant access.

The owner reports that native purchases worked before the recent changes and supplied Natively's configured iOS/Android purchase settings plus its official purchases documentation.

**Why:** This is a regression report, not evidence of an unconfigured store. Natively documents RevenueCat as its native purchase/receipt/subscription infrastructure, not merely a sales dashboard.

**How to apply:** Compare earlier billing code and recent identity gates before asking for new keys, store setup, or a rebuild. Do not equate RevenueCat's original anonymous customer ID with the current SDK appUserID; validate its relationship through the authenticated account's provider record, never by looking up a client-chosen customer.

The documented Natively purchase/restore callbacks may omit store transaction proof; the JavaScript wrapper alone cannot establish what an installed native shell returns.

**Why:** Public success/package/customer callback documentation is not evidence that a specific installed shell exposes a Google purchase token or an Apple transaction/JWS.

**How to apply:** Require sanitized field/type evidence from supported installed builds and record real device checks separately from mocked tests. Do not fabricate store proof or weaken ownership checks; use supported authenticated server recovery when callbacks omit proof.

Direct store transaction proof after payment is not sufficient to establish pre-payment native account binding.

**Why:** The direct Apple proof path requires an account-bound first transaction, but stock Natively cannot pass an appAccountToken through purchasePackage. Its separate named-customer flow uses authenticated server subscription lookup and canonical Apple lineage.

**How to apply:** Confirm native association and server verification readiness before checkout. Keep the direct-proof route's account-token safeguards, and do not confuse it with the approved Natively named-customer recovery path.

Existing operator-attributed lineages remain historical ownership claims. Preserve their original identity, refresh/revoke through their established source, and preserve independent billing sources.

**Why:** Anonymous historical purchases lacked Roster aliases; attribution was attested rather than cryptographically proven. Deleting those claims or replacing their identity can strand customers.

**How to apply:** Never automatically transfer Roster claims, force provider alias changes, or manually grant production access. Native restore should be a deliberate user action, not a page-load or repeated polling side effect.

An aggregate account role is not proof of one billing source's tier. Preserve only an explicitly Stripe-verified baseline tied to that subscription.

**Why:** An Apple Commissioner upgrade over Stripe Player Pro previously risked saving the aggregate Commissioner role as a Stripe baseline, retaining access after Apple ended.

**How to apply:** Resolve live independent claims together, keep subscription-specific baselines, and validate the persisted role before showing success.

The owner confirmed the repaired Natively Android purchase flow works on a real device, although activation took a noticeable amount of time.

**Why:** This confirms the approved existing integration is viable; delayed activation alone is not evidence that the store or native shell is unconfigured.

**How to apply:** Preserve the approved flow and ownership safeguards. After a paid purchase, compare the persisted Roster tier and RevenueCat entitlement before recommending a retry; never suggest paying again to resolve a delay.

RevenueCat v1 subscriber GET is get-or-create, not a side-effect-free existence probe.

**Why:** Diagnostic reads of unknown IDs can create empty customers.

**How to apply:** Restrict reporting diagnostics to known IDs and trusted operators. Do not probe arbitrary customer identifiers.

Activation needs a recovery path independent of the webview purchase callback.

**Why:** A real Apple Commissioner purchase appeared active in RevenueCat, but no post-checkout verification request reached Roster. Refreshing and force-closing did not recover access; provider notifications were arriving at an unhandled endpoint.

**How to apply:** Authenticate provider notifications, check current server-read RevenueCat status, and retain canonical ownership before activation. Never grant from webhook product/entitlement fields alone, infer ownership from anonymous aliases, or acknowledge failed verification as successful processing.

Preserve automatic downgrade when an Apple subscription's paid access ends, even if native verification is simplified.

**Why:** The owner specifically asked whether removing the additional Apple API lookup would compromise automatic downgrades after Apple cancellation. RevenueCat documents cancellation of renewal separately from expiration; a normal cancellation is not immediate loss of paid access.

**How to apply:** Keep access until verified expiration, handle refunds/revocations from current provider status, and retain independent billing-source access.

On 2026-10-03 the owner approved RevenueCat server-verified status as the authority for named-customer Apple activation and ongoing access, without a separate Apple API gate.

**Why:** A paid Commissioner subscription was active in RevenueCat while the additional Apple API lookup failed. The owner's approval explicitly depends on preserving automatic downgrades after paid access ends.

**How to apply:** First-time ownership requires the original transaction ID from an authenticated provider notification matched against a current RevenueCat transaction, not a client hint or latest renewal ID. Retain original ownership across renewals, check current expiry/refund/grace status, and preserve other billing sources. Do not replace legacy direct-Apple sources or their verification merely to simplify the named-customer path.