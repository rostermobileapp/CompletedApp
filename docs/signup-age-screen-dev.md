# Separate age screen — DEV onboarding

This change stays within isolated DEV onboarding. Production signup and
existing adult onboarding steps are unchanged.

- The signup form collects email/password without an age question.
- Tapping Sign Up opens the separate reference-matched age screen, with no
  progress count and no default selection.
- Back restores the signup form without losing the entered credentials.
- Continue stays disabled until a selection is made.
- **Yes:** creates the account through the existing signup handler, with
  `signup_age_answer: "adult"` in Supabase account metadata. Referral metadata,
  existing session handling, and email verification are preserved. Ordinary
  later sign-ins do not enter the age screen.
- **No:** clears the pending credentials and opens the existing Under 18 parent
  screen. No signup request or minor account is created. As explicitly chosen
  by the owner, No therefore is not saved on a nonexistent account.
- A tab-scoped parent-required navigation flag blocks roles, the questionnaire,
  cached adult content, and new account prefetches after No, including after
  reload. A fresh explicit adult continuation or successful existing-account
  sign-in clears it. This flag contains no credentials and is not age proof,
  authentication, parent authority, or permission to access child information.

Both the standalone login page and the shared authentication dialog use the
same screen, rebuilt using the existing screen/button components.

## Review

Open `/high-school/onboarding-preview?screen=age` in the DEV preview.
This is a screen simulation, not a registration.

The signed-out DEV preview homepage now starts with the actual signup form in
simulation mode, followed by the age screen and memory-only onboarding.
`/high-school/onboarding-preview?screen=signup` opens the same complete review
even when signed in. Enter example credentials; neither signup nor sign-in
contacts authentication in this simulation. No opens parent handling, and Back
lets you return to signup and try Yes. Signed-in users retain their normal
homepage outside this explicit preview route.

## Verification

- Six offline browser journeys exercised the actual Login and AuthModal,
  including layout measurements, Back, No without registration, adult answer
  metadata, preserved referral metadata, error retry, and later sign-in.
- Two unit checks covered tab restriction persistence and storage failure.
- Fourteen actual-router fixture checks passed, including the complete DEV
  homepage signup/age preview without any Auth or API calls, direct under-18
  route attempts, reload, cached adult content, and existing parent boundaries.
- Production build passed. The repository-wide TypeScript check still has
  pre-existing errors; the changed age/signup modules added none.

Provider SDK behavior, real email delivery, and native two-phone acceptance
were not exercised. No real registrations, messages, purchases, production
schema changes, or provider configuration changes were made.
