# CDN Detector 調試工具使用指南

## 🎯 如何正確開啟 debug-video.html

`debug-video.html` 是 CDN Detector 擴充功能的調試工具，用於測試和調試影片品質監控功能。

### ⚠️ 重要提醒
此調試頁面**必須在 Chrome 擴充功能環境中開啟**才能正常工作。直接雙擊 HTML 檔案或在檔案系統中開啟將無法使用 Chrome 擴充功能 API。

### 📋 正確開啟步驟

#### 方法一：通過擴充功能 ID 開啟

1. **開啟 Chrome 擴充功能管理頁面**
   - 在瀏覽器網址列輸入：`chrome://extensions/`
   - 或者點擊 Chrome 選單 → 更多工具 → 擴充功能

2. **找到 CDN Detector 擴充功能**
   - 在擴充功能列表中找到 "CDN Detector"
   - 確保擴充功能已啟用

3. **複製擴充功能 ID**
   - 點擊 "詳細資料" 按鈕
   - 在詳細資料頁面中找到 "ID" 欄位
   - 複製這個 ID（通常是一串英文字母，例如：`abcdefghijklmnopqrstuvwxyzabcdef`）

4. **開啟調試頁面**
   - 在瀏覽器網址列輸入：`chrome-extension://[擴充功能ID]/debug-video.html`
   - 將 `[擴充功能ID]` 替換為步驟 3 複製的 ID
   - 按 Enter 鍵開啟頁面

#### 方法二：開發者模式（推薦）

1. **啟用開發者模式**
   - 在 `chrome://extensions/` 頁面
   - 開啟右上角的 "開發人員模式" 開關

2. **找到 CDN Detector**
   - 在擴充功能卡片中會顯示更多資訊
   - 找到 "檢查檢視畫面" 區域

3. **直接開啟調試頁面**
   - 如果有 "background page" 或類似選項，點擊它
   - 在開發者工具的 Console 中輸入：`chrome.tabs.create({url: 'debug-video.html'})`

### 🔧 驗證是否正確開啟

正確開啟後，您應該看到：
- ✅ Chrome 擴展 API 可用
- ✅ Background Script 通信正常
- 頁面 URL 以 `chrome-extension://` 開頭

如果看到錯誤訊息，請檢查：
- 是否按照上述步驟正確開啟
- 擴充功能是否已正確安裝並啟用
- 是否有權限問題

### 🐛 常見問題

**Q: 看到 "Chrome 擴展 API 不可用" 錯誤**
A: 這表示您沒有在擴充功能環境中開啟頁面，請按照上述步驟重新開啟。

**Q: Background Script 通信失敗**
A: 可能是擴充功能沒有正確載入，請嘗試重新載入擴充功能或重啟瀏覽器。

**Q: 找不到擴充功能 ID**
A: 請確保已安裝 CDN Detector 擴充功能，並在 chrome://extensions/ 頁面中啟用它。

### 📞 需要幫助？

如果仍然無法正常使用，請檢查：
1. Chrome 瀏覽器版本是否為最新
2. 擴充功能是否正確安裝
3. 是否有其他擴充功能衝突
4. 瀏覽器控制台是否有錯誤訊息 