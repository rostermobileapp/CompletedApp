---
name: Mockup sandbox plugin isolation
description: Keep the isolated component preview server independent of main-app-only Vite plugins and config.
---

Keep the mockup sandbox plugin list limited to plugins required by its standalone previews. An optional Cartographer integration attempted to load the workspace Tailwind config inside the sandbox and triggered a Vite error overlay even though the component itself was valid.

**Why:** The sandbox compiles independent preview entries and should not inherit plugin assumptions about the main application.

**How to apply:** If a sandbox preview shows a Vite overlay, check optional analysis plugins and workspace config imports before changing the mockup component or adding dependencies.