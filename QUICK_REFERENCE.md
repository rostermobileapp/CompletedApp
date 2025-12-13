# 🎯 QUICK REFERENCE CARD

---

## 🔥 **THE FIX**

```
❌ OLD: window.NativelyNotifications (doesn't exist)
✅ NEW: window.OneSignal (works for web + native)
```

---

## 📁 **FILES CHANGED**

1. `client/src/hooks/useOneSignal.ts` - Simplified to use `window.OneSignal` only
2. `client/src/App.tsx` - Removed debug component

---

## 🚀 **DEPLOY STEPS**

```bash
# 1. Build
npm run build

# 2. Upload to BuildNatively
# (or push to git if auto-build enabled)

# 3. Download new APK

# 4. Test on device
```

---

## ✅ **SUCCESS = SEE THIS**

**Console:**
```
[OneSignal Web] ✓ OneSignal.login() SUCCESS for: LFB3Kf
```

**OneSignal Dashboard:**
```
External ID: LFB3Kf ✅
```

**Device:**
```
Test notification arrives! 🎉
```

---

## 📚 **DOCUMENTATION**

1. **`READ_ME_FIRST.md`** ← Start here
2. **`FINAL_FIX_SUMMARY.md`** ← Technical details
3. **`VERIFICATION_CHECKLIST.md`** ← Testing guide

---

## 🐛 **IF ISSUES**

```bash
# Check debug endpoint
curl -H "Authorization: Bearer TOKEN" \
  /api/notification-preferences/debug

# Look for:
"external_id": "LFB3Kf"
```

**Common Issues:**
- External ID blank → Check console for login success
- No notification → Check subscription status
- window.OneSignal undefined → Check OneSignal script loaded

---

## 💡 **KEY INSIGHT**

BuildNatively uses **standard OneSignal SDK**:
- Same as web push
- Same API methods
- Same `window.OneSignal` object
- No special "native" code needed!

---

## 🎉 **THAT'S IT!**

Simple fix, big impact. Test and report back!

---

**Need help?** Check `VERIFICATION_CHECKLIST.md` for detailed troubleshooting.
