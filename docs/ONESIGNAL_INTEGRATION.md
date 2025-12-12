# OneSignal Push Notification Integration

## Overview

This document describes the complete OneSignal push notification integration for the Roster app. The integration supports:

- **Web SDK**: OneSignal Web Push SDK 5.x
- **Native Mobile**: BuildNatively wrapper with native OneSignal SDK
- **External ID Linking**: User's `displayId` is linked as the External ID in OneSignal

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  useOneSignal.ts Hook                                           │
│  ├── Web: window.OneSignal SDK                                  │
│  └── Native: window.NativelyNotifications SDK                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST API Calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Express)                         │
├─────────────────────────────────────────────────────────────────┤
│  API Routes:                                                    │
│  ├── POST /api/notification-preferences/player-id              │
│  ├── POST /api/notification-preferences/link-external-id       │
│  ├── POST /api/notification-preferences/unlink-external-id     │
│  ├── GET  /api/notification-preferences/verify                 │
│  ├── PUT  /api/notification-preferences                        │
│  ├── DELETE /api/notification-preferences/cleanup              │
│  ├── GET  /api/onesignal/config                                │
│  └── POST /api/notifications/send                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OneSignal REST API                           │
├─────────────────────────────────────────────────────────────────┤
│  ├── PATCH /apps/{app_id}/subscriptions/{id}/user/identity     │
│  ├── POST  /apps/{app_id}/users                                │
│  ├── GET   /apps/{app_id}/users/by/external_id/{id}            │
│  ├── PATCH /apps/{app_id}/subscriptions/{id}/owner             │
│  ├── POST  /notifications                                       │
│  └── DELETE /apps/{app_id}/subscriptions/{id}/user/identity    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                            │
├─────────────────────────────────────────────────────────────────┤
│  notification_preferences table:                                 │
│  ├── id, user_id, onesignal_player_id, onesignal_subscription_id│
│  ├── external_id_linked, external_id_linked_at                  │
│  ├── platform, device_model, os_version, app_version           │
│  ├── push_enabled, game_reminders, scrimmage_updates, etc.     │
│  └── is_active, last_active_at, created_at, updated_at         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### 1. Player ID / Subscription ID
- This is OneSignal's unique identifier for a device/browser subscription
- In OneSignal 5.x, this is called "Subscription ID"
- One user can have multiple subscription IDs (web + iOS + Android)

### 2. External ID
- This is YOUR app's user identifier that you link to OneSignal
- We use the user's `displayId` (6-character alphanumeric, e.g., "LFB3Kf")
- This allows sending notifications to a user across all their devices

### 3. OneSignal User ID
- Internal OneSignal identifier for a user (created when external_id is linked)
- You typically don't need to interact with this directly

## Environment Variables

Add these to your environment:

```bash
# OneSignal Configuration
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_REST_API_KEY=your-onesignal-rest-api-key

# Frontend (Vite)
VITE_ONESIGNAL_APP_ID=your-onesignal-app-id
```

## File Locations

```
/workspace
├── shared/
│   └── schema.ts                    # notification_preferences table schema
├── server/
│   ├── notificationService.ts       # OneSignal REST API integration
│   ├── storage.ts                   # Database operations
│   └── routes.ts                    # API endpoints
└── client/src/
    └── hooks/
        └── useOneSignal.ts          # React hook for web and native
```

## Database Schema

```sql
CREATE TABLE notification_preferences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  onesignal_player_id VARCHAR,
  onesignal_subscription_id VARCHAR,
  external_id_linked BOOLEAN DEFAULT false NOT NULL,
  external_id_linked_at TIMESTAMP,
  platform device_platform DEFAULT 'web' NOT NULL,
  device_model VARCHAR,
  os_version VARCHAR,
  app_version VARCHAR,
  push_enabled BOOLEAN DEFAULT true NOT NULL,
  game_reminders BOOLEAN DEFAULT true NOT NULL,
  scrimmage_updates BOOLEAN DEFAULT true NOT NULL,
  message_notifications BOOLEAN DEFAULT true NOT NULL,
  announcement_notifications BOOLEAN DEFAULT true NOT NULL,
  substitute_requests BOOLEAN DEFAULT true NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_active_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_id, onesignal_player_id)
);

CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_player_id ON notification_preferences(onesignal_player_id);
CREATE INDEX idx_notification_preferences_external_linked ON notification_preferences(external_id_linked);
```

## Usage

### Frontend Hook

```tsx
import { useOneSignal } from '@/hooks/useOneSignal';

function MyComponent() {
  const {
    isInitialized,
    isLinked,
    playerId,
    permission,
    error,
    linkExternalId,
    cleanup,
    requestPermission,
  } = useOneSignal();

  // Request permission for push notifications
  const handleEnableNotifications = async () => {
    const granted = await requestPermission();
    if (granted) {
      await linkExternalId();
    }
  };

  // Complete reset (for debugging)
  const handleReset = async () => {
    await cleanup();
    // Page will reload or re-initialize
  };

  return (
    <div>
      <p>OneSignal Status: {isInitialized ? 'Ready' : 'Loading...'}</p>
      <p>External ID Linked: {isLinked ? 'Yes' : 'No'}</p>
      <p>Player ID: {playerId || 'None'}</p>
      <p>Permission: {permission ? 'Granted' : 'Not granted'}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      <button onClick={handleEnableNotifications}>
        Enable Notifications
      </button>
      <button onClick={handleReset}>
        Reset OneSignal
      </button>
    </div>
  );
}
```

### Sending Notifications from Backend

```typescript
import { notificationService } from './notificationService';

// Send to specific users by their displayIds
await notificationService.sendNotificationByExternalIds(
  ['LFB3Kf', 'ABC123', 'XYZ789'],
  {
    title: 'Game Reminder',
    message: 'Your game starts in 1 hour!',
    data: { gameId: '12345', type: 'game_reminder' },
    url: '/games/12345',
  }
);

// Send to all subscribed users (use sparingly)
await notificationService.sendNotificationToAll({
  title: 'League Announcement',
  message: 'New season registration is now open!',
});
```

## API Endpoints

### POST /api/notification-preferences/player-id
Register a OneSignal Player ID for the current user.

**Request Body:**
```json
{
  "playerId": "abc123-player-id",
  "subscriptionId": "abc123-subscription-id",
  "platform": "web",
  "deviceModel": "Chrome 120",
  "osVersion": "macOS",
  "appVersion": "1.0.0"
}
```

### POST /api/notification-preferences/link-external-id
Link the user's displayId as External ID in OneSignal.

**Request Body:**
```json
{
  "playerId": "abc123-player-id"
}
```

**Response:**
```json
{
  "success": true,
  "externalId": "LFB3Kf",
  "onesignalUserId": "onesignal-internal-id",
  "message": "External ID linked successfully"
}
```

### POST /api/notification-preferences/unlink-external-id
Unlink External ID from OneSignal (for logout).

### GET /api/notification-preferences/verify
Verify that External ID is properly linked.

### PUT /api/notification-preferences
Update notification preferences (push enabled, categories).

### DELETE /api/notification-preferences/cleanup
Complete cleanup of all notification data (for debugging).

### GET /api/onesignal/config
Check OneSignal configuration status.

### POST /api/notifications/send
Send a test notification to specific users.

## Lifecycle Flow

```
1. User opens app
   │
   ├── useOneSignal hook initializes
   │   └── Detects platform (web vs native)
   │
   ├── Web: OneSignal.init() called
   │   └── Gets subscription ID
   │
   └── Native: NativelyNotifications.getSubscriptionId() called
       └── Gets subscription ID

2. User logs in
   │
   ├── useAuth hook sets isAuthenticated = true
   │
   └── useOneSignal auto-triggers linkExternalId()
       │
       ├── Registers Player ID with backend
       │   └── POST /api/notification-preferences/player-id
       │
       └── Links External ID
           ├── POST /api/notification-preferences/link-external-id
           │   └── Backend calls OneSignal REST API
           │
           └── Fallback: OneSignal.login(displayId)

3. User receives notification
   │
   ├── Backend gets user's displayId(s)
   ├── Calls notificationService.sendNotificationByExternalIds()
   └── OneSignal delivers to all linked devices

4. User logs out
   │
   ├── useAuth hook sets isAuthenticated = false
   │
   └── useOneSignal triggers unlinkExternalId()
       ├── OneSignal.logout() (SDK)
       └── POST /api/notification-preferences/unlink-external-id
```

## Debugging

### 1. Check OneSignal Configuration
```bash
curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/onesignal/config
```

### 2. Verify External ID Link
```bash
curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/notification-preferences/verify
```

### 3. Complete Cleanup
```bash
curl -X DELETE -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/notification-preferences/cleanup
```

### 4. Check OneSignal Dashboard
1. Go to https://onesignal.com
2. Navigate to your app
3. Audience > All Users
4. Search by External ID (displayId)
5. Verify subscriptions are linked

### 5. Common Issues

#### Stale Player ID
**Symptom:** Old Player ID keeps appearing even after reset.
**Cause:** Player ID stored in localStorage, IndexedDB, or browser service worker.
**Solution:**
1. Clear browser data (localStorage, IndexedDB)
2. Unregister service workers
3. Call cleanup endpoint
4. Re-initialize

#### External ID Not Linking
**Symptom:** User's displayId not appearing in OneSignal dashboard.
**Cause:** API call failing or user not authenticated.
**Solution:**
1. Check API logs for errors
2. Verify ONESIGNAL_REST_API_KEY is correct
3. Call verify endpoint to check status

#### Notifications Not Delivered
**Symptom:** sendNotificationByExternalIds succeeds but no notification appears.
**Cause:** Permission not granted, external ID not linked, or device offline.
**Solution:**
1. Verify permission: `Notification.permission === 'granted'`
2. Verify external ID is linked in OneSignal dashboard
3. Check OneSignal message reports for delivery status

## Testing Procedure

### Fresh Setup
```
[ ] 1. Clear browser data (all site data)
[ ] 2. Verify no entries in notification_preferences table for user
[ ] 3. Open app
[ ] 4. Verify OneSignal initialized (console shows subscription ID)
[ ] 5. Log in
[ ] 6. Verify External ID linking (console shows "External ID linked successfully")
[ ] 7. Check database: external_id_linked = true
[ ] 8. Check OneSignal dashboard: External ID field populated with displayId
[ ] 9. Send test notification
[ ] 10. Verify notification appears
[ ] 11. Log out
[ ] 12. Verify External ID unlinked
[ ] 13. Log in again
[ ] 14. Verify no stale IDs, clean re-linking
```

### Multi-Device Testing
```
[ ] 1. Log in on web browser
[ ] 2. Verify external ID linked
[ ] 3. Log in on mobile (BuildNatively)
[ ] 4. Verify same external ID, new subscription
[ ] 5. Send notification to displayId
[ ] 6. Verify notification received on BOTH devices
```

## Security Considerations

1. **Never expose ONESIGNAL_REST_API_KEY to frontend**
   - All OneSignal API calls go through backend

2. **Verify user ownership before operations**
   - All endpoints require authentication
   - Users can only modify their own preferences

3. **Rate limiting**
   - Consider rate limiting notification send endpoint
   - Prevent abuse of push notifications

## Migration

To add this feature to existing users:

```sql
-- Create the table
-- (Run the CREATE TABLE statement above)

-- Existing users will get preferences created when they:
-- 1. Open the app (SDK initialized)
-- 2. Are authenticated (external ID linked)
```

No migration of existing data is needed - preferences are created on first use.
