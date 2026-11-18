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

Release the additive APP prerequisites first, then cut over and verify WEBSITE,
and only afterward release APP-only cleanup. Each release needs separate approval.

**Why:** The live website must not lose its current serving deployment before the
independent website is live, and its application/attribution destinations must work
before cutover.

**How to apply:** Before publishing either project, check the release order and
retain the pre-cleanup additive APP checkpoint as a release/rollback option.
