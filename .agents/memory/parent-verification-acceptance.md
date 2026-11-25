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

Exercise the real request client with a separately configured backend, not only
same-origin screen fixtures. Keep remembered parent cookies first-party through
the frontend proxy rather than broadening their cookie policy.

**Why:** A screen fixture replaced the request client and passed while direct
backend requests omitted the first-party cookie. A successful reload also does
not establish persistence after a browser process or native app closes.

**How to apply:** Include a nonempty backend base URL and persistent-browser
close/reopen in transport checks. Retain account/session binding and separate
password-purpose proof. Confirm the released frontend and actual native-device
behavior separately before claiming the phone issue is fixed.
