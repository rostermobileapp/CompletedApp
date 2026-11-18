# Additive APP prerequisite release candidate

## Prepared, not published

- Local branch: `release/app-prerequisite-routing`
- Candidate commit: `84390ec2f2cac2dd35eb8d3c1dee52c0f210b5ff`
- Base: `edbbcde4` (pre-cleanup combined website/APP)
- Worktree: `generated-artifacts/app-prerequisite-release`
- Current APP cleanup remains on `10_1_2026`; it was not restored or replaced.
- No remote push, deployment, DNS/provider change, or production mutation occurred.

The candidate is **not** the current cleanup branch. It preserves the existing
website and the previously prepared application/attribution prerequisites.
It does not regenerate or overwrite the independently imported WEBSITE project.

## Exact patch over the pre-cleanup base

Only two production-routing lines were added:

1. `vercel.json`: rewrite `/referral-program/apply` to `/index.html`.
2. `server/vite.ts`: recognize `/referral-program/apply` and its trailing-slash
   variant in the production APP document list.

One new regression-test file was added. The commit changes three files total:
two production lines and 67 test lines. No package/dependency, backend processing,
auth/billing, database/schema, email/push, native identifier, or public asset
changes are included in this patch.

The APP-only metadata, legal-alias, root, and source cleanup is intentionally
**not** part of this additive release candidate. It remains the later release,
after independent WEBSITE cutover.

## Verification results

- Candidate `npm run build`: passed, including the existing website prerenders.
  Actual home, features, FAQ, pricing, and partner marketing build files remain.
- Four routing/crawlability tests: passed. They cover actual Express production
  GET/HEAD handling, query-bearing application URLs, the existing website pages,
  API handling, retained hosting/native rules, and unknown-child 404s.
- Browser form check against the candidate's real source: passed. No marketing
  hero was shown on the application-only page; invalid uploads were rejected;
  same-origin multipart names, server-error/retry, and confirmation were verified.
  Both POSTs were intercepted. No applications or emails were created.
- Phone-width candidate application screenshot: verified.
- Typecheck: **227 errors**, matching the pre-cleanup baseline. Not a clean
  typecheck; no additional errors in the production-routing or new test file.
- Git diff: only the two routing files and the new regression test changed
  relative to the base; all tracked public assets and website components remain.

The isolated browser fixture ran source/dev transforms, not a production-built
client. It started no APP backend, database, workers, billing, email, or push
processing. Its localhost origin was explicitly allowed by the existing
development request guard; that guard was not disabled. External browser
requests were blocked and both form submissions were fulfilled by the test.

No real sign-in, signup/onboarding data write, verification email, physical
device, or deployed Vercel behavior was tested. Vercel rules were inspected;
actual public-host verification must follow a separately approved release.
An existing development-tool WebSocket reconnect warning was observed without
preventing the form from rendering.

## Inspect or reproduce locally

From the workspace root:

```sh
git diff edbbcde4 release/app-prerequisite-routing --stat
git diff edbbcde4 release/app-prerequisite-routing -- server/vite.ts vercel.json
```

From the candidate worktree:

```sh
NODE_ENV=production npx tsx --test \
  server/tests/prerequisiteApplicationRouting.test.ts \
  server/tests/crawlabilityFiles.test.ts
npm run build
```

The local candidate used the unchanged workspace dependency installation via a
`node_modules` symlink for verification. No package was installed or updated.
The temporary frontend-only fixture is
`generated-artifacts/prerequisite-form-preview.ts`; the form check used the
workspace's `scripts/test-website-partner-entry.ts` with its origin set to that
fixture. Generated files and build outputs are excluded from source control.

## Release hold and sequence

1. Review this **specific candidate**, including its previously prepared base
   changes relative to the currently live release.
2. Obtain separate explicit approval to make the candidate available to the
   existing Vercel APP frontend and Railway backend deployment pipelines.
   The local branch has not been pushed. Do not push the current cleanup branch
   as a shortcut; Railway is connected to that branch.
3. After an approved prerequisite release, confirm the public application loads,
   existing website pages remain, and frontend/backend versions agree.
4. Separately verify and approve the authoritative independent WEBSITE's
   publishing/domain cutover.
5. Only after WEBSITE is live and verified, separately approve APP-only cleanup.

This document and the local candidate do **not** authorize any push, publication,
deployment trigger, host setting, domain cutover, or production-data operation.
