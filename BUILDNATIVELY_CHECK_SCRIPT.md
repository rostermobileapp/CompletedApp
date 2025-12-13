# 🔍 BuildNatively Object Detection Script

## **Add This to Your App for Debugging**

### **Option 1: Add to useOneSignal.ts (temporary)**

Add this at the very top of the main initialization `useEffect`:

```typescript
useEffect(() => {
  // === BUILDNATIVELY DEBUG ===
  console.log('=== BUILDNATIVELY OBJECT DETECTION ===');
  console.log('Document ready state:', document.readyState);
  console.log('');
  
  // Check for NativelyNotifications (constructor)
  console.log('window.NativelyNotifications:', typeof window.NativelyNotifications);
  if (window.NativelyNotifications) {
    console.log('✅ window.NativelyNotifications EXISTS!');
    try {
      const testInstance = new window.NativelyNotifications();
      console.log('✅ Can create instance');
      console.log('Instance methods:', Object.keys(testInstance));
    } catch (e) {
      console.error('❌ Error creating instance:', e);
    }
  } else {
    console.log('❌ window.NativelyNotifications is undefined');
  }
  console.log('');
  
  // Check for natively object (SDK methods)
  console.log('window.natively:', typeof window.natively);
  if (window.natively) {
    console.log('✅ window.natively EXISTS!');
    console.log('Methods:', Object.keys(window.natively));
  } else {
    console.log('❌ window.natively is undefined');
  }
  console.log('');
  
  // Check for Natively (alternate naming)
  console.log('window.Natively:', typeof window.Natively);
  if (window.Natively) {
    console.log('✅ window.Natively EXISTS!');
    console.log('Properties:', Object.keys(window.Natively));
  } else {
    console.log('❌ window.Natively is undefined');
  }
  console.log('');
  
  // Check ALL window properties containing "natively" or "onesignal"
  const allKeys = Object.keys(window);
  const nativelyKeys = allKeys.filter(k => k.toLowerCase().includes('natively'));
  const onesignalKeys = allKeys.filter(k => k.toLowerCase().includes('onesignal'));
  
  console.log('Window properties with "natively":', nativelyKeys.length ? nativelyKeys : 'NONE');
  console.log('Window properties with "onesignal":', onesignalKeys.length ? onesignalKeys : 'NONE');
  console.log('');
  
  // Check if running in native app
  const userAgent = navigator.userAgent;
  console.log('User Agent:', userAgent);
  console.log('Contains "BuildNatively"?', userAgent.includes('BuildNatively'));
  console.log('Contains "Natively"?', userAgent.includes('Natively'));
  console.log('');
  
  // Check for injected scripts
  const scripts = Array.from(document.scripts);
  const nativelyScripts = scripts.filter(s => 
    s.src?.includes('natively') || s.innerHTML?.includes('natively')
  );
  console.log('Scripts mentioning "natively":', nativelyScripts.length);
  if (nativelyScripts.length > 0) {
    nativelyScripts.forEach(s => console.log('  -', s.src || '(inline script)'));
  }
  console.log('');
  
  console.log('=== END BUILDNATIVELY DETECTION ===');
  // === END DEBUG ===
  
  // ... rest of your useEffect code
}, [/* your dependencies */]);
```

### **Option 2: Add to App.tsx (easier to test)**

Add this component temporarily:

```typescript
// Add to client/src/App.tsx
import { useEffect } from 'react';

function BuildNativelyDetector() {
  useEffect(() => {
    const checkBuildNatively = () => {
      console.log('=== BUILDNATIVELY OBJECT DETECTION ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Document ready:', document.readyState);
      console.log('');
      
      console.log('window.NativelyNotifications:', typeof window.NativelyNotifications);
      console.log('window.natively:', typeof window.natively);
      console.log('window.Natively:', typeof window.Natively);
      console.log('');
      
      const allKeys = Object.keys(window);
      const nativelyKeys = allKeys.filter(k => k.toLowerCase().includes('natively'));
      const onesignalKeys = allKeys.filter(k => k.toLowerCase().includes('onesignal'));
      
      console.log('Natively properties:', nativelyKeys.length ? nativelyKeys : 'NONE');
      console.log('OneSignal properties:', onesignalKeys.length ? onesignalKeys : 'NONE');
      console.log('');
      
      console.log('User Agent:', navigator.userAgent);
      console.log('');
    };
    
    // Check immediately
    checkBuildNatively();
    
    // Check after delays
    setTimeout(() => {
      console.log('[After 2s]');
      checkBuildNatively();
    }, 2000);
    
    setTimeout(() => {
      console.log('[After 5s]');
      checkBuildNatively();
    }, 5000);
    
    setTimeout(() => {
      console.log('[After 10s]');
      checkBuildNatively();
    }, 10000);
  }, []);
  
  return null; // Invisible component
}

// Then in your Router function, add:
return (
  <PermissionProvider>
    <OneSignalProvider>
      <BuildNativelyDetector /> {/* ADD THIS */}
      <ScrollToTop />
      {/* ... rest */}
    </OneSignalProvider>
  </PermissionProvider>
);
```

---

## 📱 **How to Run This**

### **Step 1: Add the code**
Choose Option 1 or Option 2 above

### **Step 2: Rebuild and install**
```bash
npm run build
# Build APK via BuildNatively
# Install on device
```

### **Step 3: Connect Chrome DevTools**

On your computer:
1. Open Chrome
2. Navigate to `chrome://inspect`
3. Connect your Android device via USB
4. Enable USB Debugging on device
5. Your app should appear in Chrome's device list
6. Click "Inspect"

### **Step 4: Launch app and check logs**

Launch the app on your device. In Chrome DevTools Console, you should see:

```
=== BUILDNATIVELY OBJECT DETECTION ===
Timestamp: 2025-12-12T...
Document ready: complete

window.NativelyNotifications: [function/undefined]
window.natively: [object/undefined]
window.Natively: [object/undefined]

Natively properties: [array or "NONE"]
OneSignal properties: [array or "NONE"]

User Agent: [user agent string]
```

---

## 🎯 **WHAT THE RESULTS MEAN**

### **✅ If you see:**
```
window.NativelyNotifications: function ✅
window.natively: object ✅
```

**This means:** BuildNatively SDK is loaded! The issue is in our initialization code.
**Next step:** Review the initialization logic in `useOneSignal.ts`

### **❌ If you see:**
```
window.NativelyNotifications: undefined ❌
window.natively: undefined ❌
Natively properties: NONE ❌
```

**This means:** BuildNatively SDK is NOT being loaded at all.
**Next step:**
1. Check BuildNatively project settings
2. Ensure OneSignal integration is enabled
3. Contact BuildNatively support

### **🤔 If you see:**
```
window.NativelyNotifications: undefined
window.natively: object ✅
```

**This means:** BuildNatively SDK is partially loaded, but missing the notifications part.
**Next step:**
1. Check if OneSignal integration is enabled in BuildNatively settings
2. Contact support about missing `NativelyNotifications` constructor

### **🌐 If you see:**
```
window.OneSignal: object ✅
(but no NativelyNotifications)
```

**This means:** You might be testing in a browser, not the actual APK.
**Next step:** Make sure you're testing the BuildNatively-built APK on a device.

---

## 📊 **EXPECTED RESULTS**

### **In Browser (Web):**
```
window.NativelyNotifications: undefined (expected)
window.natively: undefined (expected)
window.OneSignal: object ✅
```

### **In BuildNatively APK (Native):**
```
window.NativelyNotifications: function ✅
window.natively: object ✅
window.OneSignal: object ✅ (maybe)
```

---

## 🚀 **NEXT STEPS BASED ON RESULTS**

### **If BuildNatively SDK is loaded:**
→ Issue is in our initialization code
→ I can help fix it

### **If BuildNatively SDK is NOT loaded:**
→ Issue is in BuildNatively configuration
→ You need to contact BuildNatively support
→ Show them these debug logs

---

**Please run this and share the console output!** This will definitively tell us whether the issue is:
1. **Configuration** (SDK not loading)
2. **Timing** (SDK loading too late)
3. **Code** (Our initialization logic)
