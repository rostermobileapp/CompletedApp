---
name: storage.ts / oneSignalNotifications.ts circular import
description: How to safely trigger a push notification from inside server/storage.ts without a static circular import.
---

`server/oneSignalNotifications.ts` imports `storage` from `server/storage.ts` (to read notification
preferences and user rows). If `storage.ts` needs to fire a push notification from inside one of its
own methods (e.g. right after inserting a new row), a static top-level `import { sendXPushNotification }
from './oneSignalNotifications'` in `storage.ts` creates a circular import.

**Why:** the codebase already has a known, tracked issue with circular imports between
`draft-routes`/`routes` causing load-order bugs, so this is a real, recurring failure mode here, not
theoretical.

**How to apply:** when a `storage.ts` method needs to call into `oneSignalNotifications.ts` (or any
other module that itself imports `storage`), use a dynamic `const { fn } = await import('./oneSignalNotifications');`
inside the method body instead of a static import. This resolves after both modules have finished
loading and sidesteps the cycle. Wrap the dynamic import + call in try/catch and don't let a
notification failure block the primary DB write.
