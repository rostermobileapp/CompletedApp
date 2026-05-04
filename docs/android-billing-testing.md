# Android Billing — Testing Guide

End-to-end testing instructions for the Google Play Billing integration added
to the Roster app's Android build. iOS (StoreKit) and web (Stripe) flows are
unchanged and aren't covered here.

---

## What was wired up

- Android purchases go through the same Natively / RevenueCat bridge that
  iOS uses (`np.purchasePackage(packageId, cb)`), so no new IAP package was
  installed.
- The client sends the resulting Google Play **purchase token** to a new
  server route, **`POST /api/iap/verify-google`**, which:
  1. Verifies the token against the Google Play Developer API
     (`purchases.subscriptionsv2.get`).
  2. Confirms the subscription state is active / in grace period.
  3. Acknowledges the purchase if Google hasn't seen acknowledgement yet
     (required within 3 days or Google auto-refunds).
  4. Maps the Play SKU to a role (`player_pro` / `commissioner`) and updates
     the user record + Supabase metadata, using the same `applyIapRole`
     helper the Apple flow uses.
- Stripe checkout buttons are hidden when the app detects the Natively
  Android shell. Subscriptions on Android can only be purchased via Google
  Play, per Play Store policy.
- Real-Time Developer Notifications (RTDN) are **not** wired up yet — see
  the TODO at the top of `server/googleIap.ts`. Until then, cancellations
  and refunds reconcile lazily on the next app open / Restore Purchases tap.

## One-time prerequisites

1. **Replit Secret** — paste the Google Cloud service account JSON (the same
   one already linked to RevenueCat) into a single secret named
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. The whole JSON object goes in as the
   value (Replit handles multi-line strings fine).
2. The service account must have been granted the **"View financial data,
   orders, and cancellation survey responses"** + **"Manage orders and
   subscriptions"** permissions in Play Console → Users and permissions.
   (You set this up during the RevenueCat work; just confirming it's
   sufficient — the Play Developer API needs both Get and Acknowledge
   scopes on subscriptions.)
3. **Play Console → Setup → License testing** — add the Gmail address(es)
   you'll be testing with. License testers can buy subscriptions without
   being charged real money and can renew on a compressed schedule (5
   minutes = 1 month).
4. Confirm the four subscription products are **Active** in
   Play Console → Monetisation setup → Subscriptions:
   - `player_pro_monthly`
   - `player_pro_yearly`
   - `commissioner_monthly`
   - `commissioner_yearly`

## Confirming the build was uploaded

After BuildNatively pushes the next Android build:

1. Go to **Play Console → Testing → Internal testing**.
2. Open the latest release and confirm the **Version code** and **Version
   name** match what BuildNatively reported.
3. Scroll to **Testers** and grab the **Copy link** under the testers list
   (looks like `https://play.google.com/apps/internaltest/...`). This is the
   one-tap install link for testers.

## Installing on a real Android device

Required because Google Play Billing **does not work on emulators or
sideloaded APKs** — purchases will fail with `BILLING_UNAVAILABLE`.

1. On the Android device, sign into the Play Store with the same Gmail
   you added to License testing.
2. Open the internal testing link from above in the device's browser.
3. Tap **Become a tester** → **Download it on Google Play**.
4. Install the app from the Play Store entry (not from a sideloaded APK).
5. Open the app once you see "You are a tester" in the Play Store entry.
   Propagation can take 5–15 minutes after the build is uploaded.

## Test cases

### 1. Subscribe → entitlement applies in app

1. Sign into the app with a free-tier test account.
2. Open **Profile → Manage Subscription**.
3. Confirm:
   - The Stripe "Subscribe via Roster" button is **not** visible.
   - Each plan card shows a price (formatted by Google Play, e.g. `$3.99`
     or `₹299` depending on locale).
   - Restore Purchases is visible.
4. Tap **Subscribe via Google Play** on Player Pro Monthly.
5. The Google Play sheet appears showing `$0.00 (Test card, always
   approves)`. Tap **Subscribe**.
6. Sheet closes, app shows a success toast, page reloads.
7. Confirm the **Current Plan** card now reads "Player Pro".

### 2. Entitlement applies in Supabase

1. In the Replit shell run a one-off query (or use the database skill in
   the agent) to confirm the user record:
   ```
   SELECT id, role, iap_original_transaction_id, last_updated
   FROM users
   WHERE id = '<your-test-user-id>';
   ```
2. `role` should be `player_pro`. `iap_original_transaction_id` should
   contain the Google Play purchase token (long base64-ish string).
3. Open Supabase → Authentication → Users → the test user → **User
   Metadata** should show `"subscription_tier": "player_pro"`.

### 3. Cancel from Play Store → cancellation propagates

1. On the device, open **Play Store → Profile icon → Payments &
   subscriptions → Subscriptions**.
2. Tap **Roster** → **Cancel subscription** → confirm.
3. Reopen the app. The plan card will still show "Player Pro" until either:
   - The current period expires (license testers cycle in ~5 minutes), OR
   - The user taps **Restore Purchases** (re-runs verification, picks up
     the new `subscriptionState` from Google).
4. After the period expires, on next app open the role auto-syncs back to
   `free_tier`. Confirm in the DB and Supabase metadata.
5. **Known limitation** until RTDN is wired up: between cancellation and
   the period expiring, we still treat the user as Player Pro, which
   matches Google's own entitlement model (cancelling only turns off
   auto-renew; the user paid for the period).

### 4. Restore Purchases (after reinstall)

1. Uninstall the app, reinstall from the same internal testing link.
2. Sign in with the same account.
3. Open **Profile → Manage Subscription** while still on free_tier.
4. Tap **Restore Purchases**. The role flips back to `player_pro` if there
   was an active subscription, or shows "No purchases found" otherwise.

## Reading RevenueCat event logs

The RevenueCat dashboard is the easiest place to see whether the purchase
fired correctly inside the bridge:

1. Go to **app.revenuecat.com → your project → Events**.
2. Filter by **Store: Play Store**.
3. Look for the event matching your test user. You should see, in order:
   `INITIAL_PURCHASE` → (later) `RENEWAL` → (after cancel) `CANCELLATION`
   → (after expiry) `EXPIRATION`.
4. Click the event to see the raw payload — useful when our server says
   `Subscription is not active` but the user thinks they're subscribed.

If a purchase succeeded in Play Console but no event appears in
RevenueCat, the Natively Android container probably isn't configured with
the RevenueCat Android API key. Check with BuildNatively that the build
was packaged with the Android API key set. (We don't reference that key
from JS code; it's compiled into the native shell.)

## Common errors

| Symptom | Most likely cause | Fix |
| --- | --- | --- |
| `ITEM_UNAVAILABLE` on the very first test after creating a product | Play Console propagation delay (typically 2–6 hours, can be up to 24h) | Wait. Verify the product status is **Active** and at least one base plan is **Active** as well. |
| `BILLING_UNAVAILABLE` | Tester Gmail isn't in License testing OR app was sideloaded | Add the account to **Play Console → Setup → License testing** and install via the Play Store internal testing link, not an APK. |
| `USER_CANCELED` | User dismissed the Play sheet | Expected — client treats this as a soft cancel and shows no error toast. |
| `Google Play API not configured on server` (HTTP 503) | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret is missing or unparseable | Re-paste the JSON into Replit Secrets. Confirm it parses with `JSON.parse`. |
| `Google Play verification failed (401)` | Service account lost API access, or the wrong project's service account is used | In Play Console → Users and permissions, re-grant the service account access to this app, including **View financial data** and **Manage orders and subscriptions**. |
| `Google Play verification failed (404)` for a brand-new purchase token | Play Developer API can lag a few seconds behind the purchase | Retry once after a 2-second delay; if it persists, the token is wrong. |
| `Unrecognised product: <sku>` | Play Console SKU doesn't match `GOOGLE_PLAY_PRODUCT_ROLES` in `server/routes.ts` | Either rename the SKU in Play Console or add it to the role map. |
| Subscription bought but `role` in DB still `free_tier` | `applyIapRole` failed silently OR the verify endpoint returned non-2xx | Check server logs for `[GoogleIAP]` lines around the purchase time. |

## File reference

- `client/src/lib/nativePurchases.ts` — `purchaseProductAndroid`, `restorePurchasesAndroid`, `getAndroidProducts`, `isAndroidBillingSupported`.
- `client/src/pages/Subscription.tsx` — Android branch + Stripe-button hiding.
- `server/googleIap.ts` — Play Developer API client + verification helpers.
- `server/routes.ts` — `POST /api/iap/verify-google` route + `GOOGLE_PLAY_PRODUCT_ROLES` map + `GOOGLE_PLAY_PACKAGE_NAME` constant.
