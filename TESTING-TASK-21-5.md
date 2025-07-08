# Task 21.5 安全檢測模組測試指南

## 🔧 修復 CSP 錯誤 

### ✅ **已修復問題**
- **問題 1**: `eval()` 被 Chrome Extension CSP 政策阻止
- **解決方案**: 使用 `importScripts()` 替代 `eval()` 
- **修改檔案**: `background.js` - 移除所有 `eval()` 呼叫

### ✅ **已修復問題 2**
- **問題**: importScripts 重複載入造成變數重複宣告
- **解決方案**: 新增重複載入檢查機制
- **修改檔案**: `background.js` - 新增 `executeScriptAndWait` 重複檢查邏輯

## 🧪 **測試步驟**

### 1. **重新載入擴充功能**
1. 前往 `chrome://extensions/`
2. 找到 "CDN Detector" 擴充功能
3. 點擊重新載入按鈕 🔄
4. 檢查是否有錯誤提示

### 2. **檢查 Service Worker 日誌**
1. 在擴充功能頁面點擊 "service worker" 連結
2. 開啟 Service Worker 控制台
3. 檢查載入日誌，應該看到：
   ```
   [Background] Loading modules...
   [Background] MessageRouter initialized
   [Background] CDN Detection Module initialized
   [Background] Video Quality Module initialized  
   [Background] Security Detection Module initialized
   [Background] Security module integrated with CDN detection
   [Background] All modules loaded successfully
   ```

### 3. **執行自動測試**
1. 在 Service Worker 控制台執行：
   ```javascript
   // 載入測試工具
   importScripts('test-module-loading.js');
   
   // 執行測試
   testModuleLoading();
   ```

### 4. **手動功能測試**

#### **4.1 檢查擴展狀態**
```javascript
// 在 Service Worker 控制台執行
getExtensionStatus();
```
**預期結果**:
```javascript
{
  modulesLoaded: true,
  legacyBackgroundLoaded: false,
  messageRouter: true,
  cdnDetectionModule: true,
  videoQualityModule: true,
  securityDetectionModule: true
}
```

#### **4.2 測試安全檢測 API**
```javascript
// 健康檢查
chrome.runtime.sendMessage({type: 'health-check'}, console.log);

// 獲取安全檢測結果
chrome.runtime.sendMessage({type: 'getSecurityDetection'}, console.log);

// 切換安全檢測狀態
chrome.runtime.sendMessage({
  type: 'toggleSecurityDetection', 
  enabled: true
}, console.log);
```

### 5. **實際網站測試**

#### **5.1 高安全性網站**
1. 訪問 `https://github.com`
2. 開啟擴充功能 popup
3. 檢查是否顯示 CDN 檢測結果
4. 在控制台執行：
   ```javascript
   chrome.runtime.sendMessage({type: 'getSecurityDetection'}, console.log);
   ```

#### **5.2 低安全性網站** 
1. 訪問 HTTP 網站（如 `http://example.com`）
2. 重複上述檢測步驟
3. 比較安全評分差異

### 6. **CDN 功能零影響驗證**

#### **6.1 確認現有功能正常**
1. 訪問任何網站
2. 開啟 CDN Detector popup
3. 確認 CDN 檢測功能完全正常
4. 檢查檢測日誌、統計資料等功能

#### **6.2 錯誤隔離測試**
1. 在 Service Worker 控制台故意觸發安全檢測錯誤：
   ```javascript
   // 測試錯誤隔離
   securityDetectionModule.analyzeResponseSecurity(999, 'invalid-url', null, true);
   ```
2. 確認 CDN 檢測功能不受影響

## 🎯 **成功標準**

### ✅ **模組載入**
- [ ] 無 CSP eval 錯誤
- [ ] 所有模組成功載入
- [ ] Service Worker 無錯誤日誌

### ✅ **功能正常**
- [ ] `getExtensionStatus()` 返回正確狀態
- [ ] 安全檢測 API 正常回應
- [ ] CDN 檢測功能完全正常

### ✅ **整合測試**
- [ ] 安全檢測與 CDN 檢測並行運行
- [ ] 錯誤隔離機制有效
- [ ] 效能無明顯影響

### ✅ **實際應用**
- [ ] 可檢測不同網站的安全配置
- [ ] 安全評分系統運作正常
- [ ] Mixed Content 檢測功能正常

## 🚨 **故障排除**

### **問題 1: 模組載入失敗**
- **解決**: 檢查 `src/service-worker/` 目錄下所有 `.js` 檔案是否存在
- **檢查**: Service Worker 控制台的詳細錯誤訊息

### **問題 2: Legacy 模式啟動**
- **原因**: 新模組載入失敗，系統自動回退
- **解決**: 檢查模組載入錯誤，修復後重新載入擴充功能

### **問題 3: 安全檢測無回應**
- **檢查**: `securityDetectionModule` 是否正確載入
- **測試**: 執行 `testSecurityModule()` 檢查具體錯誤

### **問題 4: CDN 功能受影響**
- **檢查**: 安全檢測錯誤是否被正確隔離
- **確認**: `cdnDetectionModule.setSecurityModule()` 是否正確執行

## 📋 **測試檢查清單**

```
🔄 重新載入擴充功能
📊 檢查 Service Worker 載入日誌  
🧪 執行自動測試工具
🔍 驗證 getExtensionStatus()
🌐 測試實際網站檢測
✅ 確認 CDN 功能正常
🛡️ 驗證錯誤隔離機制
📈 檢查效能影響
```

## 🎉 **測試完成後**

如果所有測試通過，Task 21.5 (安全檢測模組) 已成功實現並整合！

下一步可以：
1. 繼續 Task 22 (Content Script Injection Framework) 
2. 或優先實施 Task 24-25 (通訊協定和錯誤隔離)
3. 開始實施 UI 介面來展示安全檢測結果