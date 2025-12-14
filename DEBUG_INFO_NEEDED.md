# 🔍 Debug Info I Need to See

## ✅ **CRITICAL (Must Have)**

### 1. **Console Log Output**

**From the moment you launch the app through login, copy EVERYTHING that includes:**

```
[Bridge Debug] ...
[OneSignal Native] ...
[OneSignal] ...
[OneSignal Web] ...
```

**Specifically looking for:**
- `window.NativelyNotifications: [function/undefined]`
- `✅ NativelyNotifications became available` OR `❌ Polling timeout`
- `[OneSignal Web] ✓ OneSignal.login() SUCCESS for: LFB3Kf`
- Any errors or warnings

---

### 2. **OneSignal Dashboard Check**

**After logging into the app:**
- Open OneSignal Dashboard → Audience → All Users
- Sort by "Last Active"
- **Does your mobile device appear?** YES or NO
- If YES:
  - What's the External ID? (blank or LFB3Kf?)
  - Is it Subscribed? (Yes/No)
  - What platform? (Android/Web)

---

### 3. **Manual Console Checks**

**Paste this in Chrome DevTools console and copy the output:**

```javascript
console.log('window.NativelyNotifications:', typeof window.NativelyNotifications);
console.log('window.OneSignal:', typeof window.OneSignal);
console.log('Related properties:', Object.keys(window).filter(k => 
  k.toLowerCase().includes('natively') || k.toLowerCase().includes('onesignal')
));
```

---

## 📊 **HELPFUL (If Available)**

### 4. **BuildNatively Build Logs**

If you can access build logs in BuildNatively:
- Look for "OneSignal", "Firebase", "google-services"
- Any errors in red
- Screenshot or copy relevant sections

---

### 5. **User Agent String**

From console:
```javascript
console.log('User Agent:', navigator.userAgent);
```

This tells me if it's running as a native app or web view.

---

## 🎯 **The ONE KEY Question**

**After rebuild and install, what does this show:**

```javascript
typeof window.NativelyNotifications
```

- If **"function"** → BuildNatively IS working! 🎉
- If **"undefined"** → BuildNatively NOT including native bridge ❌

Everything else helps diagnose WHY, but this tells me WHAT the issue is.

---

## 📱 **If You Can't Access Chrome DevTools**

Just take a **screenshot** of the app screen showing the debug panel at the bottom. It will display:
- Status (Available/Timeout/Waiting)
- Timing information
- Related window properties

That's enough for me to diagnose!

---

## ⚡ **TL;DR - Just Send Me**

1. **Screenshot or copy** all console logs with `[Bridge Debug]` and `[OneSignal]`
2. **Tell me:** Does device appear in OneSignal Dashboard? (Yes/No, with External ID if yes)
3. **Tell me:** `typeof window.NativelyNotifications` = ? (function or undefined)

That's all I need to know what the issue is! 🎯
