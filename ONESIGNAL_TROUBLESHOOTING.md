# OneSignal Troubleshooting - Permission Blocked & Native App Issues

## 🎯 **Your Current Situation**

Based on your testing:

### Web Browser Status:
- ✅ **External ID works** - Shows `LFB3Kf` in OneSignal dashboard
- ✅ **Login succeeds** - `[OneSignal] ✓ OneSignal.login() SUCCESS`
- ❌ **Subscription fails** - "Permission blocked" error
- ❌ **Can't receive notifications** - User not subscribed

### Native Mobile App Status:
- ✅ **Subscription works** - User IS subscribed to push notifications
- ❌ **External ID missing** - Not populating in OneSignal dashboard
- ❌ **Can't target user** - Notifications won't reach them by displayId

---

## 🔧 **Fix 1: Web Browser "Permission blocked" Error**

### Root Cause

The error `Error: Permission blocked` occurs when the browser **CANNOT** request push notification permissions. This is almost always due to:

### 🔴 **MOST LIKELY: You're using HTTP instead of HTTPS**

Push notifications **require HTTPS** (or localhost). If your site is on `http://`, browsers block notification requests for security.

**Check your URL:**
```javascript
// Run in browser console:
console.log('Protocol:', window.location.protocol);
// Should be: "https:" or "http:" (only if localhost)
```

**Solutions:**

#### Option A: Enable HTTPS on Your Server
1. Get an SSL certificate (free from Let's Encrypt)
2. Configure your web server to use HTTPS
3. Redirect HTTP to HTTPS

#### Option B: Test Locally
If testing locally:
```bash
# Make sure you're on localhost, not your IP address
http://localhost:3000  ✅ OK
http://192.168.1.x:3000  ❌ Blocked
```

#### Option C: Use ngrok for HTTPS Testing
```bash
# Install ngrok
npm install -g ngrok

# Create HTTPS tunnel
ngrok http 3000

# Use the https:// URL provided
```

### Other Possible Causes

#### 1. User Previously Blocked Notifications

**Chrome/Edge Fix:**
1. Click lock icon 🔒 in address bar
2. Site Settings
3. Notifications → Change from "Block" to "Ask" or "Allow"
4. Refresh page

**Firefox Fix:**
1. Click lock icon 🔒
2. Click ">" next to "Permissions"
3. Find "Receive Notifications"
4. Remove the "Blocked" status

#### 2. Browser Settings Block All Notifications

**Chrome:**
1. Settings → Privacy and security → Site Settings
2. Notifications
3. Make sure "Sites can ask to send notifications" is enabled

**Firefox:**
1. Settings → Privacy & Security
2. Permissions → Notifications → Settings
3. Make sure your site isn't in the blocked list

#### 3. Incognito/Private Mode

Some browsers block notifications in private browsing. Test in regular mode.

---

## 🔧 **Fix 2: Native App External ID Not Populating**

### What I Just Fixed

I reordered the login method priority to **prioritize native SDK methods** over web SDK methods.

**Before:** Tried `window.OneSignal.login()` first (might exist in native wrapper but not work)
**After:** Tries `NativelyNotifications.login()` and `setExternalId()` FIRST

### Updated Code (client/src/hooks/useOneSignal.ts)

```typescript
// PRIORITY 1: Try Native SDK methods first
if (notifications?.login) {
  notifications.login(userId);  // Native login
  return;
}

// PRIORITY 2: Try setExternalId for native
if (notifications?.setExternalId) {
  notifications.setExternalId({ externalId: userId }, callback);
  return;
}

// PRIORITY 3: Web SDK (only if not native)
if (window.OneSignal?.login) {
  await window.OneSignal.login(userId);
}
```

### What You Need to Do

1. **Rebuild your native app** with the updated code
2. **Reinstall the APK** on your test device
3. **Check console logs** in the native app (if possible)
4. **Verify External ID** appears in OneSignal dashboard

### Expected Native App Logs

You should now see:
```
[OneSignal Native] Calling NativelyNotifications.login()...
[OneSignal Native] ✓ NativelyNotifications.login() called for: LFB3Kf
```

Instead of:
```
[OneSignal] Calling window.OneSignal.login()...  ← Wrong for native
```

---

## 📊 **Automatic Push Notification Authorization**

You mentioned:
> "Ideally we automatically authorize push notifications"

### ⚠️ **This is NOT possible by design**

Browsers and mobile OS **require explicit user consent** for push notifications. This is a security/privacy feature that CANNOT be bypassed.

**What you CAN do:**

### 1. **Prompt Users Immediately on Login**

After successful login, show a modal/message explaining why notifications are valuable:

```typescript
// After login success
if (!hasNotificationPermission) {
  // Show your custom UI explaining benefits
  showNotificationPromptUI();
}
```

### 2. **Make the Prompt Compelling**

Instead of browser's default prompt, use your own UI:
```
🔔 Stay Updated!

Get instant notifications for:
✓ New messages
✓ Game reminders  
✓ Team updates

[Enable Notifications] [Maybe Later]
```

### 3. **Pre-register External ID (What We're Doing Now)**

Even before permission is granted:
- ✅ External ID is set (`LFB3Kf`)
- ✅ User is linked in OneSignal
- ⏳ Waiting for permission
- When granted → Subscription automatically linked

### 4. **Native Apps: Request Permission Early**

In native apps, request permission during onboarding:

```typescript
// During app first launch
const granted = await requestPermission();
if (granted) {
  // User can receive notifications immediately
}
```

**Important:** You can't force it, but you can make it easy and clear WHY they should enable it.

---

## 🧪 **Testing Procedure**

### Web Browser Test

1. **Check Protocol:**
   ```javascript
   console.log(window.location.protocol); // Must be "https:" or "http:" (localhost only)
   ```

2. **Check Permission Status:**
   ```javascript
   console.log(Notification.permission); // Should be "default" or "granted", NOT "denied"
   ```

3. **If HTTPS and not blocked:**
   - Login → Should see `✓ OneSignal.login() SUCCESS`
   - Check OneSignal dashboard → External ID should show `LFB3Kf`
   - Enable notifications → Should NOT get "Permission blocked"
   - Should get browser permission prompt
   - Grant permission → Subscription created

### Native App Test

1. **Rebuild and reinstall app** with updated code

2. **Login and check logs:**
   - Should see: `[OneSignal Native] Calling NativelyNotifications.login()...`
   - Should see: `[OneSignal Native] ✓ NativelyNotifications.login() called for: LFB3Kf`

3. **Check OneSignal Dashboard:**
   - Find the user (search by subscription)
   - External ID field should show: `LFB3Kf`

4. **Test notification:**
   - Send test notification via backend
   - Should receive on device

---

## 🎯 **Expected Results After Fixes**

### Web Browser (HTTPS):
- ✅ External ID: `LFB3Kf`
- ✅ Login successful
- ✅ Can request permission (no "blocked" error)
- ✅ Subscription created after permission granted
- ✅ Can receive notifications

### Native App:
- ✅ External ID: `LFB3Kf`
- ✅ Login successful
- ✅ Subscription created
- ✅ Can receive notifications
- ✅ Notifications target by displayId works

---

## 🔍 **Diagnostic Commands**

### Check Web Browser Environment

```javascript
// Run in browser console:
console.log({
  protocol: window.location.protocol,
  permission: Notification.permission,
  isSecureContext: window.isSecureContext,
  hasOneSignal: typeof window.OneSignal !== 'undefined',
  hasNative: typeof window.NativelyNotifications !== 'undefined'
});
```

**Expected for Web:**
```javascript
{
  protocol: "https:",           // ✅ Must be https: or http: (localhost)
  permission: "default",         // ✅ Or "granted", NOT "denied"
  isSecureContext: true,         // ✅ Must be true
  hasOneSignal: true,
  hasNative: false
}
```

**Expected for Native Wrapper:**
```javascript
{
  protocol: "http:",             // Native wrapper may use http:
  permission: "default",
  isSecureContext: false,        // May be false in native
  hasOneSignal: true,
  hasNative: true                // ✅ This is key for native
}
```

### Check OneSignal Dashboard

1. Go to: OneSignal Dashboard → Audience → All Users
2. Look for newest user
3. Check fields:
   - **External ID**: Should show `LFB3Kf`
   - **Subscribed**: Should show ✓ (if permission granted)
   - **Last Active**: Should show recent timestamp

### Debug API Endpoint

```bash
GET /api/notification-preferences/debug
Authorization: Bearer YOUR_TOKEN
```

Response should show:
```json
{
  "user": {
    "displayId": "LFB3Kf"
  },
  "database": {
    "oneSignalPlayerId": null,     // ✅ No longer stored
    "oneSignalExternalId": null    // ✅ No longer stored
  },
  "oneSignalApi": {
    "externalIdVerification": {
      "linked": true,               // ✅ Should be true
      "userData": { /* ... */ }
    }
  },
  "summary": {
    "externalIdLinked": true        // ✅ Key check
  }
}
```

---

## ❓ **Common Questions**

### Q: Can I force-enable notifications without asking?
**A:** No. Browsers and mobile OS require explicit user consent for privacy/security. This is a hard requirement that cannot be bypassed.

### Q: Why does it work on native but not web (or vice versa)?
**A:** 
- **Web**: Requires HTTPS (except localhost)
- **Native**: Uses native SDK, different API, different permissions model

### Q: Can I test on HTTP locally?
**A:** Only if using `localhost`. IP addresses like `192.168.x.x` require HTTPS.

### Q: Why isn't External ID set on native app?
**A:** The code was prioritizing web SDK methods. The fix reorders to try native SDK methods first.

### Q: How do I know if it's working?
**A:**
- Web: External ID appears in dashboard, permission prompt works
- Native: External ID appears in dashboard, can receive notifications
- Both: Debug endpoint shows `externalIdLinked: true`

---

## 🚀 **Next Steps**

### For Web Browser Issue:

1. **Confirm your site is on HTTPS**
   - If not, set up SSL certificate
   - Or use ngrok for testing

2. **Clear browser data**
   - Cookies, cache, site data
   - Especially notification permissions

3. **Test in fresh browser profile**
   - Chrome: Create new profile
   - Firefox: New profile
   - Or use Incognito (if notifications allowed there)

4. **Verify permission status is "default"**
   - Not "denied"
   - Reset if needed in browser settings

### For Native App Issue:

1. **Pull latest code** with the fix

2. **Rebuild native app**
   ```bash
   # Your build command here
   ```

3. **Uninstall old app completely**

4. **Install new APK**

5. **Test login** and check logs

6. **Verify External ID** in OneSignal dashboard

---

## 📞 **If Still Not Working**

If you still have issues after these fixes:

1. **For Web - Share:**
   - Your website URL (full URL)
   - Browser console output of diagnostic commands above
   - Screenshot of browser address bar (to see lock icon)
   - Permission status from browser settings

2. **For Native - Share:**
   - Native app console logs (if available)
   - OneSignal dashboard screenshot (showing user without External ID)
   - Confirm which login method is being called
   - App build configuration (OneSignal App ID, etc.)

---

*Updated: December 12, 2025*
