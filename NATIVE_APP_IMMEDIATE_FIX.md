# Native App - Immediate Fix (Manual Linking)

## 🎯 **Current Situation**

- ✅ Native OneSignal SDK is configured (notifications work manually)
- ✅ Device is subscribed to push notifications
- ❌ React can't access the native SDK (`window.NativelyNotifications` not available)
- ❌ External ID not being set automatically

## ⚡ **Immediate Workaround (Manual Linking)**

Since the React bridge isn't working, let's manually link the External ID using the OneSignal dashboard.

---

### **Step 1: Find the Player ID in OneSignal Dashboard**

1. Go to **OneSignal Dashboard → Audience → All Users**

2. Look for **your Android device** (newest subscriber)
   - Platform: Android
   - Last Active: Just now
   - Subscribed: Yes

3. **Click on the user** to view details

4. **Copy the Player ID** (long string like `a1b2c3d4-e5f6-7890-...`)

---

### **Step 2: Link External ID via API**

Open your browser console (F12) on your **web app** (not mobile) and run:

```javascript
// Replace with your values
const PLAYER_ID = 'paste-player-id-here';
const DISPLAY_ID = 'LFB3Kf'; // Your displayId

fetch('/api/notification-preferences/link-external-id', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`, // Adjust if needed
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    oneSignalId: PLAYER_ID,
    userId: DISPLAY_ID
  })
}).then(r => r.json()).then(console.log);
```

---

### **Step 3: Verify It Worked**

1. **Refresh OneSignal Dashboard**
2. Find the same user
3. **External ID should now show:** `LFB3Kf` ✅

---

### **Step 4: Test Notification**

Send a test notification:

```bash
POST /api/notification-preferences/test
Authorization: Bearer YOUR_TOKEN
```

Should receive on device! ✅

---

## 🔧 **Long-Term Fix: Debug Native Bridge**

The React bridge issue needs investigation. Here's what to check:

### **Check 1: BuildNatively Configuration**

In your BuildNatively project settings, verify:

```json
{
  "expo": {
    "plugins": [
      [
        "onesignal-expo-plugin",
        {
          "mode": "production"
        }
      ]
    ]
  }
}
```

### **Check 2: OneSignal SDK Version**

You mentioned using SDK 5.4.1 - that's correct. But verify BuildNatively is actually using it:
- Check `package.json` for OneSignal version
- Check BuildNatively build logs

### **Check 3: Native Bridge Exposure**

BuildNatively might expose OneSignal differently. Try checking:

```javascript
// Add to your app temporarily
useEffect(() => {
  console.log('Checking for OneSignal...');
  console.log('window.OneSignal:', typeof window.OneSignal);
  console.log('window.OneSignalDeferred:', typeof window.OneSignalDeferred);
  console.log('window.NativelyNotifications:', typeof window.NativelyNotifications);
  
  // Check if it loads later
  setTimeout(() => {
    console.log('After 5s:');
    console.log('window.NativelyNotifications:', typeof window.NativelyNotifications);
  }, 5000);
}, []);
```

### **Check 4: Document Load Timing**

The native bridge might load AFTER React initializes. The code I just added waits for `document.readyState === 'complete'`, but you can also try:

```javascript
// In your App.tsx
useEffect(() => {
  console.log('Document ready state:', document.readyState);
  console.log('Native bridge available:', typeof window.NativelyNotifications);
}, []);
```

---

## 💡 **Alternative: Configure at Native Level**

If the React bridge continues to be problematic, configure OneSignal entirely at the native level:

### **In BuildNatively native code (if accessible):**

```java
// Android: In your Application.onCreate()
OneSignal.login(userId); // Call this after user logs in
```

```swift
// iOS: In your AppDelegate
OneSignal.login(externalId: userId)
```

This way External ID is set without needing the React bridge.

---

## 📊 **Summary**

### **Immediate Fix (Works Now):**
1. Get Player ID from OneSignal dashboard
2. Call `/api/notification-preferences/link-external-id` with Player ID and displayId
3. External ID is linked ✅
4. Notifications work ✅

### **Long-Term Investigation:**
- Why is `window.NativelyNotifications` not available?
- Is it a BuildNatively configuration issue?
- Is it a timing issue (loads too late)?
- Can we configure External ID at the native level instead?

### **For Now:**
Use the manual linking method above, and your native app notifications will work perfectly while we debug the bridge issue.

---

*Manual linking is a valid workaround and won't cause any issues!*
