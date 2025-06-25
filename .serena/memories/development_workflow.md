# 開發工作流程

## 任務完成後的標準流程
1. **代碼測試**: 在多個瀏覽器和網站上測試擴充功能
2. **Git 提交**: 
   ```bash
   git add .
   git commit -m "feat: 描述完成的功能"
   git push
   ```
3. **擴充功能重新載入**: 在 chrome://extensions/ 中重新載入擴充功能
4. **功能驗證**: 測試新功能是否正常運作

## 代碼風格和慣例
- **JavaScript**: 使用 ES6+ 語法
- **變數命名**: camelCase
- **常數命名**: UPPER_SNAKE_CASE
- **函數命名**: 動詞開頭，描述性
- **註解**: 中文註解用於複雜邏輯說明
- **錯誤處理**: 使用 try-catch 包裝關鍵操作
- **日誌**: 使用 console.log 進行調試，console.error 記錄錯誤

## Chrome 擴充功能特定慣例
- **權限**: 僅申請必要權限
- **Service Worker**: 使用 background.js 處理背景任務
- **Content Scripts**: 僅在必要時注入
- **Storage**: 使用 chrome.storage.local 儲存設定
- **Messaging**: 使用 chrome.runtime.sendMessage 進行通訊