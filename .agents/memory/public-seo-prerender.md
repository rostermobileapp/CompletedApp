---
name: Static marketing prerender runtime
description: SSR constraints when rendering the existing Wouter marketing pages at build time.
---

Keep build-time marketing rendering isolated from the browser authentication runtime. The shared marketing layout imports Supabase, whose realtime client requires a WebSocket transport under Node 20; Wouter's memory-location hook also lacks the server snapshot required by React SSR. Use a build-only Supabase stub and a fixed, non-navigating location hook rather than changing production browser auth.

**Why:** The Replit build runtime is Node 20, while the logged-in app is intentionally client-rendered.

**How to apply:** Preserve the prerender-only module aliases and static location hook when changing page rendering; do not make the live Supabase client or signed-in app depend on the SSR workaround.

Express and Vercel must both serve generated directory-index pages at their clean URLs. Express's automatic directory slash redirects can turn a valid prerendered page into a client-router 404 after JavaScript runs.

**Why:** The marketing browser router matches clean paths exactly, whereas Express static middleware normally redirects a directory such as `/faq` to `/faq/`.

**How to apply:** Verify both initial HTML and browser behavior when changing static serving. Avoid mounted wildcard middleware when testing `req.path`: Express strips the matched mount path, so `app.use("*", ...)` can make every request look like `/` and defeat a route allowlist.
