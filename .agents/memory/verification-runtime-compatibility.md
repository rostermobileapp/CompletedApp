---
name: Verification runtime compatibility
description: Browser-test delegation may be documented but unavailable in the current runtime.
---

Do not assume the testing subagent kind is available merely because the testing skill documents it.

**Why:** The current runtime rejected a correctly formed testing delegation with “Unknown config kind: testing”; design delegation worked.

**How to apply:** If the runtime rejects that kind, don't repeatedly retry it or weaken authentication. Verify protected presentation using disposable fixtures derived from the real component source, test behavior independently, and distinguish fixture checks from signed-in UI verification.