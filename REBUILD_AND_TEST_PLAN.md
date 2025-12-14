# 🚀 Rebuild & Test Plan

## 📋 **Pre-Rebuild Verification**

### ✅ Code is Ready:
- Debug component installed in App.tsx ✅
- Enhanced logging in useOneSignal.ts ✅
- OneSignal SDK in index.html ✅

### ✅ BuildNatively Configuration (verify these are still enabled):
- [ ] Firebase: Enabled for Android
- [ ] OneSignal: Enabled for Android
- [ ] google-services.json: Uploaded
- [ ] Package names: Match

---

## 🔨 **STEP 1: REBUILD**

1. **Trigger new build** on BuildNatively
2. **Wait for build to complete**
3. **Download new APK**

---

## 📱 **STEP 2: INSTALL & PREPARE**

1. **Completely uninstall old app** from Android device
2. **Install new APK**
3. **DO NOT launch yet**

---

## 🔍 **STEP 3: CONNECT DEVTOOLS (Try This Method)**

### **Method A: Using Chrome Remote Debugging (Preferred)**

1. On Android device:
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable "USB Debugging"
   - Connect to computer via USB
   - Allow USB debugging when prompted

2. On computer:
   - Open Chrome → `chrome://inspect/#devices`
   - Wait for device to appear
   - Should see your app listed

3. **Launch the app on device**

4. In Chrome:
   - Click "Inspect" next to your app
   - Console will show all logs

### **Method B: If USB Debugging Fails (Fallback)**

Just look at the visual debug panel on the phone screen. It will show:
- Whether NativelyNotifications is available
- Timing information
- Any errors

---

## 📊 **STEP 4: COLLECT DEBUG INFO**

After launching app and logging in, I need these logs:

### **A. Initial Load Logs (First 30 seconds)**

**Copy EVERYTHING from console starting with:**
```
[Bridge Debug] Component mounted
```

**Through to:**
```
[Bridge Debug] ❌ Polling timeout
// OR
[Bridge Debug] ✅ NativelyNotifications became available
```

### **B. OneSignal Initialization Logs**

**Look for and copy:**
```
[OneSignal Native] Starting initialization...
[OneSignal] window.NativelyNotifications exists: [function/undefined]
[OneSignal] === STARTING INITIALIZATION ===
...
[OneSignal Web] Calling login with External ID (displayId): LFB3Kf
[OneSignal Web] ✓ OneSignal.login() SUCCESS for: LFB3Kf
```

### **C. Manual Checks (Paste in Console)**

Run these commands in Chrome DevTools console:

```javascript
// Check 1: What's available?
console.log('=== MANUAL CHECKS ===');
console.log('window.NativelyNotifications:', typeof window.NativelyNotifications);
console.log('window.OneSignal:', typeof window.OneSignal);
console.log('window.natively:', typeof window.natively);

// Check 2: Find all related properties
const keys = Object.keys(window);
const related = keys.filter(k => 
  k.toLowerCase().includes('natively') || 
  k.toLowerCase().includes('onesignal') ||
  k.toLowerCase().includes('firebase')
);
console.log('Related window properties:', related);

// Check 3: User agent
console.log('User Agent:', navigator.userAgent);

// Check 4: Check if OneSignal initialized
if (window.OneSignal) {
  window.OneSignal.User.getExternalId().then(id => {
    console.log('External ID from SDK:', id);
  });
}
```

**Copy the full output of these checks!**

### **D. Visual Debug Panel**

If you can see the debug panel on the phone screen, take a screenshot showing:
- Status (Available/Waiting/Timeout)
- Timing information
- Related window properties

---

## 🎯 **STEP 5: CHECK ONESIGNAL DASHBOARD**

1. Go to **OneSignal Dashboard** (on computer)
2. **Audience → All Users**
3. **Sort by "Last Active"**
4. **Look for your device** (should be at top if it worked)

**Tell me:**
- Does device appear? YES/NO
- If YES:
  - External ID: `________` (blank or LFB3Kf?)
  - Subscribed: YES/NO
  - Platform: Android/Web
  - Click on device → Screenshot device details

---

## 📧 **STEP 6: WHAT TO SEND ME**

### **Required Info:**

1. **Console Logs (Most Important!):**
   - Full output from "Bridge Debug" component (Section A above)
   - OneSignal initialization logs (Section B above)
   - Manual checks output (Section C above)

2. **OneSignal Dashboard:**
   - Does device appear? YES/NO
   - If YES: Screenshot of device details
   - If NO: Confirm you checked "All Users" and sorted by "Last Active"

3. **BuildNatively Build Logs (If Accessible):**
   - BuildNatively → Your Project → Builds → Latest Build → View Logs
   - Look for mentions of "OneSignal", "Firebase", "google-services"
   - Screenshot or copy any relevant lines

### **Optional But Helpful:**

4. **User Agent String:**
   - From manual checks (Section C)
   - Tells me if it's actually running as native app

5. **Visual Debug Panel:**
   - Screenshot if visible on phone

---

## 🔍 **WHAT I'M LOOKING FOR**

### **Scenario 1: NativelyNotifications Available ✅**
```
[Bridge Debug] ✅ NativelyNotifications became available after 500ms
[OneSignal] window.NativelyNotifications exists: function
[OneSignal Native] ✓ SDK instance created
```
→ **Good!** BuildNatively is working. Issue is in our initialization code.

### **Scenario 2: NativelyNotifications Never Appears ❌**
```
[Bridge Debug] ❌ Polling timeout after 30000ms
[OneSignal] window.NativelyNotifications exists: undefined
[OneSignal] Falling back to Web Push SDK
```
→ **Bad.** BuildNatively is NOT including native bridge. Need to contact their support.

### **Scenario 3: OneSignal Web SDK Works ✅**
```
[OneSignal Web] ✓ OneSignal.login() SUCCESS for: LFB3Kf
[OneSignal Web] Subscription ID: [some-id]
```
→ **Interesting.** Web SDK works in native wrapper. Might be acceptable workaround.

---

## 🎯 **SUCCESS CRITERIA**

We'll know it's working when:

1. ✅ Device appears in OneSignal Dashboard
2. ✅ External ID shows: `LFB3Kf`
3. ✅ Subscribed: Yes
4. ✅ Console shows successful login
5. ✅ Test notification arrives on device

---

## ⚡ **QUICK SUMMARY**

**What to do:**
1. Rebuild APK
2. Uninstall old app
3. Install new APK
4. Launch app, login
5. Copy ALL console logs
6. Check OneSignal dashboard
7. Send me the info above

**I need to see:**
- Console logs (most important!)
- Whether device appears in OneSignal
- BuildNatively build logs (if possible)

---

**Ready to rebuild! Let me know when you have the debug info!** 🚀
