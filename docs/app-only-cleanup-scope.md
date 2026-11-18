# APP-only cleanup review

This is a proposed scope, not authorization to implement or delete files.
The independent WEBSITE was imported and verified as reported by its Agent.
Its website-only dependency fixes are authoritative; the original handoff ZIP
must not overwrite that project.

## Findings

The previous list contains 64 review entries:

| Group | Count | Reviewed disposition |
| --- | ---: | --- |
| Source candidates | 34 | Conditional removal only after imports, routing, build and dependent tests are resolved |
| Public files | 25 | Retain all in this pass, including logos/images and the marketing crawl file until replacement routing/build is verified |
| Partner form/navigation/styles | 4 | Retain until an APP-owned form and its styling replace their imports |
| HPIB campaign page | 1 | Keep permanently, including its tracking and handlers |

The APP still imports marketing pages directly, has signed-out marketing root
routing, and runs website prerendering during its build. Therefore deleting the
listed components first would break imports/builds or leave incorrect entry HTML.

The public application currently shares the full PartnersPage module and
RosterPageNav styling. Its `applicationOnly` presentation does not eliminate
static imports. A small form extraction must precede any removal of those files.

The legacy FunFeaturesShowcase component has an existing test that reads its
source and stylesheet. It is not safe to delete that component without addressing
the website-specific test. Retain it if the test disposition is unresolved;
do not silently delete meaningful APP feature coverage.

## Proposed implementation

1. Extract the existing public APP application, preserving its appearance,
   field names, upload rules, same-origin multipart processing, validation,
   retry and confirmation. Keep backend/email/verification/portal behavior.
2. Switch APP root to its existing login/home/onboarding entry and remove
   marketing rendering/imports. Preserve push/deep-link/saved-screen priority.
3. Add actual HTTP 301s to the canonical WEBSITE for:
   `/features`, `/line-combos-predictions`, `/rosterhockey-vs-benchapp`,
   `/rosterhockey-vs-teamsnap`, `/rosterhockey-vs-rosterlytic`, `/pricing`,
   `/about`, `/hockey`, `/for-youth-teams`, `/for-adult-leagues`, `/for-varsity`,
   `/referral-program`, `/faq`, `/support`, and `/contact`.
   Preserve queries and redirect same-path, not through a broad fallback.
4. Keep `/privacy`, `/privacy-policy`, `/terms-of-service` in APP; add `/terms`
   as an alias of existing terms. Exclude auth, all partner application/
   verification/portal/admin paths, APIs and native association routes from
   marketing redirects. Keep `/hpib` and all campaign tracking in APP.
5. Replace website prerendering and marketing metadata/crawl output in the APP
   build with APP-owned output. Preserve approved noindex policy with exceptions
   only for actual existing login/signup pages; do not invent a signup route.
6. Remove only disconnected source candidates after checking retained imports
   and resolving affected tests. Keep shared presentation, legal, styles and all
   APP features. Re-scan before each coherent deletion batch.

The actual APP server must implement redirects; a Vercel-only configuration test
is not sufficient evidence for an APP served by a different hosting runtime.

## Explicit exclusions

- No public-file, image, logo, badge, font, uploaded-file or storage deletion.
  In particular, no blanket deletion of the marketing folder or attached assets.
- No dependency changes/uninstalls. Mapping, animation and icon libraries may
  still serve APP features even when a marketing component used them.
- No database/schema/data, auth-provider, billing, emails, push, worker,
  analytics-history, native identifier or association-file changes.
- No redesign, new authentication/signup system or legal-content rewrite.
- No changes to the new WEBSITE project or its dependency fixes.
- No publishing, hosting/DNS/domain changes or production data operations.
- Retain the historical export/migration tooling for now; retiring it is
  separate from deleting product runtime components.

## Verification and release boundary

Verify signed-out and signed-in entry where possible; onboarding and protected
destinations; public form with intercepted submissions; legal aliases; all exact
HTTP redirects and query retention; real unknown 404s; crawl/initial HTML; native
association MIME/body; production build and mobile/desktop layout.
Report authenticated/native checks that cannot be exercised without bypassing
security. Compare APP type errors with the existing 227-error baseline rather
than claiming a clean APP typecheck.

Do not publish the eventual APP-only cleanup while the live website still relies
on this combined deployment. Preserve the current additive APP prerequisite
checkpoint: it can be separately approved for release first, retaining marketing,
so the WEBSITE has working app-owned application/attribution destinations.
Then publish/cut over and verify the independent WEBSITE under separate approval.
Only afterward consider publishing the APP-only cleanup.

Detailed conditional file dispositions are in
`docs/app-only-cleanup-candidates.csv`, with a downloadable copy at
`generated-artifacts/website-review/reviewed-app-cleanup.csv`.
