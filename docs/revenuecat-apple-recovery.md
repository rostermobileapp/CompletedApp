# Recovering Apple purchases with missed RevenueCat webhooks

Restore purchases and `/api/iap/refresh-apple` (also `/api/iap/sync-apple`)
fetch current RevenueCat status for the signed-in user's server-derived iOS ID.
If the original purchase link is missing, they read RevenueCat's historical
customer events, even when those events were never delivered to a webhook.

Only a production App Store event with the same product and **exact current
transaction** as the freshly verified subscription can supply the **original**
Apple transaction. Current entitlements/expiration determine access; historical
event entitlements, aliases, cancellation state and expiration never grant it.
Normal unsubscribe retains access until its paid-through expiration.

## Configuration

Keep the existing `REVENUECAT_API_KEY` for v1 subscription verification.
Add these in the environment that actually runs the backend:

- `REVENUECAT_V2_API_KEY`: a RevenueCat v2 secret key for the same project,
  with `customer_information:customers:read` permission.
- `REVENUECAT_PROJECT_ID`: that project's ID.

V1 keys cannot read the v2 history API. The Replit connection can be used for
operator diagnostics, but its authorization is not automatically available to
the Railway deployment. Never copy credentials into source or chat.

Keep the authenticated webhook enabled for all applicable subscription events
(not just RENEWAL), including INITIAL_PURCHASE, CANCELLATION, EXPIRATION,
BILLING_ISSUE, UNCANCELLATION, PRODUCT_CHANGE and TRANSFER. Webhook configuration
does not retroactively deliver historical events.

## Operator backfill

Run with the intended backend's database, SESSION_SECRET and RevenueCat
configuration. A different SESSION_SECRET derives different purchase IDs.

```sh
npx tsx scripts/backfillRevenueCatApple.ts --user U#####       # preview
npx tsx scripts/backfillRevenueCatApple.ts --user U##### --apply
npx tsx scripts/backfillRevenueCatApple.ts --all               # preview all
npx tsx scripts/backfillRevenueCatApple.ts --all --apply
```

Preview does not insert claims, reconcile roles, sync auth metadata or initialize
tables. It checks for existing customers through v2 before v1 lookup, avoiding
the v1 get-or-create side effect for unknown accounts. `verified_candidate`
means the provider evidence passed, not that an ownership conflict can be
bypassed. Apply re-fetches the provider and uses the existing atomic,
globally unique original-transaction claim and subscription reconciler.
Existing Apple links (including operator-attested/direct-Apple links) are
preserved and skipped; their existing reconciliation job maintains access.
No arbitrary customer IDs or transaction IDs can be supplied to this script.
Per-account failures are reported without stopping other accounts and yield a
nonzero exit code.

No recovery transfers an existing Roster claim. Conflicts require review.
The existing periodic reconciliation continues to handle expiration, refunds
and independent Stripe/Google access. A provider outage cannot create access.
