---
name: Isolated development preview
description: Why dev-tool hot reload is disabled without modifying production WebSocket handling.
---

Keep Vite hot reload disabled in isolated development unless a separate,
verified fix is approved. This restriction is not an application realtime or
polling change.

**Why:** Both the original configuration and an explicit proxied WSS configuration
failed; upgrades were rejected while the application itself served correctly.
Changing production WebSocket upgrade handling merely to repair a dev tool would
cross the owner's preservation boundary.

**How to apply:** Refresh the preview after edits. Preserve application `/ws`
behavior and production polling/freshness. Do not enable a production-built
client as a workaround: it can carry production Auth/native billing configuration.
