---
name: Live-project preview
description: Owner-approved live Supabase credentials in the Replit preview and the safety boundaries around that mode.
---

The owner shut down the separate DEV Supabase test project and explicitly chose
the unprefixed live Supabase settings for the Replit preview. Keep this an
explicit preview-workflow opt-in; do not add an automatic production-secret
fallback to other development or test commands.

Preview activity can read and change live application data, but the preview is
not the verified production runtime: production background jobs and live
delivery/billing actions remain disabled.

**Why:** The owner approved using the actual project in preview after shutting
down the usage-measurement project; the live-data risk was explained and
explicitly accepted.

**How to apply:** Keep the opt-in limited to the Replit preview workflow. Keep
Vite HMR disabled because proxy upgrades fail, preserve application `/ws`
behavior, and serve the Vite development client rather than a production-built
client.
