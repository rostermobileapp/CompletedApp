# 🗑️ OneSignal & Push Notification Code Removal Summary

## ✅ **FILES DELETED**

### Client-Side:
1. ✅ `/client/src/hooks/useOneSignal.ts` - Main OneSignal React hook
2. ✅ `/client/src/components/OneSignalProvider.tsx` - React context provider
3. ✅ `/client/src/components/NativelyBridgeDebug.tsx` - Debug component
4. ✅ `/client/public/OneSignalSDKWorker.js` - Service worker
5. ✅ `/useOneSignal_FIXED.ts` - Fixed implementation (root)

### Server-Side:
6. ✅ `/server/notificationService.ts` - Entire OneSignal service (565 lines)

### Documentation:
7. ✅ All OneSignal/Firebase/BuildNatively `.md` documentation files (~20 files)

---

## ✅ **FILES MODIFIED**

### 1. `/client/index.html`
**Removed:**
- OneSignal Web SDK script tag
```html
<!-- REMOVED: -->
<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
```

### 2. `/client/src/App.tsx`
**Removed:**
- `OneSignalProvider` wrapper
- `NativelyBridgeDebug` component
- Related imports

---

## ⏳ **PENDING: Server Routes Cleanup**

### `/server/routes.ts` - Endpoints to Remove:

**OneSignal-Specific Endpoints:**
1. `POST /api/notification-preferences/player-id` - Register Player ID
2. `POST /api/notification-preferences/link-external-id` - Link External ID
3. `GET /api/notification-preferences/verify-external-id` - Verify External ID
4. `GET /api/notification-preferences/lookup-onesignal/:oneSignalId` - Lookup user
5. `POST /api/send-test-push/:type` - Send test notification
6. `POST /api/notification-preferences/clear-onesignal` - Clear OneSignal data
7. `POST /api/notification-preferences/auto-link-native` - Auto-link native app
8. `GET /api/notification-preferences/debug` - Debug OneSignal state

**Push Notification Calls to Remove:**
- `notificationService.sendJoinRequestNotification()` calls (~4 locations)
- `notificationService.sendSubstitutionRequestNotification()` calls
- `notificationService.sendNewsAnnouncementNotification()` calls (~2 locations)
- `notificationService.sendMessageNotification()` calls
- `notificationService.sendPaymentRequestNotification()` calls

**Import to Remove:**
```typescript
import { notificationService } from "./notificationService";
```

---

## ⚠️ **KEEPING (Standard Functionality)**

### `/server/routes.ts` - Keep These:
- `GET /api/notification-preferences` - Get user preferences
- `PUT /api/notification-preferences` - Update preferences
- All standard notification preference CRUD operations

### Database Schema:
- `notification_preferences` table structure (can keep columns for future use)
- Columns: `onesignal_player_id`, `onesignal_external_id` (unused but harmless)

### Email Notifications:
- All email notification functionality stays intact
- Scrimmage reminders, invites, etc. via email continue working

---

## 📝 **NEXT STEPS**

1. ✅ Remove OneSignal imports from `routes.ts`
2. ✅ Remove OneSignal-specific endpoints (8 endpoints)
3. ✅ Remove push notification calls from business logic
4. ✅ Test that app builds without errors
5. ✅ Verify standard notification preferences still work

---

**Status:** In Progress - Working on routes.ts cleanup now...
