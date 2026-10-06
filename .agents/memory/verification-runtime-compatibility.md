---
name: Verification runtime compatibility
description: Browser-test delegation may be documented but unavailable in the current runtime.
---

Do not assume the testing subagent kind is available merely because the testing skill documents it.

**Why:** The current runtime rejected a correctly formed testing delegation with “Unknown config kind: testing”; design delegation worked.

**How to apply:** If the runtime rejects that kind, don't repeatedly retry it or weaken authentication. Verify protected presentation using disposable fixtures derived from the real component source, test behavior independently, and distinguish fixture checks from signed-in UI verification.

Isolated bundled tests must mock unexecuted dynamic application-entry imports too, and mock namespaces must declare their filesystem resolve directory.

**Why:** The bundler resolves dependencies before tree-shaking. An unused dynamic entry import pulled in the full application and caused misleading mock-export errors; missing mock resolution context also prevented legitimate imports from resolving.

**How to apply:** Isolate the full import graph before executing a fixture, including dynamic startup paths, and provide mock resolve directories. Match connection and query interfaces accurately, and replace external clients and credentials with test-only values.

For direct headless Chromium/CDP checks of native Enter activation, enable focus emulation and send rawKeyDown, a char event with carriage-return text, then keyUp.

**Why:** In this environment, keyDown/keyUp alone left a focused native button unchanged; the complete native key sequence successfully activated it.

**How to apply:** Use the complete sequence for keyboard interaction checks rather than treating a failed abbreviated CDP sequence as an application regression.