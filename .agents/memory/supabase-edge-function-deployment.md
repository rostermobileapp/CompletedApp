---
name: Supabase Edge Function deployment
description: Deploy Supabase Edge Functions from Replit when local bundling cannot resolve packages.
---

Use the Supabase CLI remote bundler (`--use-api`) if Docker-based local bundling cannot resolve dependencies through Replit’s package proxy.

**Why:** Local edge-runtime bundling failed while resolving `@supabase/server` through the proxy, but the supported remote bundler deployed the same function successfully.

**How to apply:** Confirm the exact Supabase project and user approval before any production deploy. Keep credentials out of command output, and use `--yes` only after that approval.
