# ✅ BuildNatively Firebase Configuration Checklist

## ⚠️ IMPORTANT

You're using **BuildNatively** (not native Android development), so:
- ❌ **DO NOT** edit Gradle files (you can't access them anyway)
- ❌ **DO NOT** follow standard Firebase Android setup guides
- ✅ **DO** configure everything through BuildNatively's dashboard

---

## 🔍 **Step-by-Step Verification**

### **Step 1: Verify BuildNatively OneSignal Configuration**

Login to BuildNatively → Your Project → Settings

**Look for a section called one of these:**
- "Push Notifications"
- "OneSignal"
- "Notifications"
- "Integrations"
- "Plugins"

**What you need to verify:**

#### **1A: Is OneSignal Integration Enabled?**
- [ ] There should be a toggle/checkbox for "OneSignal" or "Push Notifications"
- [ ] It should be **ON/Enabled** ✅
- [ ] There should be a field for "OneSignal App ID"
- [ ] Your OneSignal App ID should be entered: `___________________________`

**Screenshot this and send it to me!**

#### **1B: OneSignal App ID Verification**
Your OneSignal App ID in BuildNatively **must match** your actual OneSignal App ID.

**To verify:**
1. Go to OneSignal Dashboard → Settings → Keys & IDs
2. Copy your "OneSignal App ID" (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
3. Compare with BuildNatively settings
4. **Must be EXACTLY the same**

---

### **Step 2: Verify Firebase Configuration in BuildNatively**

Still in BuildNatively → Your Project → Settings

**Look for:**
- "Firebase"
- "Firebase Cloud Messaging" 
- "FCM"
- "Google Services"
- "Android Configuration"

#### **2A: Is Firebase/FCM Enabled?**
- [ ] Toggle/checkbox should be **ON** ✅
- [ ] There should be a place to upload `google-services.json`
- [ ] It should show "google-services.json uploaded" or similar confirmation

#### **2B: FCM Server Key (if required)**
Some BuildNatively setups also need the FCM Server Key:

- [ ] Look for "FCM Server Key" or "Firebase Server Key" field
- [ ] If it exists, you need to fill it:

**To get FCM Server Key:**
1. Go to Firebase Console → Your Project
2. Click gear icon → Project Settings
3. Go to "Cloud Messaging" tab
4. Find "Server Key" (under Cloud Messaging API)
5. Copy it
6. Paste into BuildNatively

**Screenshot the BuildNatively Firebase section and send it to me!**

---

### **Step 3: Verify Package Name Match**

This is critical - if package names don't match, nothing works.

#### **3A: Get BuildNatively Package Name**
In BuildNatively → Your Project → Settings:
- Look for "Package Name", "Application ID", or "Bundle ID"
- Should be something like: `com.yourcompany.yourapp`
- **Write it down:** `_________________________________`

#### **3B: Check google-services.json**
Download or view your `google-services.json` file:

```json
{
  "project_info": {...},
  "client": [
    {
      "client_info": {
        "android_client_info": {
          "package_name": "com.yourcompany.yourapp" ← THIS
        }
      }
    }
  ]
}
```

**The `package_name` in google-services.json MUST EXACTLY MATCH BuildNatively's package name.**

#### **3C: If They Don't Match**
1. Go back to Firebase Console
2. Project Settings → Your apps
3. Click Android app
4. Check package name - if wrong, you need to:
   - Add a NEW Android app with correct package name
   - Download NEW `google-services.json`
   - Upload to BuildNatively
   - Rebuild

---

### **Step 4: Check BuildNatively Build Logs**

After your last build:
- BuildNatively → Your Project → Builds → Latest Build → View Logs

**Look for these lines:**
- ✅ "google-services.json found" or "Google Services plugin applied"
- ✅ "OneSignal plugin installed" or "OneSignal SDK added"
- ✅ "Firebase initialized" or "FCM configured"
- ❌ Any errors mentioning "google-services", "OneSignal", "Firebase", or "FCM"

**Copy any relevant log lines and send them to me!**

---

### **Step 5: Verify OneSignal Dashboard Configuration**

Go to OneSignal Dashboard → Settings → Platforms → Google Android (FCM)

#### **5A: Is Android Platform Configured?**
- [ ] "Google Android (FCM)" should be listed ✅
- [ ] It should show "Configured" or "Active" status

#### **5B: FCM Server Key in OneSignal**
- [ ] There should be a "Firebase Server Key" field
- [ ] It should be filled in

**To get/verify:**
1. Firebase Console → Project Settings → Cloud Messaging
2. Copy "Server Key"
3. Go to OneSignal → Settings → Platforms → Google Android (FCM)
4. Paste Server Key
5. Save Configuration

**Screenshot OneSignal's Android platform settings and send it to me!**

---

## 🎯 **What You Need to Send Me**

To diagnose the issue, I need:

1. **Screenshot: BuildNatively OneSignal Settings**
   - Show if OneSignal is enabled
   - Show OneSignal App ID field (can blur the ID if needed)

2. **Screenshot: BuildNatively Firebase Settings**
   - Show if Firebase/FCM is enabled
   - Show google-services.json upload status

3. **Text: Package Names**
   - BuildNatively package name: `__________`
   - google-services.json package name: `__________`
   - Do they match? Yes/No

4. **Screenshot: Build Logs**
   - Any lines mentioning OneSignal, Firebase, or google-services
   - Any error messages

5. **Screenshot: OneSignal Android Platform**
   - Show Google Android (FCM) configuration status

6. **Console Output from New APK:**
   ```
   window.NativelyNotifications: [undefined/function?]
   window.natively: [undefined/object?]
   ```

---

## 🔧 **Common Issues**

### **Issue: "I don't see OneSignal settings in BuildNatively"**

**This means:** BuildNatively might not have OneSignal as a built-in integration.

**Solution:** Contact BuildNatively support and ask:
> "How do I enable OneSignal push notifications for my app? 
> I've uploaded google-services.json but window.NativelyNotifications 
> is undefined. Do I need to enable something in project settings?"

---

### **Issue: "I don't see Firebase settings in BuildNatively"**

**This means:** BuildNatively might automatically handle Firebase if google-services.json is uploaded.

**Check:**
- Is there a "Files" or "Assets" section where you uploaded google-services.json?
- Did you get a confirmation that it was uploaded successfully?
- Try uploading it again to be sure

---

### **Issue: "Package names don't match"**

**Solution:**
1. Note the CORRECT package name from BuildNatively
2. Go to Firebase Console → Project Settings → Your apps
3. Add NEW Android app with CORRECT package name
4. Download NEW google-services.json
5. Upload NEW file to BuildNatively
6. Rebuild

---

## 🚨 **Critical Question for BuildNatively Support**

If you can't find clear OneSignal/Firebase settings, contact BuildNatively support with:

---

**Subject:** How to enable OneSignal with Firebase for push notifications?

**Message:**

Hi BuildNatively Support,

I'm trying to integrate OneSignal push notifications with Firebase Cloud Messaging in my app.

**What I've done:**
1. Created Firebase project
2. Generated google-services.json
3. Uploaded to BuildNatively [WHERE? - describe where you uploaded it]
4. Rebuilt APK

**Issue:**
`window.NativelyNotifications` is undefined in my app, so I can't use OneSignal's native API.

**Questions:**
1. Do I need to enable OneSignal integration in my BuildNatively project settings? Where?
2. Do I need to enable Firebase/FCM separately? Where?
3. Do I need to provide my OneSignal App ID to BuildNatively? Where?
4. Do I need to provide FCM Server Key to BuildNatively? Where?
5. Are there any other configuration steps I'm missing?

**My Configuration:**
- BuildNatively Package Name: [YOUR_PACKAGE_NAME]
- OneSignal App ID: [YOUR_ONESIGNAL_APP_ID]
- google-services.json: Uploaded [WHERE?]

**Expected:**
Your documentation shows I should be able to use:
```javascript
const notifications = new NativelyNotifications();
```

But `window.NativelyNotifications` is undefined.

Please advise on the complete setup steps.

Thank you!

---

---

## 📋 **Bottom Line**

You're using BuildNatively, which is a **wrapper service**. They handle all the native Android/Gradle configuration.

**You should NOT need to:**
- ❌ Edit build.gradle files
- ❌ Edit Android manifest
- ❌ Install Gradle plugins manually
- ❌ Add Firebase dependencies manually

**BuildNatively should do all that automatically if:**
- ✅ OneSignal is enabled in their settings
- ✅ Firebase/FCM is enabled in their settings
- ✅ google-services.json is uploaded correctly
- ✅ Package names match

---

**Please check BuildNatively settings and send me those screenshots so I can see what's actually configured!**
