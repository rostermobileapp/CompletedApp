# APP-only separation result

## Status and boundaries

Implemented in this APP workspace after approval of the reviewed cleanup scope.
The separately imported WEBSITE remains authoritative; it was not regenerated,
modified, or independently re-verified from this workspace.

**Nothing was published. No DNS, host/provider settings, workspace secrets,
database/schema/data, billing, email/push processing, native identifiers,
association JSON, dependencies, or lockfile were changed.**

This cleanup must not be released before the independent WEBSITE cutover.

## Reviewed file dispositions

The original 64-entry inventory remains in
`docs/app-only-cleanup-candidates.csv`.

| Reviewed group | Result |
| --- | --- |
| 34 conditional source candidates | Removed 32 disconnected source/style files. Retained `FunFeaturesShowcase.tsx` and its stylesheet to preserve the existing component tests. Neither is imported by APP runtime. |
| Four legacy partner/navigation/style files | Removed only after the extracted APP application passed intercepted upload, validation, retry, and confirmation checks. |
| 25 public-file candidates | All retained. No blanket removal of marketing assets, badges, images, logos, fonts, or uploads. |
| HPIB campaign page | Retained with its handlers and tracking. |

Total source/style removals: **36**. Historical export tooling and the handoff
ZIP remain reference material, not a current website regeneration workflow.
Two website-placement assertions in the showcase tests now test APP-to-WEBSITE
ownership instead of reading removed website pages. The component's behavior,
answer feedback, asset, accessibility, and responsive-style tests remain.

## APP behavior

- Signed-out root uses the existing Login. Signed-in desktop/mobile home and
  onboarding continue through the existing shells and account gates.
- The independent public partner application is at `/referral-program/apply`.
  Existing fields, styling, JPEG/PNG/PDF and 10 MB validation, relative multipart
  endpoint, server error/retry, and confirmation remain.
- Verification, portal/auth/password, admin, HPIB, API, and native routes remain
  APP-owned. Their backend processing was not changed.
- `/privacy`, `/privacy-policy`, `/terms-of-service`, and `/terms` stay in APP.
  `/terms` uses the existing terms component. The old signed-out guard no longer
  shadows the existing public `/privacy` presentation.
- The actual Express server and applicable static-host config return exact
  same-path 301s for the 15 approved marketing paths, preserving encoded and
  repeated query parameters. No broad WEBSITE-to-APP fallback remains.
- Existing soccer/baseball retirement redirects still lead to WEBSITE `/hockey`.
- Unknown document URLs, including invented nested app routes, return 404.
- APP build output contains metadata-only APP entry HTML, not website
  prerenders. APP canonicals/OG and crawl files use the APP origin.
- Only production `/login` is indexable. Other APP documents and all preview
  entries are noindex. No `/signup` route or new auth system was invented.
- The existing attribution observer is restricted to real anchors so it cannot
  decorate canonical metadata or add campaign parameters to document links.
- Both native association files have exact GET/HEAD delivery as JSON without
  exposing a general dotfile directory. Their source bytes and identifiers
  remain unchanged.

## Verification

- Production `npm run build` passed. The existing large-chunk warning remains.
  No website rendering or application service initialization is used by the
  replacement metadata build step.
- 45 focused tests passed: app entry, mobile resume, auth transport, signup
  attribution, metadata, retained showcase behavior, hosting rules, and actual
  Express redirects/static serving. Additional strict nested-404 and complete
  protected-route parity checks passed after the final server routing change.
- 17 passing browser routing fixture scenarios cover signed-out web root, desktop home,
  onboarding, mobile restore, expired/malformed/other-account saved screens,
  push priority, expired-session login return, account switching, and tabs.
  These use the real router/Login/mobile container and the real desktop
  primary-page selector, but stub account state and page bodies.
- Actual preview checks passed at 402px and 1440px for `/`, `/login`, `/app`,
  and all four legal routes, including canonical/robots metadata and overflow.
  All browser API requests and POSTs were blocked in those layout checks.
- Actual preview HTTP checks passed for all 15 redirects, exact native JSON
  bytes/MIME, and a real unknown-route 404.
- The public application check passed with both submissions intercepted:
  invalid type/size, same-origin multipart names, server error/retry, success,
  and confirmation. No applications or emails were sent.
- Actual built HTML/crawl files were inspected: APP-local canonicals, correct
  login/private robots tags, login-only sitemap, no marketing prerender folders.
- Typecheck still fails with **226 errors versus the recorded 227-error
  baseline**. This is not a clean typecheck; no errors were reported in the
  new routing, policy, extracted form, or attribution-guard modules.

Real signed-in application screens, real account creation/recovery, physical
iOS/Android builds, and live provider integrations were **not verified**.
No authentication bypass was introduced to inspect them. A development-only
Vite WebSocket/CSP console warning was observed; it did not prevent rendering.

## Release order and rollback boundary

1. Preserve additive APP checkpoint **`edbbcde4`** (the last pre-cleanup reviewed
   state) as the base for a separately approvable prerequisite release candidate.
   It retains website serving and the APP-owned application/attribution UI.
   **Readiness-check correction:** do not publish this checkpoint unchanged.
   Its Vercel rewrites and Node production document list omit
   `/referral-program/apply`, even though its React route exists. Prepare and
   test a minimal additive routing patch while retaining website serving.
2. With separate approval, release the corrected additive APP frontend/backend first.
   Confirm the actual APP host and required entry destinations. Do not deploy
   this APP-only cleanup first.
3. With separate approval in the WEBSITE project, publish/cut over WEBSITE.
   Verify its routes, assets, canonical/crawl output, independent analytics,
   external APP CTAs, and intentional store links without overwriting its fixes.
4. Only after WEBSITE cutover verification, separately approve/release the
   APP-only cleanup checkpoint. Verify login/home, all public workflows,
   redirects/query retention, private noindex, association responses, and 404s.
5. Before each release, record the host's rollback target and verify provider
   origins without copying APP secrets to WEBSITE. Retain current www aliases,
   APP auth/transactional frontend origins, API transport, and native settings.
   Railway is the actual APP runtime; Vercel configuration alone is not release
   verification. No hosting or provider changes were performed here.

## Subsequent read-only live readiness check

- The public APP frontend and current WEBSITE respond through Vercel and serve
  the same combined client bundle. Railway serves the APP backend/runtime.
- Railway reported the backend online on a release preceding the additive
  prerequisites, with no staged changes to that service.
- The public APP and Railway both returned 404 for `/referral-program/apply`.
- The live APP root/login still contain website initial metadata; `/terms` is
  still 404. These cleanup changes are not live.
- The live WEBSITE still redirects `/contact` and `/blog` into APP; independent
  WEBSITE cutover has not been demonstrated.
- The current workspace branch is also the branch connected to Railway. Do not
  push the cleanup as a shortcut to the additive prerequisite release.
- The independent WEBSITE project's own current preview and publishing settings
  were not accessible from this workspace. Its live candidate needs a separate
  check before cutover approval.

These checks performed public GETs and read-only deployment/source inspection.
No applications were submitted, and no deployments, settings, secrets, or
production data were changed.
