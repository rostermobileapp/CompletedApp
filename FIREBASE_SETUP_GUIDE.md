# 🔥 Firebase Setup for BuildNatively + OneSignal

## ✅ **What You've Done**
1. ✅ Enabled Firebase notifications in BuildNatively
2. ✅ Created `google-services.json` file from Firebase Console

## 📁 **Where to Place `google-services.json`**

For BuildNatively, the file location depends on their build system:

### **Option 1: Project Root (Most Common)**
```
/workspace/google-services.json
```

This is typically where BuildNatively expects it for React apps.

### **Option 2: Mobile Directory (If Using Expo/React Native)**
```
/workspace/mobile/google-services.json
```

If your BuildNatively project uses the `/mobile` directory for native configuration.

### **Option 3: Android-Specific Directory (Less Common for BuildNatively)**
```
/workspace/android/app/google-services.json
```

Only if BuildNatively generates an `android/` directory.

---

## 🚀 **RECOMMENDED: Place in Project Root**

Since you're using BuildNatively with a React web app, place it here:

```
/workspace/google-services.json
```

**Important:** 
- Keep the filename exactly as: `google-services.json`
- Don't rename it
- Don't change its contents

---

## 🔒 **Security: Add to .gitignore**

After placing the file, make sure it's not committed to git:

```bash
# Add to .gitignore
echo "google-services.json" >> .gitignore
```

**Why?** This file contains sensitive Firebase keys and should not be in version control.

---

## 📋 **After Placing the File**

1. **Commit your code changes** (everything except `google-services.json`)
2. **Upload `google-services.json` to BuildNatively**:
   - Some BuildNatively setups require you to upload it via their dashboard
   - Others automatically detect it in your repository
   - Check BuildNatively docs for your specific setup

3. **Trigger new build** on BuildNatively
4. **Install new APK** on device
5. **Test!** `window.NativelyNotifications` should now be available

---

## ✅ **How to Verify**

After rebuilding and installing:

1. Launch app
2. Check console (Chrome DevTools)
3. Should see:
   ```
   [OneSignal Native] Starting initialization...
   [OneSignal Native] window.NativelyNotifications exists: function ✅
   [OneSignal Native] ✓ SDK instance created
   ```

4. Check OneSignal Dashboard:
   - Device should appear
   - **External ID: `LFB3Kf`** ✅

---

## 🐛 **If Still Not Working After Rebuild**

1. **Check BuildNatively build logs** for:
   - "google-services.json found" or similar
   - Firebase plugin installation
   - OneSignal plugin installation

2. **Verify in BuildNatively Dashboard**:
   - Firebase Cloud Messaging is enabled
   - Server Key is configured
   - `google-services.json` is uploaded (if required)

3. **Contact BuildNatively support** if `window.NativelyNotifications` is still undefined after rebuild

---

## 📝 **Next Steps**

1. Upload/place `google-services.json` in your project
2. Add it to `.gitignore`
3. Rebuild APK via BuildNatively
4. Install and test
5. Report back! 🎉

---

**This should fix the `window.NativelyNotifications: undefined` issue!**
