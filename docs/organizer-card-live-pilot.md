# Restricted live organizer-card rollout

## Access

- Production access is limited to server-loaded display IDs **U00001** and **U00002**.
- Both the payer and actual invoice organizer must be in the pilot.
- U00001 has a founder-only collection entitlement even while fee-exempt.
- Other organizers still require their own qualifying paid membership and must not be fee-exempt.
- Nobody receives subscription benefits from a fee payment, refund, Connect setup, or the founder exception.
- Stripe onboarding and receiving-account verification remain mandatory.
- Existing cash, Venmo, Cash App, and manual tracking remain available to non-pilot accounts.

## Database

Production uses external Supabase, not Replit-managed PostgreSQL. The explicit migration command is:

```sh
NODE_ENV=production npx tsx scripts/apply-production-card-payments.ts --apply-live-pilot-schema
```

The command checks the production target against the configured production Supabase project and rejects the development project. It applies only the organizer-card schema migrations, with short lock limits and a transaction. It does not copy development data, create charges, enable collection, or change account roles. It refuses an unreviewed migration over existing production card transactions.

Never run it as a build or startup hook.

## Railway configuration

Use the existing **CompletedApp** production service. Do not create another deployment or replace existing subscription billing configuration.

Configure these through Railway's secure variable controls:

| Variable | Requirement |
| --- | --- |
| `STRIPE_SECRET_KEY` | Existing live secret key for the intended Stripe platform account. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Matching `pk_live_` publishable key, present when the frontend is built. |
| `STRIPE_CARD_PAYMENTS_WEBHOOK_SECRET` | Signing secret for the dedicated live platform-payment endpoint below. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for the separate live connected-account endpoint below. |

Do not replace or reuse `STRIPE_WEBHOOK_SECRET`; it belongs to the existing subscription flow. Test signing secrets cannot verify live events. Never paste credentials into chat or commit them.

### Platform-payment endpoint

`https://completedapp-production.up.railway.app/api/stripe-card-payments-webhook`

Create a **live, platform/your-account** event destination for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_withdrawn`
- `charge.dispute.funds_reinstated`

### Connected-account endpoint

`https://completedapp-production.up.railway.app/api/stripe-connect-webhook`

Create a separate **live, connected-accounts** event destination for `account.updated`.

Endpoint paths alone do not prove correct event scope or signing-secret configuration.

## Activation order

1. Verify the production schema migration succeeded.
2. Configure the matching live keys and both event destinations, leaving collection disabled.
3. Publish the new gated source build through the existing GitHub/Railway release workflow.
4. Confirm that the deployed revision contains the two-account server restrictions. Do not merely redeploy an older image.
5. Only then set `ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED=1` in Railway production.
6. Have the participating accounts complete Stripe onboarding and verify actual account-event delivery. If they choose to make a payment, confirm the corresponding live payment event settles the invoice.

No automated verification should create a real charge. Browser/native user-agent simulations do not verify installed iOS/Android bank-app switching or OS return links.

## Pause the pilot

Remove `ORGANIZER_CARD_PAYMENTS_LIVE_ENABLED` or set it to `0` to disable the card flow. This does not undo Stripe charges or transfers. Because this switch also pauses card webhook processing, monitor Stripe's pending deliveries and reconcile legitimate in-flight payments before treating a paused rollout as financially settled. Do not change subscription keys or erase payment history.
