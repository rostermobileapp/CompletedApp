---
name: RevenueCat paywall previews
description: How to represent the published native paywall in web onboarding previews.
---

Do not create a web imitation of the published RevenueCat paywall or present an interstitial as a visual preview of it. The onboarding step should hand off to the native SDK's configured offering; browser previews should explicitly state that the native paywall design cannot be rendered there.

**Why:** A custom onboarding mock was mistaken for the published paywall and the user rejected it as inaccurate.

**How to apply:** When changing paywall placement or preview behavior, verify the native bridge opens the configured RevenueCat paywall and label browser-only handoff screens as nonvisual diagnostics, never as design previews.