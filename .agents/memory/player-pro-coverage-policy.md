---
name: Player Pro coverage policy
description: Owner-approved payer-scoped Pro behavior and protected boundaries for mixed adult/parent accounts.
---

Personal Player Pro and Commissioner subscriptions are intended to cover the
subscriber's approved teams everywhere, including adult and High School/Youth,
and their household's eligible child profiles. The household limit remains two.
The attachment's four-profile wording was explicitly corrected to two.

League-paid Player Pro seats must cover only teams in the paying league, whether
that league is adult or High School/Youth. They must not elevate account roles,
unlock unrelated leagues, or become personal Commissioner subscriptions.
Account-level paid features with no team/league context follow personal
subscription coverage, not whichever league is selected in the dashboard.

**Why:** The owner supplied these payer-based rules for parents who also play in
adult leagues and explicitly requested audit and planning before implementation.
This supersedes the older one-sponsor-across-all-HS-leagues policy.

**How to apply:** Use the approved audit/plan as the implementation boundary.
Keep parent/device verification, membership, child safety and administrative
authority separate from payment coverage. This request does not approve code
changes, billing changes, publication or real-family activation by itself.

Preserve manual/complimentary and operational exceptions separately from proof
of a purchased personal subscription. Coverage must not reset account roles,
confer team/parent authority, or activate guarded child capabilities.

**Why:** The approved implementation explicitly excludes role resets, removal
of independent administrative access and real family activation.

**How to apply:** Keep subscription availability independent of sign-in and
free baseline access. Require separate approval for production rollout or
reconciling historical grants.

Ownership-only purchase records are not evidence of payment or expiry.
Historical Apple identifiers can also appear in Google claim ownership
backfills without a product or verified period; preserve their existing
legacy access until separately approved reconciliation.

**Why:** Ownership protection was backfilled across historical IAP identifiers,
not only verified Google subscriptions. Treating row existence as expiry
evidence wrongly removes grandfathered access.

**How to apply:** Require purchase-state evidence before denying legacy
coverage. Keep verified seats and free/support messaging independent of
unrelated personal-provider availability.

Owner-intended manual Player Pro grants must remain effective even for accounts
with prior expired subscriptions. The owner identified a manually granted
account without purchase history as the correct behavior, not an exception
to remove.

**Why:** The owner explicitly corrected the suggestion that direct manual
grants should generally be treated as invalid billing overrides.

**How to apply:** Preserve working manual grants. Distinguish deliberate grants
from subscription-derived roles without treating every paid role as permanent;
normal paid subscriptions must still expire. Production data changes and
deployment still need their own scoped authorization.

Explicit owner-controlled overrides, not edits to the shared role field, are
the reliable manual-grant mechanism for accounts with billing history. Keep the
non-complimentary billing tier separately so revoking the grant restores it.
Do not automatically convert every existing paid role into a permanent grant.

**Why:** The owner approved a separate trusted manual override after confirming
that a displayed Player Pro role did not unlock features with expired purchase
history. A role alone cannot distinguish an intentional grant from a stale
subscription mirror.

**How to apply:** Treat the override as an independent premium-access source
and a Player Pro minimum during billing updates, never as purchase proof or
administrative authority. Preserve prior working role-only legacy grants.
