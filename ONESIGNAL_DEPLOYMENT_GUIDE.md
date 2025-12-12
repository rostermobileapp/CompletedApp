# OneSignal External ID Sync Fix - Deployment Guide

## 🎯 What Was Fixed

This deployment fixes the **persistent old Player ID issue** where OneSignal was reusing stale Player IDs across user sessions, preventing proper External ID linking.

### Root Causes Identified
1. **OneSignal SDK stores data in IndexedDB** at the device level, not cleared on logout
2. **Database records never cleaned up** when users logged out
3. **No OneSignal SDK logout call** - SDK kept using old External IDs

### Changes Implemented
1. ✅ Enhanced `logoutOneSignal()` function to properly clear all OneSignal data
2. ✅ Added backend cleanup endpoint `/api/notification-preferences/clear-onesignal`
3. ✅ Fixed race conditions in permission change listener
4. ✅ Improved error handling in login flow
5. ✅ Added debug endpoint `/api/notification-preferences/debug`
6. ✅ Created database migration to clear stale OneSignal data

---

## 📋 Pre-Deployment Checklist

Before deploying these changes:

- [ ] Backup the `notification_preferences` table
- [ ] Document any active push notification campaigns
- [ ] Notify team that users will need to re-enable push notifications
- [ ] Verify OneSignal API credentials are set in environment variables:
  - `ONESIGNAL_APP_ID`
  - `ONESIGNAL_REST_API_KEY`

---

## 🚀 Deployment Steps

### Step 1: Deploy Code Changes

Deploy the updated code files:
- `client/src/hooks/useOneSignal.ts`
- `server/routes.ts`

**No restart required for existing users**, but new code will take effect on next page load.

### Step 2: Run Database Migration

**Option A: Automated Migration** (Recommended)
```bash
# Run the migration file
psql -h YOUR_DB_HOST -U YOUR_DB_USER -d YOUR_DB_NAME -f migrations/0003_clear_onesignal_data.sql
```

**Option B: Manual SQL Execution**

Connect to your database and run:
```sql
UPDATE notification_preferences 
SET 
  onesignal_player_id = NULL, 
  onesignal_external_id = NULL,
  updated_at = NOW()
WHERE 
  onesignal_player_id IS NOT NULL 
  OR onesignal_external_id IS NOT NULL;
```

### Step 3: Verify Migration Success

Run this query to confirm cleanup:
```sql
SELECT COUNT(*) as remaining_records
FROM notification_preferences
WHERE onesignal_player_id IS NOT NULL 
   OR onesignal_external_id IS NOT NULL;
```

**Expected result**: `0` records

### Step 4: Monitor Initial Logins

After deployment, monitor the server logs for:
```
[OneSignal] === LOGOUT - Clearing OneSignal data ===
[OneSignal] ✓ Web SDK logout complete
[OneSignal] ✓ Database OneSignal columns cleared
[OneSignal] === LOGOUT COMPLETE ===
```

And on login:
```
[OneSignal] ✅ Fetched displayId: ABC123
[OneSignal] ✓ OneSignal.login() SUCCESS for: ABC123
```

---

## 🧪 Testing Procedure

### Test 1: Fresh User Login (5 minutes)

1. **Clear browser data** (Ctrl+Shift+Delete)
   - Select: Cookies, Cache, IndexedDB, LocalStorage
   - Time range: All time

2. **Login as Test User A**
   - Note their displayId (e.g., "USER1A")
   
3. **Open browser console** and look for:
   ```
   [OneSignal] ✅ Fetched displayId: USER1A
   [OneSignal] ✓ OneSignal.login() SUCCESS for: USER1A
   ```

4. **Enable push notifications** in settings

5. **Verify in OneSignal Dashboard**
   - Go to: Audience → All Users
   - Search for External ID: "USER1A"
   - Should show: Active subscription with External ID set

6. **Send test notification**
   - Use the debug endpoint: `GET /api/notification-preferences/debug`
   - Should show: `externalIdLinked: true`
   - Send test: `POST /api/notification-preferences/test`
   - Verify notification received

**✅ Pass criteria**: External ID is "USER1A" and notification received

---

### Test 2: User Logout (2 minutes)

1. **Open browser console** before logging out

2. **Click "Sign Out"**

3. **Verify console logs show**:
   ```
   [OneSignal] === LOGOUT - Clearing OneSignal data ===
   [OneSignal] ✓ Web SDK logout complete
   [OneSignal] Removing localStorage key: onesignal-...
   [OneSignal] ✓ Database OneSignal columns cleared
   [OneSignal] === LOGOUT COMPLETE ===
   ```

4. **Check localStorage** (DevTools → Application → Local Storage)
   - Should have NO keys containing "onesignal"

5. **Query database** for this user:
   ```sql
   SELECT onesignal_player_id, onesignal_external_id 
   FROM notification_preferences 
   WHERE user_id = 'USER_ID_HERE';
   ```
   - Both should be `NULL`

**✅ Pass criteria**: All OneSignal data cleared, other preferences intact

---

### Test 3: User Switch - CRITICAL TEST (10 minutes)

This is the **most important test** that verifies the original issue is fixed.

1. **Login as User A** (displayId: "USER1A")
   - Enable notifications
   - Verify External ID is set to "USER1A"
   - Send test notification → Should receive it

2. **Logout User A**
   - Verify cleanup logs appear
   - Verify localStorage cleared

3. **WITHOUT clearing browser data, login as User B** (displayId: "USER2B")
   - Enable notifications
   - Check console for: `[OneSignal] ✓ OneSignal.login() SUCCESS for: USER2B`

4. **Verify in OneSignal Dashboard**
   - Search for External ID: "USER2B"
   - Should show: Active subscription with External ID "USER2B"
   - **CRITICAL**: Should NOT show "USER1A"

5. **Send test notification to User B**
   - Use endpoint: `POST /api/notification-preferences/test`
   - User B should receive it
   - User A should NOT receive it

6. **Check debug endpoint** for User B:
   ```bash
   GET /api/notification-preferences/debug
   ```
   Response should show:
   ```json
   {
     "user": { "displayId": "USER2B" },
     "database": { "oneSignalExternalId": "USER2B" },
     "summary": {
       "externalIdLinked": true,
       "externalIdMatchesDisplayId": true
     }
   }
   ```

**✅ Pass criteria**: User B has their own Player ID and External ID, not User A's

---

### Test 4: Native App (BuildNatively) - If Applicable (15 minutes)

1. **Install/Open native app**

2. **Login as User A**
   - Enable notifications
   - Verify push received

3. **Logout User A**
   - Check that `removeExternalId()` is called (check logs)

4. **Login as User B on same device**
   - Enable notifications
   - Verify new Player ID is generated
   - Verify External ID is "USER2B"
   - Send test notification → Should receive it

**✅ Pass criteria**: Each user gets their own Player ID on native app

---

### Test 5: No Side Effects Verification (5 minutes)

After all OneSignal tests, verify other features still work:

1. **Supabase Auth**
   - Login/logout works ✓
   - Session persists correctly ✓

2. **Image Uploads**
   - Profile picture upload works ✓
   - Images display correctly ✓

3. **Stripe Integration**
   - Subscription status displays ✓
   - Payment methods load ✓

4. **Other LocalStorage Data**
   - Dashboard selection persists (if you use it) ✓
   - Other app preferences intact ✓

5. **Notification Preferences**
   - Toggle switches work ✓
   - Preferences save correctly ✓

**✅ Pass criteria**: All non-OneSignal features work normally

---

## 🔍 Debugging Tools

### Debug Endpoint

Use this endpoint to inspect OneSignal data for the current user:

```bash
GET /api/notification-preferences/debug
Authorization: Bearer YOUR_TOKEN
```

**Response includes**:
- User info (userId, displayId, email)
- Database state (Player ID, External ID, settings)
- OneSignal API lookups (verification status)
- Summary flags (linked, matches, etc.)

### Console Logging

Key log messages to watch for:

**✅ Good logs**:
```
[OneSignal] ✅ Fetched displayId: ABC123
[OneSignal] ✓ OneSignal.login() SUCCESS for: ABC123
[OneSignal] ✓ Web SDK logout complete
[OneSignal] ✓ Database OneSignal columns cleared
```

**⚠️ Warning logs** (investigate but not necessarily errors):
```
[OneSignal] Already logged in, marking as success
[OneSignal] Web SDK logout warning: [error]
```

**❌ Error logs** (need investigation):
```
[OneSignal] ✗ OneSignal.login() failed: [error]
[OneSignal] Failed to clear database: [error]
```

### Manual Database Queries

**Check a specific user**:
```sql
SELECT 
  np.user_id,
  u.display_id,
  np.onesignal_player_id,
  np.onesignal_external_id,
  np.push_enabled,
  np.updated_at
FROM notification_preferences np
LEFT JOIN users u ON u.id = np.user_id
WHERE u.display_id = 'ABC123';
```

**Find all users with OneSignal data**:
```sql
SELECT 
  COUNT(*) FILTER (WHERE onesignal_player_id IS NOT NULL) as with_player_id,
  COUNT(*) FILTER (WHERE onesignal_external_id IS NOT NULL) as with_external_id,
  COUNT(*) FILTER (WHERE push_enabled = true) as push_enabled_count
FROM notification_preferences;
```

---

## 🚨 Rollback Procedure (If Needed)

If issues arise, you can rollback by:

### 1. Revert Code Changes

```bash
git revert <commit-hash>
git push
```

### 2. Keep Database Clean

**DO NOT** repopulate old OneSignal data - this will recreate the problem.

### 3. Alternative: Disable OneSignal Temporarily

If you need to disable OneSignal entirely:

1. Comment out `<OneSignalProvider>` in `App.tsx`
2. Set `pushEnabled = false` for all users:
   ```sql
   UPDATE notification_preferences SET push_enabled = false;
   ```

---

## 📊 Post-Deployment Monitoring

### First 24 Hours

Monitor for:
- [ ] User login errors (should be zero)
- [ ] Push notification delivery rates (should improve)
- [ ] OneSignal API errors in logs (should decrease)
- [ ] User complaints about notifications (should decrease)

### Metrics to Track

**Before fix**:
- External ID link failure rate: ~XX%
- Users with notifications enabled: XX
- Average delivery rate: XX%

**After fix** (expected improvements):
- External ID link failure rate: <5%
- Users with notifications enabled: (same or higher)
- Average delivery rate: >90%

### OneSignal Dashboard

Check daily:
1. **Audience → All Users**: Verify External IDs are set correctly
2. **Delivery → All Notifications**: Check delivery vs sent ratio
3. **Settings → Keys & IDs**: Confirm API credentials haven't changed

---

## ❓ FAQ / Troubleshooting

### Q: Users don't see their notifications after update

**A**: This is expected! Users need to:
1. Enable push notifications again in their settings
2. Allow browser notification permissions if prompted
3. The old Player IDs were stale and needed to be cleared

### Q: External ID is still not linking

**A**: Check:
1. Is the user's `displayId` set in the database?
2. Run the debug endpoint to see exact state
3. Check browser console for login errors
4. Verify OneSignal API credentials are correct

### Q: What if a user was in the middle of a session during deployment?

**A**: 
- Their existing session will continue working
- On next logout/login, they'll get the new behavior
- No data loss or corruption will occur

### Q: Can I test this on staging first?

**A**: YES! Recommended flow:
1. Deploy to staging
2. Run all 5 tests above
3. Leave staging running for 24 hours
4. If successful, deploy to production

### Q: What about users who never log out?

**A**: 
- Their old Player ID will persist until they logout
- This is fine - it doesn't break anything
- On their next logout/login, they'll get a fresh Player ID
- Consider adding a banner encouraging users to "refresh" their notification settings

---

## ✅ Final Verification Checklist

After deployment, confirm:

- [ ] All code changes deployed successfully
- [ ] Database migration ran successfully (0 OneSignal records remain)
- [ ] Test User A can login and enable notifications
- [ ] Test User A receives test notifications
- [ ] Test User A can logout (cleanup logs appear)
- [ ] Test User B can login on same device/browser
- [ ] Test User B gets their own Player ID (not User A's)
- [ ] Test User B receives their notifications
- [ ] Debug endpoint returns accurate data
- [ ] No errors in server logs
- [ ] Supabase auth still works
- [ ] Other app features unaffected
- [ ] OneSignal dashboard shows correct External IDs

---

## 📞 Support Contacts

If issues arise:

**Technical Support**:
- Check server logs first: Look for `[OneSignal]` prefixed messages
- Use debug endpoint: `GET /api/notification-preferences/debug`
- OneSignal Dashboard: https://onesignal.com (check audience data)

**Emergency Rollback**:
- Revert code via git
- Keep database clean (don't restore old OneSignal data)

---

## 📝 Summary

This fix resolves the root cause of the "old Player ID persistence" issue by:

1. ✅ Properly calling OneSignal SDK logout methods
2. ✅ Clearing device-level IndexedDB and localStorage
3. ✅ Cleaning up database records on logout
4. ✅ Fixing race conditions in login flow
5. ✅ Adding comprehensive debugging tools

**Expected Outcome**: 
- Each user gets a fresh OneSignal Player ID on login
- External IDs are correctly linked to user displayIds
- Notifications are delivered to the intended recipients
- No cross-user notification contamination

**User Impact**:
- Existing users need to re-enable push notifications once
- Better notification reliability going forward
- No data loss or feature regression

---

*Last Updated: December 12, 2025*
