---
name: Mandatory signup email verification
description: Owner requirement for six-digit email confirmation on every new email/password account.
---

Require E05 for every new email/password account, using a six-digit code sent to
the email entered at signup. Do not retain an auto-sign-in signup alternative.
This does not require re-verifying existing confirmed accounts at every login.

**Why:** The owner explicitly requested that E05 always be used to verify new
accounts, rather than appearing only when the provider happens to require it.

**How to apply:** Enforce confirmation at the Auth provider as well as in every
signup UI. A mandatory-looking dialog is not enforcement if Supabase still
auto-confirms accounts. Keep signup verification separate from the custom
four-digit parent-authority code. Coordinate provider configuration and the
application release; never claim live email delivery from offline UI tests.
