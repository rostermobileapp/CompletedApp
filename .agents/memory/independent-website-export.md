---
name: Independent website project boundary
description: Owner-approved separate-project handoff and copy-first review gates for the website/app separation.
---

The website belongs in a **brand-new Replit project**, appearing separately in the
project sidebar, not as another artifact inside the Roster app.

**Why:** The owner explicitly asked and confirmed the separate-project setup.

**How to apply:** Prepare and verify an independently installable export first.
Keep actual project creation/import distinct from generating the export. Do not
say a new project exists until it has actually been created/imported.

Do not remove APP files before the independent copy and proposed removal list
have been reviewed. Publishing, domain cutover and app cleanup need their own
approval.

**Why:** The owner required a verified copy and review before destructive cleanup.

**How to apply:** Keep APP application/verification/portal/admin, auth, onboarding,
legal, data, billing and native workflows intact. Website analytics is separately
approved Vercel Web Analytics, not an app API proxy. Preserve HPIB tracking in APP.

Literal asset scans are insufficient for this website.

**Why:** Prefix helpers and badge-slug loops concealed public media from an earlier
inventory; the isolated browser found missing images despite a successful build.

**How to apply:** Resolve constructed public-media paths, verify actual requests
across representative pages, and never infer media deletion safety from the
literal-only inventory or from a filename.

After import, treat the new website project as the authoritative website source,
not the original APP exporter or ZIP.

**Why:** The owner confirmed importing it and reported subsequent dependency
hardening performed exclusively in that project. Regenerating the original
handoff could overwrite independent fixes.

**How to apply:** Make future website changes in the website project. The original
ZIP is a historical handoff snapshot, not an up-to-date distribution.

The standalone WEBSITE must be hosted on Replit using the owner's existing
domain. Do not require a Vercel connection for this website work.

**Why:** The owner explicitly corrected the hosting direction: "The website
portion of this needs to be hosted by replit using the domain that I own."

**How to apply:** Configure and verify publishing in the authoritative WEBSITE
project, then guide the separately approved custom-domain connection. Do not
publish this APP-cleanup workspace as the website, move APP hosting implicitly,
or make further Vercel access a prerequisite for WEBSITE preparation.

Release the additive APP prerequisites first, then cut over and verify WEBSITE,
and only afterward release APP-only cleanup. Each release needs separate approval.

**Why:** The live website must not lose its current serving deployment before the
independent website is live, and its application/attribution destinations must work
before cutover.

**How to apply:** Before publishing either project, check the release order and
retain the pre-cleanup additive APP checkpoint as a release/rollback option.

A React route alone does not make an additive release candidate ready. Verify
the public APP URL through both frontend-host rewrites and the Node production
document list, not only through the development server.

**Why:** The application UI existed in the pre-cleanup source while both
production hosting layers omitted its URL and returned 404. Releasing that
source unchanged would not satisfy the WEBSITE's outbound Apply link.

**How to apply:** Treat a pre-cleanup checkpoint as a source base until its
production routing is tested. Preserve website serving while preparing any
minimal additive routing patch; do not substitute the full cleanup release.
