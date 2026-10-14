---
name: Static marketing prerender runtime
description: SSR constraints when rendering the existing Wouter marketing pages at build time.
---

Keep build-time marketing rendering isolated from the browser authentication runtime. The shared marketing layout imports Supabase, whose realtime client requires a WebSocket transport under Node 20; Wouter's memory-location hook also lacks the server snapshot required by React SSR. Use a build-only Supabase stub and a fixed, non-navigating location hook rather than changing production browser auth.

**Why:** The Replit build runtime is Node 20, while the logged-in app is intentionally client-rendered.

**How to apply:** Preserve the prerender-only module aliases and static location hook when changing page rendering; do not make the live Supabase client or signed-in app depend on the SSR workaround.
