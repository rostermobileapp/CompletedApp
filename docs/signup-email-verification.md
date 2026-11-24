# Mandatory signup email verification

## Requirement

Every new email/password account must enter a six-digit code sent to the signup
email before continuing. Existing confirmed-account sign-in is unchanged.
Parent-authority verification remains a separate flow with its own code policy.

## Application behavior

Both signup forms use the same registration boundary. Before account creation,
the public Supabase Auth settings must explicitly require email confirmation.
If settings are unavailable or auto-confirm is enabled, registration stops
without calling signup. Registration never falls back to password sign-in.
Unexpected auto-confirm sessions are signed out locally as defense in depth;
this is not a substitute for provider-side enforcement.

E05 cannot be dismissed to continue onboarding. It accepts six numeric digits
and requires a verified session for the entered email before reporting success.
Returning unconfirmed users can sign in to reopen E05 and request another code.

## Activation prerequisites

Live activation is **not complete**. Read-only checks found live email
auto-confirm enabled. The saved live management credential returned HTTP 401,
so no live Auth configuration or email template was changed.

Before releasing the new signup behavior, coordinate the application release
and the following settings on the actual live Supabase project:

- Require email confirmation (`mailer_autoconfirm: false`).
- Use six-digit email OTPs (`mailer_otp_length: 6`).
- Put `{{ .Token }}` in the signup confirmation email. Do not include a
  confirmation link that provides an alternative to entering the code.
- Verify custom SMTP or an approved send-email hook can deliver to real
  signup addresses. Do not assume the default test sender supports public signup.
- Preserve unrelated templates, provider settings, existing accounts and
  parent-verification controls.

Do not publish the application changes alone while live auto-confirm is still
enabled: the intentional preflight guard will pause new registrations.
Do not treat provider settings as an application deployment or assume a code
rollback restores provider configuration.

With explicit approval for a test recipient, complete one real-inbox signup,
verify the code is six digits, confirm that incorrect and expired codes do not
activate the account, and verify existing-account sign-in. Until then, do not
claim live delivery or end-to-end provider acceptance.

## Offline verification

- `npx tsx scripts/verify-signup-provider-preflight.ts`
- `npx tsx scripts/verify-signup-email-verification.ts`
- `npx tsx scripts/verify-signup-age-screen.ts`
- `npx tsx scripts/verify-onboarding-auth-light.ts`

These checks use synthetic boundaries and send no email or registrations.
