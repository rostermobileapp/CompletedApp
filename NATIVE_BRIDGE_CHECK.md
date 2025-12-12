# Native Bridge Diagnostic

## 🔍 **The Real Problem**

Your app shows:
- **SDK Initialized: NO** ← React can't talk to native SDK
- **BUT notifications work manually** ← Native SDK is actually configured

This means the **native bridge isn't connecting** to your React code.

---

## 📱 **Check What's Available**

Add this diagnostic component to your app temporarily:

```typescript
// Add to any page after login
useEffect(() => {
  console.log('=== NATIVE BRIDGE DIAGNOSTIC ===');
  console.log('1. window.NativelyNotifications:', typeof window.NativelyNotifications);
  console.log('2. window.OneSignal:', typeof window.OneSignal);
  console.log('3. window.plugins:', typeof (window as any).plugins);
  console.log('4. window.cordova:', typeof (window as any).cordova);
  
  // Check all window properties for "onesignal" or "natively"
  const relevantKeys = Object.keys(window).filter(key => 
    key.toLowerCase().includes('onesignal') || 
    key.toLowerCase().includes('natively') ||
    key.toLowerCase().includes('notification')
  );
  console.log('5. Relevant window properties:', relevantKeys);
  
  // Try to instantiate
  if (window.NativelyNotifications) {
    try {
      const notif = new window.NativelyNotifications();
      console.log('6. Can create instance: YES');
      console.log('7. Instance methods:', Object.keys(notif));
    } catch (err) {
      console.log('6. Can create instance: NO -', err);
    }
  }
  
  console.log('=== END DIAGNOSTIC ===');
}, []);
```

---

## 🎯 **What to Look For**

### **If it shows:**
```
window.NativelyNotifications: undefined
```
→ BuildNatively isn't exposing the bridge properly

### **If it shows:**
```
window.NativelyNotifications: function
```
→ Bridge exists, but timing issue (loads after React)

### **If it shows other OneSignal properties:**
```
window.OneSignalWebSDK
window.OneSignalNative
etc.
```
→ BuildNatively might be exposing it differently

---

## 🔧 **Alternative Solutions**

Since manual notifications work but React can't access the SDK, we have options:

### **Option 1: Use Backend REST API (Recommended)**

Instead of trying to use the native SDK from React, use your backend to set External ID:

```typescript
// After user logs in and grants permission
useEffect(() => {
  const linkExternalIdViaBackend = async () => {
    if (!displayId || !isAuthenticated) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      
      // Get the OneSignal Player ID from the native level
      // (we know it exists because notifications work)
      
      // Wait a moment for subscription to register
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Call backend to link External ID via REST API
      const response = await fetch('/api/notification-preferences/link-external-id-native', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayId: displayId
        }),
      });
      
      const result = await response.json();
      console.log('[OneSignal] External ID linked via backend:', result);
      
      if (result.success) {
        setExternalIdSet(true);
      }
    } catch (err) {
      console.error('[OneSignal] Failed to link External ID via backend:', err);
    }
  };
  
  linkExternalIdViaBackend();
}, [displayId, isAuthenticated]);
```

### **Option 2: Native-Level Configuration**

Configure OneSignal External ID at the native level in BuildNatively config:

```json
{
  "onesignal": {
    "setExternalIdOnLogin": true,
    "externalIdField": "userId"
  }
}
```

(Check BuildNatively docs for exact syntax)

### **Option 3: Delay React Initialization**

If the bridge loads slowly, delay React initialization:

```typescript
// In your App.tsx or main file
useEffect(() => {
  // Wait for native bridge to be ready
  const waitForBridge = setInterval(() => {
    if (window.NativelyNotifications) {
      clearInterval(waitForBridge);
      // Now initialize your OneSignal hook
      setNativeBridgeReady(true);
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => clearInterval(waitForBridge), 10000);
}, []);
```

---

## 💡 **Quick Backend Solution**

Let me create a new backend endpoint that finds the user's OneSignal subscription and links the External ID:

