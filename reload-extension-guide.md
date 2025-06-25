# 🔄 重新載入擴充功能 - 快速指南

## ⚠️ 重要：您需要重新載入擴充功能

您看到的錯誤 `DOMParser is not defined` 是因為擴充功能還在使用舊版本的程式碼。我們已經修復了這個問題，但需要重新載入擴充功能。

## 🚀 快速重新載入步驟

### 方法 1：使用重新載入按鈕（推薦）
1. 在 Chrome 位址列輸入：`chrome://extensions/`
2. 找到 **CDN Detector** 擴充功能
3. 點擊右下角的 **🔄 重新載入** 按鈕
4. 等待 2-3 秒，確認沒有錯誤訊息

### 方法 2：關閉再開啟
1. 在 `chrome://extensions/` 頁面
2. 找到 **CDN Detector**，關閉開關
3. 等待 2 秒
4. 再次開啟開關

### 方法 3：移除並重新載入（最徹底）
1. 在 `chrome://extensions/` 頁面
2. 點擊 **CDN Detector** 的「移除」按鈕
3. 點擊「載入未封裝項目」
4. 選擇 `cdn-tools` 資料夾
5. 確認載入成功

## ✅ 驗證重新載入成功

1. 開啟 `debug-manifest-detection.html`
2. 按 F12 開啟 DevTools Console
3. 點擊「測試 DASH」按鈕
4. 您應該看到：
   ```
   🎬 Manifest file detected: https://dash.akamaized.net/...
   📊 Starting DASH manifest parsing with regex-based parser
   ✅ DASH manifest parsed: X representations, DRM: false
   ```

## 🎯 預期結果

成功重新載入後，您不應該再看到 `DOMParser is not defined` 錯誤。

## 💡 提示

- 如果仍有問題，嘗試關閉所有 Chrome 視窗再重新開啟
- 確保沒有其他版本的 CDN Detector 同時執行
- 檢查是否有語法錯誤阻止擴充功能載入

---

**記住**：每次修改 `background.js` 後都需要重新載入擴充功能！ 