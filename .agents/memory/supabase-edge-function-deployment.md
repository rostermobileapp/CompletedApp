---
name: Supabase Edge Function deployment
description: Deploy Supabase Edge Functions from Replit when local bundling cannot resolve packages.
---

Use Supabase's remote bundler (CLI `--use-api` or the documented Management API deployment endpoint) if local bundling cannot resolve dependencies through Replit’s package proxy. Installing the CLI is not required when the existing Management API credentials and source files are available.

**Why:** Local edge-runtime bundling failed while resolving `@supabase/server` through the proxy, but the supported remote bundler deployed the same function successfully. Direct Management API remote bundling also worked when the CLI was not installed, without adding a deployment-only dependency to the application.

**How to apply:** Confirm the exact Supabase project and user approval before any production deploy. Keep credentials out of command output, and use `--yes` only after that approval.
