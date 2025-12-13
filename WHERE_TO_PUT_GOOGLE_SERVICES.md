# 🎯 **Where to Put `google-services.json`**

## ✅ **ANSWER: Project Root**

Place your `google-services.json` file here:

```
/workspace/google-services.json
```

**Full path structure:**
```
/workspace/
├── client/
├── server/
├── mobile/
├── package.json
├── google-services.json  ← PUT IT HERE
└── ... other files
```

---

## 📤 **How to Upload**

### **If you're in Cursor/VS Code:**
1. Drag and drop `google-services.json` into your workspace root folder
2. Or use "Upload Files" in the file explorer

### **If you're using Git:**
1. Copy `google-services.json` to `/workspace/`
2. **Don't commit it** (it's now in `.gitignore` for security)
3. Upload it separately to BuildNatively if they have a file upload feature

---

## 🔐 **Security Note**

I've added `google-services.json` to your `.gitignore` file to prevent accidentally committing sensitive Firebase keys to version control.

---

## 🔧 **BuildNatively-Specific Instructions**

### **Option A: Include in Project (Recommended for BuildNatively)**

1. Place `google-services.json` in `/workspace/`
2. BuildNatively will detect it during build
3. Rebuild your APK

### **Option B: Upload via BuildNatively Dashboard**

Some BuildNatively setups require you to:
1. Go to BuildNatively Dashboard → Your Project → Settings
2. Find "Android Configuration" or "Firebase" section
3. Upload `google-services.json` there
4. Rebuild your APK

**Check BuildNatively docs to see which method they use.**

---

## ✅ **After Placing the File**

1. **Rebuild APK** on BuildNatively
2. **Install new APK** on device
3. **Launch app** and check console

**You should now see:**
```
[OneSignal Native] window.NativelyNotifications exists: function ✅
[OneSignal Native] ✓ SDK instance created
[OneSignal Native] ✓ External ID set: LFB3Kf
```

---

## 🎉 **This Should Fix Everything!**

The reason `window.NativelyNotifications` was undefined is because Firebase Cloud Messaging wasn't configured. Now that you have:

1. ✅ Enabled Firebase notifications in BuildNatively
2. ✅ Created `google-services.json`
3. ⏳ Need to place it in project root
4. ⏳ Rebuild APK

**This should make `window.NativelyNotifications` available!**

---

**Once you place the file, rebuild your APK and let me know the results!** 🚀
