# Remembered parent approval: native acceptance

## Observed on the installed app

The owner performed the guided check on a **Google Pixel**, app version
**3.1.3**, and reported a second parent-code prompt **only after reopening the
app**. The exact Pixel model, Android version, and deployed frontend/backend
revisions have not been established. This is owner-reported device evidence,
not a remotely observed device session.

| Check | Outcome |
| --- | --- |
| Initial parent email approval and Family continuation | Owner indicated the additional prompt appeared only after reopening |
| Close from Android recent apps, reopen, return to Family | Failed: another code requested |
| Back to Home and return to Family after reopening | Not independently established |
| Separate password-purpose proof on the phone | Not yet tested; no password was changed |
| Other supported native phones | Not yet tested |

## Reproduced code defect and scoped fix

The request client previously prepended `VITE_API_BASE_URL` to every API request.
When this points to a separate backend origin, verification bypasses the
frontend's `/api` proxy. Fetch's default same-origin credential policy does not
save that cross-origin response's parent cookie. Remembered-device requests
likewise cannot use the frontend's first-party cookie through a direct backend
request.

Parent-verification requests now use the existing same-origin proxy. Other API
requests carrying remembered-parent metadata use that proxy as well. Unrelated
requests retain their configured backend. The separate password mutation also
uses the proxy; its fresh, short-lived password-purpose proof is still required.
No cookie or verification requirement was relaxed.

This defect was reproduced locally using the **actual request client**, with
synthetic authentication and two loopback HTTP origins. Before the fix, the
test failed because no parent cookie was saved. After the fix, cookie delivery
and metadata survive closing and relaunching Chromium with a persistent profile.
The test does not use exported/restored browser storage to simulate reopening.

The earlier screen/SQL fixture replaces the request client and therefore does
not cover this routing configuration. Both fixtures remain useful but establish
different things.

## Verification

- `npx tsx scripts/verify-parent-cookie-transport.ts`: passed after failing
  against the original implementation.
- `npx tsx --test client/src/lib/apiRequestUrl.test.ts client/src/lib/parentVerificationSession.test.ts server/tests/parentDeviceTrust.test.ts server/tests/highSchoolParentSecurity.test.ts`:
  32 tests passed.
- `npx tsx scripts/verify-parent-device-ui.ts`: 36 checks passed with disposable
  local PostgreSQL and synthetic Auth/mail.
- `npm run build`: passed.
- `npm run check`: failed with errors in untouched files; no diagnostics were
  reported for the changed client files. This is not a passing project typecheck.

## Release and remaining acceptance

The code fix has **not** been pushed or published. The Vercel connection did not
provide access to the app's release metadata, so the installed app's frontend
revision remains unconfirmed. The local defect has not yet been established as
the cause of the Pixel failure.

After an owner-authorized frontend release, repeat the Pixel check without
signing out or clearing app data: approve once, continue to Family without
creating/editing child profiles, close/reopen, return to Family, select Back to
Home, and return to Family again. Confirm separate password verification is
still required without changing or resetting a password. Record the OS and
frontend revision, then repeat on the other supported native platform.

Do not request more verification emails, alter accounts, create real child
profiles, send messages/pushes, or publish without the required owner approval.
Native acceptance remains **incomplete** until those observations are recorded.
