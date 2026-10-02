---
name: Anthropic model compatibility
description: Exact-model availability checks do not validate Messages request options.
---

Verify both model availability and an actual generation-plus-verification request before enabling trivia generation. Do not silently substitute a different model.

**Why:** Model discovery confirms availability, not compatibility with request options. The full generation and verification path can still fail.

**How to apply:** Keep the requested model's request payload limited to supported options. Test the complete generation flow when changing models or request parameters; a successful catalog lookup alone is insufficient.