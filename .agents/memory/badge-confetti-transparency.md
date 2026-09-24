---
name: Confetti video transparency
description: Why opaque black-background clips cannot simply be blended over a blurred badge modal.
---

Use a video with real transparency for confetti over translucent, blurred announcement backdrops; do not rely on CSS screen blending of black-background footage. Preserve the source aspect ratio and center the video instead of stretching it to fill portrait screens. Verify that the browser actually decodes the alpha channel before revealing the video, and leave the announcement card alone when it cannot.

**Why:** A visual check of an opaque MP4 with screen blending over the announcement backdrop showed a near-black full-screen field. A transparent VP9 version composed correctly, but browsers can decode VP9 without honoring its alpha channel. Stretching the 16:9 clip on phones visibly distorted the footage; center-fit preserves its framing.

**How to apply:** When changing full-screen announcement media, check the composition on desktop and portrait screens, including the decoded transparency, and preserve a card-only fallback.