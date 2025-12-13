# ✅ VERIFICATION CHECKLIST

Use this checklist to verify the OneSignal External ID fix is working correctly.

---

## 🔧 **PRE-DEPLOYMENT**

- [ ] **Environment Variables Set**
  ```bash
  # Check .env file contains:
  grep VITE_ONESIGNAL_APP_ID .env
  ```
  Expected: `VITE_ONESIGNAL_APP_ID=your-app-id-here`

- [ ] **Code Changes Committed**
  ```bash
  git status
  ```
  Expected: Clean working tree or staged changes ready to commit

- [ ] **Dependencies Installed**
  ```bash
  npm install
  ```
  Expected: No errors

- [ ] **Build Succeeds**
  ```bash
  npm run build
  ```
  Expected: Build completes without errors

---

## 📱 **NATIVE APP TESTING**

### **Installation**

- [ ] **Old App Uninstalled**
  - Completely remove old APK from device
  - Clear all app data
  - Restart device (optional but recommended)

- [ ] **New APK Built**
  - Trigger new build on BuildNatively
  - Download new APK file
  - Transfer to device

- [ ] **New App Installed**
  - Install APK on device
  - Launch app successfully

### **Login and Initialization**

- [ ] **User Logs In**
  - Enter credentials
  - Login succeeds
  - Redirected to dashboard

- [ ] **Console Logs Check** (use Chrome Remote Debugging)
  
  Expected logs in order:
  ```
  [OneSignal] ✅ Fetched displayId: LFB3Kf
  [OneSignal] Starting initialization for both web and native...
  [OneSignal] Initializing via window.OneSignal (works for web and native)
  [OneSignal] SDK initialized
  [OneSignal] ✓ Consent granted
  [OneSignal] Calling login with External ID (displayId): LFB3Kf
  [OneSignal Web] Calling window.OneSignal.login()...
  [OneSignal Web] ✓ OneSignal.login() SUCCESS for: LFB3Kf
  ```

- [ ] **No Errors in Console**
  - No "NativelyNotifications not available" messages
  - No "External ID failed" errors
  - No permission errors (yet - that's next step)

### **Permission Grant**

- [ ] **Request Permission**
  - Tap notification settings button in app
  - System permission dialog appears
  - Grant permission: **"Allow"**

- [ ] **Permission Granted Successfully**
  
  Expected console logs:
  ```
  [OneSignal] Permission changed to: granted
  [OneSignal] Permission granted, subscription ID: abc-123-xyz
  [OneSignal] Player ID (for display only): abc-123-xyz
  [OneSignal] Push preferences enabled
  ```

### **OneSignal Dashboard Verification**

- [ ] **External ID Visible**
  1. Open OneSignal Dashboard
  2. Go to **Audience → All Users**
  3. Find your device (sort by "Last Active")
  4. **External ID field shows: `LFB3Kf`** ✅

- [ ] **Device Details Correct**
  - Platform: Android (or iOS)
  - Subscribed: Yes
  - Last Active: Just now
  - External ID: `LFB3Kf` ✅

### **Test Notification**

- [ ] **Create Test Message**
  1. In OneSignal dashboard: **Messages → New Push**
  2. Enter message title: "Test Notification"
  3. Enter message content: "Testing External ID targeting"
  4. Targeting: **"Send to Particular Segment(s)"**
  5. Click **"Add Filter"**
  6. Select: **"External User ID"** → **"is"** → `LFB3Kf`
  7. Send immediately

- [ ] **Notification Received**
  - Notification appears on device
  - Title and content match
  - Tapping opens app
  - **SUCCESS!** ✅

---

## 🌐 **WEB APP TESTING**

### **Browser Test**

- [ ] **Open Web App**
  - Navigate to your app URL
  - Login with credentials

- [ ] **Console Logs Check**
  
  Expected logs (similar to native):
  ```
  [OneSignal] ✅ Fetched displayId: LFB3Kf
  [OneSignal] Starting initialization for both web and native...
  [OneSignal] Initializing via window.OneSignal (works for web and native)
  [OneSignal] SDK initialized
  [OneSignal Web] ✓ OneSignal.login() SUCCESS for: LFB3Kf
  ```

- [ ] **Request Permission**
  - Click notification settings
  - Browser shows permission prompt
  - Click **"Allow"**

- [ ] **OneSignal Dashboard Shows Web Subscription**
  - New subscription appears for web
  - External ID: `LFB3Kf` ✅
  - Platform: Chrome (or other browser)

- [ ] **Web Notification Test**
  - Send test notification (same process as above)
  - Notification appears in browser
  - **SUCCESS!** ✅

---

## 🔍 **DEBUGGING (IF ISSUES)**

### **If External ID is Blank**

- [ ] **Check Console for displayId**
  ```
  Search logs for: "[OneSignal] ✅ Fetched displayId:"
  ```
  - If missing: Backend `/api/user` endpoint issue
  - If present: External ID linking issue

- [ ] **Check login() was called**
  ```
  Search logs for: "[OneSignal Web] ✓ OneSignal.login() SUCCESS"
  ```
  - If missing: Check for errors before this line
  - If present but External ID still blank: Rare OneSignal issue

- [ ] **Call Debug Endpoint**
  ```bash
  # Get current OneSignal state
  curl -H "Authorization: Bearer YOUR_TOKEN" \
    https://your-app.com/api/notification-preferences/debug
  ```
  - Check `oneSignalUser.external_id` value
  - Compare with `user.displayId`

### **If Notifications Don't Arrive**

- [ ] **Check Subscription Status**
  - OneSignal Dashboard → Device → "Subscribed: Yes"
  - If "No": Permission not granted correctly

- [ ] **Check Targeting**
  - Message filters: External User ID = `LFB3Kf`
  - Ensure exact match (case-sensitive)

- [ ] **Check App State**
  - For Android: Test with app in background
  - For iOS: Notifications work in all states
  - For Web: Browser must be open (not closed)

### **If window.OneSignal is Undefined**

This should NOT happen, but if it does:

- [ ] **Check OneSignal Script Loaded**
  ```javascript
  console.log('window.OneSignal:', typeof window.OneSignal);
  ```
  - If undefined: Check `index.html` has OneSignal SDK script
  - Check network tab for script load errors

- [ ] **Check App ID is Correct**
  ```javascript
  console.log('App ID:', import.meta.env.VITE_ONESIGNAL_APP_ID);
  ```
  - Must match OneSignal dashboard App ID exactly

- [ ] **Contact BuildNatively Support**
  - Provide error logs
  - Mention you're using OneSignal
  - Ask if they have any special OneSignal configuration

---

## ✅ **SUCCESS INDICATORS**

You know it's working when:

1. ✅ **Console shows**: `[OneSignal Web] ✓ OneSignal.login() SUCCESS for: LFB3Kf`
2. ✅ **Dashboard shows**: External ID = `LFB3Kf` for your device
3. ✅ **Test notification**: Arrives on device within seconds
4. ✅ **No errors**: Clean console logs, no "failed" or "error" messages
5. ✅ **Both platforms**: Works on both web AND native app

---

## 🎯 **FINAL VALIDATION**

### **The Ultimate Test**

1. **Login as User A** (displayId: `LFB3Kf`)
   - Enable notifications
   - Check dashboard: External ID = `LFB3Kf` ✅

2. **Send notification to User A**
   - Target: External User ID = `LFB3Kf`
   - Result: User A receives notification ✅

3. **Logout User A, Login as User B** (displayId: `ABC123`)
   - Enable notifications
   - Check dashboard: External ID = `ABC123` ✅

4. **Send notification to User B only**
   - Target: External User ID = `ABC123`
   - Result: Only User B receives notification ✅
   - User A does NOT receive it ✅

**If all above pass: Fix is working perfectly!** 🎉

---

## 📝 **NOTES**

- **displayId**: This is your app's user identifier (e.g., "LFB3Kf")
- **Player ID / Subscription ID**: OneSignal's internal device ID (not stored in your DB)
- **External ID**: Links your displayId to OneSignal's Player ID
- **You only need External ID**: Player ID is managed automatically by OneSignal

---

**Created:** December 12, 2025
**Purpose:** Verify OneSignal External ID fix for BuildNatively native app
