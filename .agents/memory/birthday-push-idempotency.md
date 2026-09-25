---
name: Birthday push idempotency
description: Why annual greeting sends need both provider retry keys and durable application state.
---

Birthday push retries should reuse a stable OneSignal idempotency key for one person's local birthday, while the application retains a durable record of successful sends independently of popup dismissal.

**Why:** OneSignal documents that notification idempotency keys are retained for 30 days. They cover uncertain responses and short-term retries, but cannot alone prevent a resend later in the same birthday year after a restart or manual replay. Popup dismissal is a different user action and must not determine whether the push is sent.

**How to apply:** For future scheduled annual greetings, pair short-term provider idempotency with long-lived per-user/per-local-date delivery state, and recheck the person's timezone and eligibility immediately before an external send.