---
name: Parent verification acceptance
description: Verify parent-code completion across the real account boundary, not only the standalone form.
---

Test successful parent verification through the real account boundary and onward
to the actual Family setup screen, including a reload after approval.

**Why:** A standalone form test passed while the real boundary remounted the
screen after grant storage, discarding its local success state. The server had
approved the device, but the screen offered another email code and parents ran
into resend limits. Server acceptance alone did not establish a usable journey.

**How to apply:** Keep server status authoritative across remounts. Verify that
approved parents can continue without another email, rejected submissions retain
their current challenge, password changes still require separate proof, and Back
to Home preserves the ordinary authenticated dashboard. Do not relax guess or
resend limits to hide a presentation or navigation failure. Synthetic browser
fixtures do not establish real-inbox or native-phone acceptance.
