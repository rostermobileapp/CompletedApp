# OneSignal Web Diagnostic - "Permission blocked" on HTTPS

## 🔍 **Run These Checks**

### Check 1: Notification Permission Status

Open browser console (F12) and run:

```javascript
console.log('Permission:', Notification.permission);
```

**What does it say?**
- `"default"` ✅ Good - hasn't been set yet
- `"granted"` ✅ Good - already granted
- `"denied"` ❌ **This is your problem** - previously blocked

### Check 2: Secure Context

```javascript
console.log('Secure Context:', window.isSecureContext);
console.log('Protocol:', window.location.protocol);
```

**Should show:**
- `Secure Context: true`
- `Protocol: "https:"`

### Check 3: Service Worker Registration

```javascript
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs.length);
  regs.forEach(reg => {
    console.log('SW Scope:', reg.scope);
    console.log('SW State:', reg.active?.state);
  });
});
```

**Should show at least 1 registration for OneSignal**

### Check 4: Browser Notification Settings

**Chrome/Edge:**
1. Click lock icon 🔒 in address bar
2. Click "Site settings" or "Permissions"
3. Look for "Notifications"
4. **Take a screenshot and share**

**What does it show?**
- "Ask (default)" ✅ Good
- "Allow" ✅ Good
- "Block" ❌ **This is blocking it**

---

## 🔧 **Most Likely Fixes**

### Fix 1: Reset Notification Permission (If "denied" or "Block")

**Chrome/Edge:**
1. Click lock icon 🔒 in address bar
2. Site Settings
3. Notifications → Change from "Block" to "Ask" or "Allow"
4. **Close all tabs for this site**
5. Reopen and try again

**Firefox:**
1. Click lock icon 🔒
2. Click ">" arrow next to "Permissions"
3. Find "Receive Notifications"
4. Click "X" to remove the blocked status
5. Refresh page

### Fix 2: Clear Site Data (Nuclear Option)

**Chrome DevTools:**
1. F12 → Application tab
2. Left sidebar → "Storage"
3. Click "Clear site data"
4. Check all boxes
5. Click "Clear site data"
6. Refresh page and login again

### Fix 3: Test in Incognito/Private Window

**To isolate the issue:**
1. Open Incognito/Private window
2. Go to your site (will be HTTPS)
3. Login
4. Try enabling notifications
5. **Does it work there?**
   - If YES → Your regular browser has saved "blocked" setting
   - If NO → Different issue (continue diagnosis)

---

## 🎯 **If Permission is "denied"**

This is the most common cause. Your browser remembers you previously clicked "Block".

**The fix:**

### Chrome/Edge Full Reset:

1. **Step 1:** Go to `chrome://settings/content/notifications`
2. **Step 2:** Look under "Not allowed to send notifications"
3. **Step 3:** Find your site URL in the list
4. **Step 4:** Click the 🗑️ trash icon to remove it
5. **Step 5:** Close ALL tabs for your site
6. **Step 6:** Reopen and try again

### Firefox Full Reset:

1. Go to `about:preferences#privacy`
2. Scroll to "Permissions" section
3. Click "Settings" next to "Notifications"
4. Find your site in the list
5. Select it and click "Remove Website"
6. Click "Save Changes"
7. Refresh your site

---

## 🔴 **If Service Worker is Missing**

If Check 3 shows 0 service workers, that's the problem.

### Verify Service Worker File Exists:

Go to: `https://YOUR_SITE.com/OneSignalSDKWorker.js`

**Should show:**
```javascript
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
```

**If 404 error:**
- The file is missing from your `/public` folder
- OneSignal can't register for push
- Fix: Verify `/client/public/OneSignalSDKWorker.js` exists

### Register Service Worker Manually (for testing):

```javascript
navigator.serviceWorker.register('/OneSignalSDKWorker.js')
  .then(reg => console.log('SW registered:', reg))
  .catch(err => console.error('SW registration failed:', err));
```

---

## 🧪 **Complete Diagnostic Output**

Please run ALL these checks and share the output:

```javascript
// Copy/paste this entire block into browser console:

console.log('=== OneSignal Web Diagnostics ===');

console.log('1. Permission:', Notification.permission);
console.log('2. Secure Context:', window.isSecureContext);
console.log('3. Protocol:', window.location.protocol);
console.log('4. Hostname:', window.location.hostname);

navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('5. Service Workers:', regs.length);
  regs.forEach((reg, i) => {
    console.log(`   SW ${i+1}:`, {
      scope: reg.scope,
      state: reg.active?.state,
      scriptURL: reg.active?.scriptURL
    });
  });
});

// Check if OneSignal SDK is loaded
console.log('6. OneSignal loaded:', typeof window.OneSignal !== 'undefined');
console.log('7. OneSignal User ID:', window.OneSignal?.User?.PushSubscription?.id || 'Not available');

// Check browser
console.log('8. User Agent:', navigator.userAgent);

console.log('=== End Diagnostics ===');
```

**Share the complete output from this.**

---

## 📊 **What to Check in OneSignal Dashboard**

Even though subscription is failing, External ID might still be set.

**Go to:** OneSignal Dashboard → Audience → All Users

**Look for your user (search by External ID: "LFB3Kf")**

**Does it show:**
- External ID: `LFB3Kf` ✅ (This part is working!)
- Subscribed: ❌ (This is what's failing)

This confirms External ID works, but subscription is blocked by browser.

---

## 🎯 **Expected Resolution**

After resetting notification permissions:

1. Notification.permission should be `"default"` or `"granted"`
2. Browser settings should show "Ask" or "Allow"
3. When you enable notifications, you should see:
   ```
   [OneSignal Web] Permission changed to: granted  ← Not "denied"
   [OneSignal Web] Subscription ID changed to: [ID]
   ```
4. No "Permission blocked" error
5. OneSignal dashboard shows user as "Subscribed" ✅

---

## ⚡ **Quick Test**

**Run this RIGHT NOW in console:**

```javascript
Notification.requestPermission().then(result => {
  console.log('Direct permission test:', result);
});
```

**What happens?**
- Browser asks for permission → Click "Allow" → Shows `"granted"` ✅ **Browser is OK**
- Shows `"denied"` immediately (no prompt) ❌ **Permission is blocked - need reset**
- Error message ❌ **Service Worker or other issue**

---

## 📞 **What to Share**

Please share:

1. **Output from the "Complete Diagnostic Output" code block above**
2. **Screenshot of browser address bar** (showing lock icon 🔒)
3. **Screenshot of Site Settings → Notifications** (after clicking lock icon)
4. **Result from `Notification.requestPermission()` test**
5. **What browser are you using?** (Chrome, Firefox, Edge, Safari?)

With this info, I can pinpoint the exact issue!

---

*OneSignal Web Diagnostic Guide - December 12, 2025*
