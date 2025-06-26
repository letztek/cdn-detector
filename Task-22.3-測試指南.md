# Task 22.3 Content Script Video Element Listener 測試指南

## 🚀 快速測試步驟

### 1. 重新載入擴展
```
1. 開啟 Chrome 瀏覽器
2. 進入 chrome://extensions/
3. 找到 "CDN Detector" 擴展
4. 點擊 "重新載入" 按鈕 🔄
```

### 2. 開啟專用測試頁面
```
在瀏覽器地址欄輸入：
chrome-extension://[擴展ID]/test-content-script.html

或者：
1. 右鍵點擊擴展圖標
2. 選擇 "檢查"
3. 在 Console 中輸入：
   chrome.tabs.create({url: chrome.runtime.getURL('test-content-script.html')});
```

### 3. 觀察測試結果

#### ✅ 成功指標：
- **Content Script 載入狀態** 應該顯示全部綠色 ✅
- **Console 日誌** 中應該看到 `[Video Quality Monitor]` 訊息
- **視頻檢測** 應該找到 2 個 video 元素
- **事件監聽** 播放視頻時應該有事件日誌

#### ❌ 失敗指標：
- 紅色 ❌ 狀態指示器
- Console 中沒有 Video Quality Monitor 日誌
- 通信測試失敗
- 視頻事件沒有觸發

## 🧪 詳細測試項目

### A. Content Script 基本功能
1. **載入檢查**：頁面載入後 10 秒內應該看到綠色狀態
2. **通信測試**：點擊 "測試通信" 應該返回成功響應
3. **平台檢測**：Console 中應該顯示當前平台（html5）

### B. 視頻元素檢測
1. **靜態檢測**：自動檢測到 2 個 HTML5 視頻元素
2. **動態檢測**：點擊 "添加動態視頻" 應該檢測到新視頻
3. **事件綁定**：每個視頻都應該有完整的事件監聽器

### C. 視頻事件監聽
1. **播放事件**：點擊播放應該觸發 `play`, `playing` 事件
2. **載入事件**：視頻載入時應該觸發 `loadstart`, `loadedmetadata` 等
3. **時間更新**：播放中應該持續觸發 `timeupdate` 事件

### D. 數據收集與通信
1. **獲取數據**：點擊 "獲取視頻品質數據" 應該返回當前標籤頁數據
2. **統計資訊**：點擊 "獲取統計資訊" 應該返回全域統計
3. **清除數據**：點擊 "清除數據" 應該成功清除並返回確認

## 🌐 真實網站測試

### YouTube 測試
```
1. 開啟 https://www.youtube.com/watch?v=dQw4w9WgXcQ
2. 按 F12 開啟開發者工具
3. 在 Console 中查看是否有 Video Quality Monitor 日誌
4. 播放視頻，觀察事件日誌
5. 執行：chrome.runtime.sendMessage({type: 'GET_VIDEO_QUALITY_DATA'}, console.log);
```

### Netflix 測試（需要帳號）
```
1. 開啟 Netflix 任意視頻
2. 檢查 Console 中的平台檢測結果
3. 確認視頻事件正常觸發
```

### Twitch 測試
```
1. 開啟 https://www.twitch.tv/
2. 進入任意直播間
3. 檢查平台檢測為 "twitch"
4. 觀察直播視頻的事件監聽
```

## 🔍 除錯檢查清單

### Console 日誌檢查
應該看到以下類型的日誌：
```
[Video Quality Monitor] [INFO] 視頻品質監控已載入 - 平台: html5
[Video Quality Monitor] [INFO] Starting comprehensive video element search...
[Video Quality Monitor] [INFO] Total video elements found: 2
[Video Quality Monitor] [INFO] 開始監控視頻元素: html5_xxx
```

### Background Script 檢查
1. 開啟 chrome://extensions/
2. 點擊 CDN Detector 的 "檢查視圖: Service Worker"
3. 在 Console 中應該看到視頻品質相關的日誌

### 網路檢查
1. 開啟 Network 標籤
2. 確認沒有 content script 載入錯誤
3. 檢查是否有跨域問題

## ⚠️ 常見問題解決

### 問題 1：Content Script 未載入
**症狀**：測試頁面顯示紅色狀態
**解決**：
1. 確認 manifest.json 中 content_scripts 配置正確
2. 重新載入擴展
3. 檢查是否有 JavaScript 錯誤

### 問題 2：視頻檢測失敗
**症狀**：顯示 "Total video elements found: 0"
**解決**：
1. 等待頁面完全載入
2. 檢查視頻元素是否在跨域 iframe 中
3. 嘗試手動觸發檢測

### 問題 3：事件不觸發
**症狀**：播放視頻但沒有事件日誌
**解決**：
1. 確認視頻元素可訪問
2. 檢查事件監聽器是否正確綁定
3. 嘗試不同的視頻源

### 問題 4：通信失敗
**症狀**：Background Script 通信錯誤
**解決**：
1. 確認擴展正確載入
2. 檢查 Service Worker 是否活躍
3. 重新載入擴展並重試

## 📊 效能驗證

### 記憶體使用
- 每個視頻監控 < 10KB
- 事件記錄限制在 1000 個
- 自動清理無效監控

### 響應時間
- Content Script 載入 < 100ms
- 視頻檢測 < 50ms
- 事件處理 < 1ms

### 相容性
- Chrome 88+
- Manifest V3
- 支援所有主流視頻網站

## ✅ 驗證完成標準

Task 22.3 被認為成功實現當所有以下條件滿足：

1. ✅ Content Script 正確注入並載入
2. ✅ 視頻元素檢測正常工作
3. ✅ 所有重要事件都能正確監聽
4. ✅ 與 Background Script 通信正常
5. ✅ 在多個平台測試通過
6. ✅ 動態內容檢測正常
7. ✅ 錯誤處理和清理機制有效
8. ✅ 效能指標符合要求

---

**完成測試後，請確保：**
- 所有測試項目都通過
- 沒有 Console 錯誤
- 記憶體使用正常
- 在真實網站上驗證功能 