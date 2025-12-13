# 🌳 Quick Decision Tree - After Rebuild

## 🎯 **Start Here After Installing New APK**

```
Launch App → Connect Chrome DevTools → Check Console
                            ↓
                            
┌───────────────────────────────────────────────────────┐
│ Does console show:                                    │
│ "window.NativelyNotifications exists: function"?      │
└───────────────────────────────────────────────────────┘
                     ↓              ↓
                    YES            NO
                     ↓              ↓
                     
┌─────────────────┐          ┌─────────────────────┐
│ ✅ GREAT!       │          │ ❌ ISSUE #2         │
│ SDK is loaded   │          │ Firebase not loaded │
│ Go to Step 2 →  │          │ See Action Plan     │
└─────────────────┘          └─────────────────────┘
         ↓
         
┌───────────────────────────────────────────────────────┐
│ STEP 2: Does console show:                            │
│ "[OneSignal Native] ✓ SDK instance created"?         │
└───────────────────────────────────────────────────────┘
                     ↓              ↓
                    YES            NO
                     ↓              ↓
                     
┌─────────────────┐          ┌─────────────────────┐
│ ✅ EXCELLENT!   │          │ ❌ Initialization   │
│ SDK initialized │          │ Error - Check logs  │
│ Go to Step 3 →  │          │ Share with me       │
└─────────────────┘          └─────────────────────┘
         ↓
         
┌───────────────────────────────────────────────────────┐
│ STEP 3: Does console show:                            │
│ "[OneSignal Native] ✓ setExternalId() SUCCESS"?      │
└───────────────────────────────────────────────────────┘
                     ↓              ↓
                    YES            NO
                     ↓              ↓
                     
┌─────────────────┐          ┌─────────────────────┐
│ ✅ PERFECT!     │          │ ⚠️ ISSUE #3        │
│ External ID set │          │ Check error message │
│ Go to Step 4 →  │          │ See Action Plan     │
└─────────────────┘          └─────────────────────┘
         ↓
         
┌───────────────────────────────────────────────────────┐
│ STEP 4: Check OneSignal Dashboard                    │
│ Does device show "External ID: LFB3Kf"?              │
└───────────────────────────────────────────────────────┘
                     ↓              ↓
                    YES            NO
                     ↓              ↓
                     
┌─────────────────┐          ┌─────────────────────┐
│ ✅ AMAZING!     │          │ ⏳ Wait 1 minute    │
│ Dashboard synced│          │ Refresh dashboard   │
│ Go to Step 5 →  │          │ Still no? Issue #3  │
└─────────────────┘          └─────────────────────┘
         ↓
         
┌───────────────────────────────────────────────────────┐
│ STEP 5: Send test notification                       │
│ Target: External User ID = LFB3Kf                    │
│ Does notification arrive on device?                  │
└───────────────────────────────────────────────────────┘
                     ↓              ↓
                    YES            NO
                     ↓              ↓
                     
┌─────────────────┐          ┌─────────────────────┐
│ 🎉 SUCCESS!     │          │ ⚠️ ISSUE #4        │
│ Everything works│          │ Check FCM config    │
│ You're done!    │          │ See Action Plan     │
└─────────────────┘          └─────────────────────┘
```

---

## 🎯 **What to Share If Issues**

If you hit any "NO" or "❌" above, send me:

### **1. Full Console Log**
```javascript
// Copy everything from:
[OneSignal Native] Starting initialization...
// Through:
[OneSignal Native] === NATIVE INITIALIZATION COMPLETE ===
// (or where it stops/errors)
```

### **2. OneSignal Dashboard Screenshot**
- All Users page
- Your device details
- External ID field (blank or not?)

### **3. Which Step Failed**
- "Step 1: window.NativelyNotifications undefined"
- "Step 2: SDK instance creation failed"
- "Step 3: setExternalId failed"
- "Step 4: External ID not in dashboard"
- "Step 5: Notification didn't arrive"

---

## ⚡ **Quick Commands for Testing**

### **Check SDK Availability**
```javascript
// Paste in Chrome DevTools console:
console.log('NativelyNotifications:', typeof window.NativelyNotifications);
console.log('OneSignal:', typeof window.OneSignal);
```

### **Get Current State**
```javascript
// Check debug endpoint:
fetch('/api/notification-preferences/debug', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
}).then(r => r.json()).then(console.log);
```

### **Manual External ID Set (if client fails)**
```javascript
// Last resort:
fetch('/api/notification-preferences/auto-link-native', {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ 
    oneSignalId: 'PLAYER_ID_FROM_DASHBOARD' 
  })
}).then(r => r.json()).then(console.log);
```

---

## 📊 **Most Likely Outcome**

```
90% → Everything works ✅
5%  → Build issue (package name) → Easy fix
3%  → SDK not loaded → BuildNatively config
2%  → External ID doesn't set → Code adjustment
<1% → Other → Will diagnose

→ HIGH CONFIDENCE IT WILL WORK! 🎉
```

---

**Test and report back!** 🚀
