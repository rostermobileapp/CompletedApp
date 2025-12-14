# Email to BuildNatively Support

**Subject:** OneSignal SDK Not Working - window.NativelyNotifications Undefined

---

Hi BuildNatively Support,

I'm trying to integrate OneSignal push notifications in my app but `window.NativelyNotifications` is undefined in my Android build, despite following all configuration steps.

## What I've Done

1. ✅ Enabled Firebase in BuildNatively project settings
2. ✅ Enabled OneSignal in BuildNatively project settings  
3. ✅ Created Firebase project and uploaded `google-services.json`
4. ✅ Package names match exactly between Firebase and BuildNatively
5. ✅ Added OneSignal SDK to my web app: `<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js">`
6. ✅ Rebuilt APK multiple times after configuration changes
7. ✅ Verified OneSignal App ID is correct in configuration

## Current Issue

After installing the APK on Android device:
- ❌ `window.NativelyNotifications` is **undefined**
- ❌ No devices appear in OneSignal Dashboard "All Users"
- ❌ Native push notifications don't work
- ✅ Web browser version works perfectly (External ID sets correctly)

## Configuration Details

- **BuildNatively Package Name:** `[YOUR_PACKAGE_NAME]`
- **Firebase Package Name:** `[SAME_PACKAGE_NAME]` (verified match)
- **OneSignal App ID:** `[YOUR_ONESIGNAL_APP_ID]`
- **OneSignal SDK Version:** v16 (web SDK)

## Console Logs from Android App

```
[OneSignal Native] Starting initialization...
[OneSignal] window.NativelyNotifications exists: undefined
[OneSignal] NativelyNotifications not available yet, starting polling...
[OneSignal] Poll attempt 1/40...
...
[OneSignal] ⏱️ Polling timeout after 20000 ms
[OneSignal] Falling back to Web Push SDK
```

The app polls for 20 seconds but `window.NativelyNotifications` never becomes available.

## Questions

1. **Does BuildNatively automatically add OneSignal Gradle dependencies when OneSignal is enabled?**
   - Specifically: `com.onesignal:OneSignal` and Firebase BoM?

2. **Should `window.NativelyNotifications` be automatically available when OneSignal is enabled?**
   - Or do I need additional configuration?

3. **Can you check my project's build logs to verify:**
   - OneSignal plugin was successfully installed?
   - Firebase Google Services plugin was applied?
   - `google-services.json` was found and processed?

4. **Is there a BuildNatively config file where I need to specify OneSignal?**
   - Like `natively.config.json` or similar?

5. **Are there any known issues with OneSignal v16 SDK and BuildNatively?**
   - Should I use a different version?

## Expected Behavior

According to your documentation, I should be able to use:
```javascript
const notifications = new NativelyNotifications();
notifications.setExternalId({ externalId: 'user123' }, callback);
```

But `NativelyNotifications` constructor is undefined in my build.

## Firebase Documentation Says Required

Firebase docs state I need this Gradle configuration:
```gradle
// build.gradle.kts
plugins {
  id("com.google.gms.google-services") version "4.4.4" apply false
}

// app/build.gradle.kts  
plugins {
  id("com.google.gms.google-services")
}

dependencies {
  implementation(platform("com.google.firebase:firebase-bom:34.7.0"))
}
```

**Is BuildNatively adding this automatically, or do I need to configure something?**

## Request

Please either:
1. Tell me what configuration I'm missing to make `window.NativelyNotifications` available
2. Or confirm if BuildNatively doesn't fully support OneSignal native integration yet
3. Or provide alternative approach to get OneSignal working with BuildNatively

Thank you!

---

**Project ID:** [YOUR_BUILDNATIVELY_PROJECT_ID]
**Latest Build ID:** [YOUR_BUILD_ID if you have it]
