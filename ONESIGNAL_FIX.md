# OneSignal "Unexpected token '<'" Error - Fixed

## Problem

The error you encountered:
```
[OneSignal] External ID linking failed: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

This occurred because the OneSignal Web SDK v16 was trying to load a required Service Worker file (`OneSignalSDKWorker.js`) that didn't exist. Instead of getting JavaScript, the SDK received your HTML index page, causing a JSON parsing error.

## Root Cause

OneSignal Web SDK v16 requires Service Worker files to function properly. When these files are missing from the public directory:
1. The SDK tries to fetch `OneSignalSDKWorker.js`
2. The Vite dev server returns the HTML index page (404 fallback)
3. OneSignal tries to parse the HTML as JavaScript/JSON
4. Error: "Unexpected token '<'"

## Solution Applied

### 1. Created Service Worker File
Created `/workspace/client/public/OneSignalSDKWorker.js`:
```javascript
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js');
```

### 2. Updated OneSignal Configuration
Added proper Service Worker configuration in `useOneSignal.ts`:
```typescript
window.OneSignal.init({
  appId: options.appId,
  allowLocalhostAsSecureOrigin: true,
  // Service Worker configuration for Vite
  serviceWorkerParam: {
    scope: '/'
  },
  serviceWorkerPath: 'OneSignalSDKWorker.js',
  promptOptions: {
    autoPrompt: false,
  },
});
```

### 3. Fixed Async Login Handling
Updated the `login()` method to properly await the OneSignal login operation:
```typescript
await new Promise<void>((resolve, reject) => {
  window.OneSignal.push(async function() {
    try {
      await window.OneSignal.login(displayId);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
});
```

### 4. Updated HTML Comment
Fixed the version comment in `index.html` from "v5" to "v16" to match the actual SDK version.

## Testing

After these changes, OneSignal should:
1. ✅ Initialize successfully
2. ✅ Load the Service Worker without errors
3. ✅ Link external IDs properly
4. ✅ Store player IDs in your database

## Important Notes

- The Service Worker file must be in the `public` directory to be served correctly
- Service Workers require HTTPS in production (or localhost for development)
- The `allowLocalhostAsSecureOrigin: true` setting enables testing on localhost

## If Issues Persist

1. **Clear browser cache and service workers**:
   - Chrome DevTools → Application → Service Workers → Unregister
   - Application → Storage → Clear site data

2. **Check browser console** for:
   - Service Worker registration errors
   - Network errors when fetching the worker file

3. **Verify environment variables**:
   - `VITE_ONESIGNAL_APP_ID` is set correctly
   - OneSignal App ID matches your OneSignal dashboard

4. **Check OneSignal dashboard**:
   - App configuration
   - Web Push certificates (for production)

## Files Modified

- ✅ `/workspace/client/src/hooks/useOneSignal.ts`
- ✅ `/workspace/client/index.html`
- ✅ `/workspace/client/public/OneSignalSDKWorker.js` (created)
