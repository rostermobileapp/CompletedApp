---
name: Raw fetch auth pattern
description: When using raw fetch() instead of apiRequest(), you must manually include Supabase JWT auth headers.
---

## Rule
Never use `credentials: 'include'` for raw `fetch()` calls to our backend. The backend uses Supabase JWT tokens in the `Authorization: Bearer <token>` header — not cookies.

## How to apply
Import and call `getAuthHeaders()` from `@/lib/queryClient` before any raw fetch that hits an `isAuthenticated` route:

```typescript
import { getAuthHeaders } from '@/lib/queryClient';

const authHeaders = await getAuthHeaders();
const res = await fetch('/api/some-endpoint', {
  method: 'POST',
  body: formData,        // FormData — do NOT set Content-Type manually
  headers: authHeaders,  // spreads { Authorization: 'Bearer <token>' }
});
```

**Why:** `apiRequest()` automatically calls `getAuthHeaders()` and injects the token. Raw `fetch()` does not. The `isAuthenticated` middleware rejects requests without the token with a 401 — but since the 401 happens before the route logger, the failure is silent and looks like a network error to the client.

**When this matters:** Any time you need to send `FormData` (file uploads via multer), since `apiRequest()` sets `Content-Type: application/json` and can't send binary data.
