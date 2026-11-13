---
name: Prediction visibility verification
description: Verification limits when Home cards omit prediction UI despite healthy stored predictions.
---

Verify the whole Home-card rendering path before attributing missing predictions
to fetch failures, stale assets, or another environment. Healthy stored forecasts
and passing isolated prediction-component tests do not prove the parent card
mounts that component in the user's authenticated session.

**Why:** Prediction data and child-component checks were healthy while the owner
continued to report no prediction area. Retry changes and refresh advice alone
did not establish or resolve the actual visibility problem.

**How to apply:** Check the active Home layout and the parent card's eligibility
and roster identity together. Missing loading/error UI is evidence to inspect
mounting, not proof of a network failure or an old client. Distinguish fixture
verification from verification of the owner's signed-in screen, and do not claim
the latter when it was inaccessible.
