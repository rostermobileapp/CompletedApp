# Native App Diagnostic - No Logs Required

## 🎯 **If You Can't View Logs**

If you can't access Android logs, we can diagnose through the OneSignal dashboard and your app's debug screen.

---

## 📊 **Test 1: Check Which Method is Available**

### Update your app's debug screen to show:

Add this to your NotificationPreferencesModal or debug component:

```typescript
// In your debug screen component
const [methodCheck, setMethodCheck] = useState<string>('Checking...');

useEffect(() => {
  // Check which methods are available
  if (window.NativelyNotifications) {
    const notifications = new window.NativelyNotifications();
    const hasLogin = typeof notifications.login === 'function';
    const hasSetExternalId = typeof notifications.setExternalId === 'function';
    
    setMethodCheck(
      `Native SDK: YES\n` +
      `login(): ${hasLogin ? 'Available ✓' : 'Missing ✗'}\n` +
      `setExternalId(): ${hasSetExternalId ? 'Available ✓' : 'Missing ✗'}`
    );
  } else {
    setMethodCheck('Native SDK: NO (Web mode)');
  }
}, []);

// Display in UI
<pre>{methodCheck}</pre>
```

**This will show you which methods your native SDK actually has.**

---

## 📊 **Test 2: Manual Login Test**

Add a button to your app to manually trigger login:

```typescript
const testNativeLogin = () => {
  if (window.NativelyNotifications && displayId) {
    const notifications = new window.NativelyNotifications();
    
    // Try method 1
    if (notifications.login) {
      console.log('Trying login()...');
      try {
        notifications.login(displayId);
        console.log('login() called successfully');
      } catch (err) {
        console.error('login() failed:', err);
      }
    }
    
    // Try method 2
    if (notifications.setExternalId) {
      console.log('Trying setExternalId()...');
      notifications.setExternalId({ externalId: displayId }, (resp) => {
        console.log('setExternalId response:', resp);
        alert('setExternalId response: ' + JSON.stringify(resp));
      });
    }
  }
};

// Add button
<button onClick={testNativeLogin}>Test Native Login</button>
```

**Click the button, then check OneSignal dashboard** - does External ID appear?

---

## 📊 **Test 3: BuildNatively Configuration Check**

Verify your BuildNatively configuration includes:

### In your `app.json` or BuildNatively config:

```json
{
  "plugins": [
    [
      "onesignal-expo-plugin",
      {
        "mode": "production",
        "devTeam": "YOUR_TEAM_ID"
      }
    ]
  ]
}
```

### OneSignal SDK version:

Check which OneSignal SDK version BuildNatively is using:
- Should be v5.x
- If it's v4.x or earlier, the `login()` method doesn't exist

---

## 🔍 **What the Issue Might Be**

Based on "External ID: BLANK" but "Subscribed: Yes":

### Scenario 1: `login()` method doesn't exist
**Fix:** BuildNatively might be using an older OneSignal SDK version
- Check BuildNatively docs for OneSignal SDK version
- Update to v5+ if needed

### Scenario 2: `login()` exists but fails silently
**Fix:** The method is throwing an error we're not seeing
- Try the manual test button above
- See if any alert/error appears

### Scenario 3: Login is called but OneSignal hasn't synced yet
**Fix:** Wait a few minutes, then check dashboard again
- Sometimes OneSignal takes time to sync External ID
- Refresh dashboard after 2-3 minutes

### Scenario 4: Wrong OneSignal App ID
**Fix:** Verify BuildNatively is using the correct OneSignal App ID
- Check environment variables
- Confirm it matches your OneSignal dashboard

---

## 🎯 **Quick Workaround**

If the native SDK doesn't support `login()`, we can use the REST API instead:

### Add this to your native initialization:

```typescript
// After getting Player ID
notifications.getOneSignalId(async (resp) => {
  if (resp.playerId && displayId) {
    // Use backend API to set External ID
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch('/api/notification-preferences/link-external-id', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          oneSignalId: resp.playerId,
          userId: displayId
        }),
      });
    }
  }
});
```

This uses your existing backend endpoint to set the External ID via REST API.

---

## 📞 **Information Needed**

To help diagnose further, please share:

1. **BuildNatively configuration** - What OneSignal SDK version?
2. **Debug screen output** - Copy the exact text shown
3. **Dashboard status** - Does External ID appear after waiting 5 minutes?
4. **Test button result** - If you add the manual test button, what happens?

---

*Native App Diagnostic Guide - December 12, 2025*
